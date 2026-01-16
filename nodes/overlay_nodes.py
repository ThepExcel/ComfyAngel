"""
Parameter Overlay Nodes for ComfyAngel.

These nodes add visual parameter information to images.
"""

import os
import torch
from PIL import Image

from ..utils.tensor_ops import ensure_bhwc, to_pil, from_pil, clone_tensor
from ..utils.metadata_parser import read_image_metadata, GenerationParams, parse_a1111_format, parse_comfyui_format
from ..utils.text_renderer import TextRenderer


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
                "font_size": ("INT", {"default": 14, "min": 8, "max": 32, "step": 1}),
                "bg_opacity": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.1}),
                "show_prompt": ("BOOLEAN", {"default": False}),
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
        font_size: int = 14,
        bg_opacity: float = 0.7,
        show_prompt: bool = False,
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
        lines = params.format_overlay(show_prompt=show_prompt)

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
                "font_size": ("INT", {"default": 14, "min": 8, "max": 48, "step": 1}),
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
    "ComfyAngel_ParameterOverlay": ParameterOverlay,
    "ComfyAngel_CustomTextOverlay": CustomTextOverlay,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyAngel_ParameterOverlay": "Parameter Overlay 🪽",
    "ComfyAngel_CustomTextOverlay": "Custom Text Overlay 🪽",
}
