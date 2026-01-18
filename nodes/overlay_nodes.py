"""
Parameter Overlay Nodes for ComfyAngel.

These nodes add visual parameter information to images.
"""

import os
import hashlib
import torch
import numpy as np
from PIL import Image, ImageOps, ImageSequence

from ..utils.tensor_ops import ensure_bhwc, to_pil, from_pil, clone_tensor
from ..utils.metadata_parser import read_image_metadata, GenerationParams, parse_a1111_format, parse_comfyui_format
from ..utils.text_renderer import TextRenderer

# Try to import folder_paths from ComfyUI
try:
    import folder_paths
except ImportError:
    folder_paths = None


class LoadImageWithMetadata:
    """
    Load image and extract its metadata.

    Like ComfyUI's LoadImage but also outputs metadata for overlay.
    Supports A1111 and ComfyUI metadata formats.
    """

    @classmethod
    def INPUT_TYPES(cls):
        if folder_paths:
            input_dir = folder_paths.get_input_directory()
            files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        else:
            files = []

        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING")
    RETURN_NAMES = ("image", "mask", "metadata_raw", "metadata_formatted")
    FUNCTION = "load_image"
    CATEGORY = "ComfyAngel/Loader"

    def load_image(self, image):
        if not folder_paths:
            raise RuntimeError("folder_paths not available")

        image_path = folder_paths.get_annotated_filepath(image)

        # Load image
        img = Image.open(image_path)

        # Handle EXIF orientation
        img = ImageOps.exif_transpose(img)

        # Store raw metadata before any conversion
        raw_metadata = ""
        if "parameters" in img.info:
            raw_metadata = img.info["parameters"]
        elif "prompt" in img.info:
            raw_metadata = img.info["prompt"]

        # Parse metadata
        params = read_image_metadata(image_path)
        print(f"[ComfyAngel] LoadImageWithMetadata: raw_metadata length = {len(raw_metadata)}")
        print(f"[ComfyAngel] LoadImageWithMetadata: params.seed = {params.seed}")
        print(f"[ComfyAngel] LoadImageWithMetadata: params.model = {params.model}")
        print(f"[ComfyAngel] LoadImageWithMetadata: params.steps = {params.steps}")
        print(f"[ComfyAngel] LoadImageWithMetadata: params.positive_prompt = {params.positive_prompt[:100] if params.positive_prompt else None}...")
        print(f"[ComfyAngel] LoadImageWithMetadata: params.negative_prompt = {params.negative_prompt[:100] if params.negative_prompt else None}...")

        overlay_lines = params.format_overlay(show_prompt=True, max_prompt_len=200)
        print(f"[ComfyAngel] LoadImageWithMetadata: overlay_lines = {overlay_lines}")

        if overlay_lines:
            formatted_metadata = "\n".join(overlay_lines)
        elif raw_metadata:
            # Fallback: use raw metadata if parsing failed
            formatted_metadata = raw_metadata[:500]  # Truncate if too long
        else:
            formatted_metadata = "No metadata found"

        # Convert to RGB if needed
        if img.mode == "I":
            img = img.point(lambda i: i * (1 / 255))
        image_rgb = img.convert("RGB")

        # Convert to tensor
        image_np = np.array(image_rgb).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np).unsqueeze(0)

        # Handle mask (alpha channel)
        if "A" in img.getbands():
            mask_np = np.array(img.getchannel("A")).astype(np.float32) / 255.0
            mask_tensor = 1.0 - torch.from_numpy(mask_np).unsqueeze(0)
        else:
            mask_tensor = torch.zeros((1, image_np.shape[0], image_np.shape[1]), dtype=torch.float32)

        return (image_tensor, mask_tensor, raw_metadata, formatted_metadata)

    @classmethod
    def IS_CHANGED(cls, image):
        if not folder_paths:
            return ""
        image_path = folder_paths.get_annotated_filepath(image)
        m = hashlib.sha256()
        with open(image_path, "rb") as f:
            m.update(f.read())
        return m.hexdigest()

    @classmethod
    def VALIDATE_INPUTS(cls, image):
        if not folder_paths:
            return "folder_paths not available"
        if not folder_paths.exists_annotated_filepath(image):
            return f"Invalid image file: {image}"
        return True


class ParameterParser:
    """
    Parse metadata string and extract generation parameters.

    Takes raw metadata (from Load Image + Metadata or pasted text)
    and outputs individual values + formatted summary.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "metadata": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "placeholder": "Paste raw metadata here or connect from Load Image + Metadata"
                }),
            },
            "optional": {
                "show_prompt": ("BOOLEAN", {"default": True}),
                "max_prompt_length": ("INT", {"default": 100, "min": 20, "max": 500, "step": 10}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "INT", "INT", "FLOAT", "STRING", "STRING")
    RETURN_NAMES = ("formatted", "model", "sampler", "seed", "steps", "cfg", "positive_prompt", "negative_prompt")
    FUNCTION = "parse"
    CATEGORY = "ComfyAngel/Utility"

    def parse(self, metadata: str, show_prompt: bool = True, max_prompt_length: int = 100):
        if not metadata.strip():
            return ("No metadata", "", "", 0, 0, 0.0, "", "")

        # Parse based on format
        if metadata.strip().startswith("{"):
            params = parse_comfyui_format(metadata)
        elif "Steps:" in metadata:
            params = parse_a1111_format(metadata)
        else:
            # Try ComfyUI format anyway
            params = parse_comfyui_format(metadata)

        # Format summary
        lines = params.format_overlay(show_prompt=show_prompt, max_prompt_len=max_prompt_length)
        formatted = "\n".join(lines) if lines else "Could not parse metadata"

        # Build sampler string
        sampler_str = params.sampler or ""
        if params.scheduler:
            sampler_str += f"/{params.scheduler}"

        return (
            formatted,
            params.model or "",
            sampler_str,
            params.seed or 0,
            params.steps or 0,
            params.cfg or 0.0,
            params.positive_prompt or "",
            params.negative_prompt or "",
        )


class ParameterOverlay:
    """
    Add parameter overlay to an image.

    Reads metadata from the source image file and displays
    generation parameters as a visual overlay.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
            "optional": {
                "image_path": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "placeholder": "Path to image with metadata (optional)"
                }),
                "metadata_text": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "placeholder": "Or paste raw metadata here"
                }),
                "position": (["bottom_extend", "bottom_inside", "top_inside"],),
                "font_size": ("INT", {"default": 25, "min": 8, "max": 100, "step": 1}),
                "bg_opacity": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.1}),
                "show_prompt": ("BOOLEAN", {"default": False}),
                "max_prompt_length": ("INT", {"default": 200, "min": 0, "max": 10000, "step": 10}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "add_overlay"
    CATEGORY = "ComfyAngel/Overlay"

    def add_overlay(
        self,
        image,
        image_path: str = "",
        metadata_text: str = "",
        position: str = "bottom_extend",
        font_size: int = 25,
        bg_opacity: float = 0.7,
        show_prompt: bool = False,
        max_prompt_length: int = 50,
    ):
        image = ensure_bhwc(image)
        batch_size = image.shape[0]
        results = []

        # Parse metadata
        params = GenerationParams()
        if metadata_text.strip():
            # Try to parse provided metadata
            if "Steps:" in metadata_text:
                params = parse_a1111_format(metadata_text)
            elif metadata_text.strip().startswith("{"):
                params = parse_comfyui_format(metadata_text)
        elif image_path and os.path.exists(image_path):
            params = read_image_metadata(image_path)

        # Get overlay lines
        # max_prompt_length: 0 = unlimited
        prompt_len = None if max_prompt_length == 0 else max_prompt_length
        lines = params.format_overlay(show_prompt=show_prompt, max_prompt_len=prompt_len)

        if not lines:
            # No metadata found, return original
            return (image,)

        # Create renderer
        renderer = TextRenderer(
            font_size=font_size,
            bg_opacity=bg_opacity,
        )

        # Process each image in batch
        for i in range(batch_size):
            pil_img = to_pil(image, i)

            if position == "bottom_extend":
                result = renderer.add_overlay_bottom(pil_img, lines)
            elif position == "bottom_inside":
                result = renderer.add_overlay_inside(pil_img, lines, "bottom")
            else:  # top_inside
                result = renderer.add_overlay_inside(pil_img, lines, "top")

            results.append(from_pil(result))

        return (torch.cat(results, dim=0),)


class CustomTextOverlay:
    """
    Add custom text overlay to an image.

    Allows adding any text to the image with styling options.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "text": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "placeholder": "Text to overlay (one line per row)"
                }),
            },
            "optional": {
                "position": (["bottom_extend", "bottom_inside", "top_inside"],),
                "font_size": ("INT", {"default": 25, "min": 8, "max": 100, "step": 1}),
                "bg_opacity": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.1}),
                "text_color": ("STRING", {"default": "#FFFFFF"}),
                "bg_color": ("STRING", {"default": "#000000"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "add_text"
    CATEGORY = "ComfyAngel/Overlay"

    def add_text(
        self,
        image,
        text: str,
        position: str = "bottom_extend",
        font_size: int = 14,
        bg_opacity: float = 0.7,
        text_color: str = "#FFFFFF",
        bg_color: str = "#000000",
    ):
        image = ensure_bhwc(image)

        if not text.strip():
            return (image,)

        batch_size = image.shape[0]
        results = []

        # Parse colors
        text_rgb = self._hex_to_rgb(text_color)
        bg_rgb = self._hex_to_rgb(bg_color)

        # Split text into lines
        lines = [line.strip() for line in text.strip().split("\n") if line.strip()]

        if not lines:
            return (image,)

        # Create renderer
        renderer = TextRenderer(
            font_size=font_size,
            bg_opacity=bg_opacity,
            text_color=text_rgb,
            bg_color=bg_rgb,
        )

        # Process each image in batch
        for i in range(batch_size):
            pil_img = to_pil(image, i)

            if position == "bottom_extend":
                result = renderer.add_overlay_bottom(pil_img, lines)
            elif position == "bottom_inside":
                result = renderer.add_overlay_inside(pil_img, lines, "bottom")
            else:  # top_inside
                result = renderer.add_overlay_inside(pil_img, lines, "top")

            results.append(from_pil(result))

        return (torch.cat(results, dim=0),)

    def _hex_to_rgb(self, hex_color: str) -> tuple:
        """Convert hex color to RGB tuple."""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 3:
            hex_color = "".join([c * 2 for c in hex_color])
        try:
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        except ValueError:
            return (255, 255, 255)


# Export for registration
NODE_CLASS_MAPPINGS = {
    "ComfyAngel_LoadImageWithMetadata": LoadImageWithMetadata,
    "ComfyAngel_ParameterParser": ParameterParser,
    "ComfyAngel_ParameterOverlay": ParameterOverlay,
    "ComfyAngel_CustomTextOverlay": CustomTextOverlay,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyAngel_LoadImageWithMetadata": "Load Image + Metadata 🪽",
    "ComfyAngel_ParameterParser": "Parameter Parser 🪽",
    "ComfyAngel_ParameterOverlay": "Parameter Overlay 🪽",
    "ComfyAngel_CustomTextOverlay": "Custom Text Overlay 🪽",
}
