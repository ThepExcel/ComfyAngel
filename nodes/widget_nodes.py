"""
Visual Widget Nodes for ComfyAngel.

Nodes with enhanced JS widget interfaces.
"""

import json
import torch
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

from ..utils.tensor_ops import ensure_bhwc, to_pil, from_pil, clone_tensor
from ..utils.color_utils import hex_to_rgb, rgb_to_hex


class SmartCrop:
    """
    Crop image with visual crop area selector.

    Uses a JS widget for interactive crop area selection.
    Supports cropping beyond image bounds with customizable background color.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "x": ("INT", {"default": 0, "min": -8192, "max": 8192, "step": 1}),
                "y": ("INT", {"default": 0, "min": -8192, "max": 8192, "step": 1}),
                "crop_width": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
                "crop_height": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
            },
            "optional": {
                "bg_color": ("STRING", {"default": "#000000"}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "crop"
    CATEGORY = "ComfyAngel/Widget"

    def crop(self, image, x: int, y: int, crop_width: int, crop_height: int, bg_color: str = "#000000"):
        image = ensure_bhwc(image)
        batch_size, img_height, img_width, channels = image.shape

        if crop_width <= 0 or crop_height <= 0:
            return (image,)

        # Parse background color
        bg_rgb = hex_to_rgb(bg_color, default=(0, 0, 0))
        bg_normalized = [c / 255.0 for c in bg_rgb]

        with torch.no_grad():
            results = []
            for b in range(batch_size):
                # Create output canvas with background color
                canvas = torch.zeros((crop_height, crop_width, channels), dtype=image.dtype, device=image.device)
                for c in range(min(channels, 3)):
                    canvas[:, :, c] = bg_normalized[c]

                # Calculate source region (from original image)
                src_x1 = max(0, x)
                src_y1 = max(0, y)
                src_x2 = min(img_width, x + crop_width)
                src_y2 = min(img_height, y + crop_height)

                # Calculate destination region (on canvas)
                dst_x1 = max(0, -x)
                dst_y1 = max(0, -y)
                dst_x2 = dst_x1 + (src_x2 - src_x1)
                dst_y2 = dst_y1 + (src_y2 - src_y1)

                # Copy the overlapping region
                if src_x2 > src_x1 and src_y2 > src_y1:
                    canvas[dst_y1:dst_y2, dst_x1:dst_x2, :] = image[b, src_y1:src_y2, src_x1:src_x2, :]

                results.append(canvas)

        return (torch.stack(results, dim=0),)


class SolidColor:
    """
    Generate a solid color image with visual color picker.

    Uses a JS widget for interactive color selection.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "color": ("STRING", {"default": "#FFFFFF"}),
                "width": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
                "height": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
            },
            "optional": {
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64, "step": 1}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "generate"
    CATEGORY = "ComfyAngel/Widget"

    def generate(self, color: str, width: int, height: int, batch_size: int = 1):
        # Parse hex color
        rgb = hex_to_rgb(color, default=(255, 255, 255))

        with torch.no_grad():
            # Create numpy array with the color
            img_np = np.full((height, width, 3), rgb, dtype=np.float32) / 255.0

            # Convert to tensor
            img_tensor = torch.from_numpy(img_np).unsqueeze(0)

            # Repeat for batch
            if batch_size > 1:
                img_tensor = img_tensor.repeat(batch_size, 1, 1, 1)

        return (img_tensor,)


class ImageInfo:
    """
    Display essential information about an image.

    Outputs commonly used properties: dimensions, aspect ratio,
    orientation, and a formatted summary string.

    Note: v0.5.0 reduced outputs from 14 to 5 for better UX.
    If you need detailed statistics (min/max/mean values, grayscale detection),
    please request a separate ImageInfoDetailed node.
    """

    # Common aspect ratios for detection
    ASPECT_RATIOS = [
        (1, 1, "1:1"),
        (4, 3, "4:3"),
        (3, 4, "3:4"),
        (16, 9, "16:9"),
        (9, 16, "9:16"),
        (3, 2, "3:2"),
        (2, 3, "2:3"),
        (21, 9, "21:9"),
        (9, 21, "9:21"),
        (5, 4, "5:4"),
        (4, 5, "4:5"),
    ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("INT", "INT", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("width", "height", "aspect_ratio", "orientation", "summary")
    FUNCTION = "get_info"
    CATEGORY = "ComfyAngel/Utility"

    def get_info(self, image):
        image = ensure_bhwc(image)
        batch_size, height, width, channels = image.shape

        # Aspect ratio
        aspect_ratio = self._detect_aspect_ratio(width, height)

        # Orientation
        if width > height:
            orientation = "landscape"
        elif height > width:
            orientation = "portrait"
        else:
            orientation = "square"

        # Summary string
        megapixels = round((width * height) / 1_000_000, 2)
        summary_parts = [
            f"{width}x{height}",
            f"{aspect_ratio}",
            orientation,
            f"{megapixels}MP",
        ]
        if batch_size > 1:
            summary_parts.append(f"batch:{batch_size}")
        if channels == 4:
            summary_parts.append("alpha")
        summary = " | ".join(summary_parts)

        return (
            width,
            height,
            aspect_ratio,
            orientation,
            summary,
        )

    def _detect_aspect_ratio(self, width: int, height: int) -> str:
        """Detect closest common aspect ratio."""
        if height == 0:
            return "unknown"

        actual_ratio = width / height
        tolerance = 0.02  # 2% tolerance

        for w, h, name in self.ASPECT_RATIOS:
            expected = w / h
            if abs(actual_ratio - expected) / expected < tolerance:
                return name

        # If no match, return simplified ratio
        from math import gcd
        divisor = gcd(width, height)
        simplified_w = width // divisor
        simplified_h = height // divisor

        # If simplified ratio is too complex, just return the decimal
        if simplified_w > 100 or simplified_h > 100:
            return f"{actual_ratio:.2f}:1"

        return f"{simplified_w}:{simplified_h}"


class _CompositeBase:
    """Base class for composite nodes with shared blend logic."""

    ANCHORS = [
        "top_left", "top_center", "top_right",
        "middle_left", "center", "middle_right",
        "bottom_left", "bottom_center", "bottom_right",
    ]

    BLEND_MODES = [
        "normal",
        "multiply",
        "screen",
        "overlay",
        "soft_light",
        "hard_light",
        "difference",
        "add",
        "subtract",
        "darken",
        "lighten",
    ]

    def _scale_overlay(self, overlay_img, scale):
        """Scale overlay image."""
        if scale != 100.0:
            new_w = max(1, int(overlay_img.width * scale / 100))
            new_h = max(1, int(overlay_img.height * scale / 100))
            return overlay_img.resize((new_w, new_h), Image.LANCZOS)
        return overlay_img

    def _blend_images(
        self,
        canvas: Image.Image,
        overlay: Image.Image,
        x: int,
        y: int,
        blend_mode: str,
        opacity: float,
    ) -> Image.Image:
        """Blend overlay onto canvas at position with blend mode and opacity."""
        # Ensure both images are RGBA
        if canvas.mode != "RGBA":
            canvas = canvas.convert("RGBA")
        if overlay.mode != "RGBA":
            overlay = overlay.convert("RGBA")

        # Create a copy of canvas to work with
        result = canvas.copy()

        # Get overlay dimensions
        ow, oh = overlay.size
        cw, ch = canvas.size

        # Calculate the visible region of overlay on canvas
        # Source region (from overlay)
        src_x1 = max(0, -x)
        src_y1 = max(0, -y)
        src_x2 = min(ow, cw - x)
        src_y2 = min(oh, ch - y)

        # Destination region (on canvas)
        dst_x1 = max(0, x)
        dst_y1 = max(0, y)
        dst_x2 = min(cw, x + ow)
        dst_y2 = min(ch, y + oh)

        # Check if there's any visible region
        if src_x2 <= src_x1 or src_y2 <= src_y1:
            return result.convert("RGB")

        # Crop visible regions
        overlay_region = overlay.crop((src_x1, src_y1, src_x2, src_y2))
        canvas_region = canvas.crop((dst_x1, dst_y1, dst_x2, dst_y2))

        # Apply blend mode
        blended = self._apply_blend_mode(canvas_region, overlay_region, blend_mode)

        # Apply opacity
        if opacity < 1.0:
            blended = Image.blend(canvas_region, blended, opacity)

        # Paste blended region back
        result.paste(blended, (dst_x1, dst_y1))

        return result.convert("RGB")

    def _apply_blend_mode(
        self,
        base: Image.Image,
        blend: Image.Image,
        mode: str,
    ) -> Image.Image:
        """Apply blend mode between two images."""
        import numpy as np

        # Convert to float arrays
        base_arr = np.array(base).astype(float) / 255.0
        blend_arr = np.array(blend).astype(float) / 255.0

        # Split alpha if present
        if base_arr.shape[2] == 4:
            base_rgb = base_arr[:, :, :3]
            base_alpha = base_arr[:, :, 3:4]
        else:
            base_rgb = base_arr
            base_alpha = np.ones((*base_arr.shape[:2], 1))

        if blend_arr.shape[2] == 4:
            blend_rgb = blend_arr[:, :, :3]
            blend_alpha = blend_arr[:, :, 3:4]
        else:
            blend_rgb = blend_arr
            blend_alpha = np.ones((*blend_arr.shape[:2], 1))

        # Apply blend mode
        if mode == "normal":
            result_rgb = blend_rgb
        elif mode == "multiply":
            result_rgb = base_rgb * blend_rgb
        elif mode == "screen":
            result_rgb = 1 - (1 - base_rgb) * (1 - blend_rgb)
        elif mode == "overlay":
            mask = base_rgb < 0.5
            result_rgb = np.where(
                mask,
                2 * base_rgb * blend_rgb,
                1 - 2 * (1 - base_rgb) * (1 - blend_rgb)
            )
        elif mode == "soft_light":
            result_rgb = np.where(
                blend_rgb < 0.5,
                base_rgb - (1 - 2 * blend_rgb) * base_rgb * (1 - base_rgb),
                base_rgb + (2 * blend_rgb - 1) * (self._soft_light_d(base_rgb) - base_rgb)
            )
        elif mode == "hard_light":
            mask = blend_rgb < 0.5
            result_rgb = np.where(
                mask,
                2 * base_rgb * blend_rgb,
                1 - 2 * (1 - base_rgb) * (1 - blend_rgb)
            )
        elif mode == "difference":
            result_rgb = np.abs(base_rgb - blend_rgb)
        elif mode == "add":
            result_rgb = np.clip(base_rgb + blend_rgb, 0, 1)
        elif mode == "subtract":
            result_rgb = np.clip(base_rgb - blend_rgb, 0, 1)
        elif mode == "darken":
            result_rgb = np.minimum(base_rgb, blend_rgb)
        elif mode == "lighten":
            result_rgb = np.maximum(base_rgb, blend_rgb)
        else:
            result_rgb = blend_rgb

        # Composite with alpha
        out_alpha = blend_alpha + base_alpha * (1 - blend_alpha)
        out_alpha = np.clip(out_alpha, 0.001, 1)  # Avoid division by zero

        out_rgb = (result_rgb * blend_alpha + base_rgb * base_alpha * (1 - blend_alpha)) / out_alpha
        out_rgb = np.clip(out_rgb, 0, 1)

        # Combine RGB and alpha
        result = np.concatenate([out_rgb, out_alpha], axis=2)
        result = (result * 255).astype(np.uint8)

        return Image.fromarray(result, mode="RGBA")

    def _soft_light_d(self, x):
        """Helper function for soft light blend mode."""
        import numpy as np
        return np.where(x <= 0.25, ((16 * x - 12) * x + 4) * x, np.sqrt(x))


class SmartCompositeXY(_CompositeBase):
    """
    Composite two images using X,Y coordinates.

    Place an overlay image on a canvas at specific coordinates
    with anchor point, scale, blend mode, and opacity controls.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "canvas": ("IMAGE",),
                "overlay": ("IMAGE",),
                "x": ("INT", {"default": 0, "min": -8192, "max": 8192, "step": 1}),
                "y": ("INT", {"default": 0, "min": -8192, "max": 8192, "step": 1}),
                "anchor": (cls.ANCHORS, {"default": "top_left"}),
                "scale_percent": ("FLOAT", {"default": 100.0, "min": 1.0, "max": 500.0, "step": 1.0}),
                "blend_mode": (cls.BLEND_MODES, {"default": "normal"}),
                "opacity": ("FLOAT", {"default": 100.0, "min": 0.0, "max": 100.0, "step": 1.0}),
            },
            "optional": {
                "mask": ("MASK",),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("image", "x", "y")
    FUNCTION = "composite"
    CATEGORY = "ComfyAngel/Composite"

    def composite(
        self,
        canvas,
        overlay,
        x: int,
        y: int,
        anchor: str,
        scale_percent: float,
        blend_mode: str,
        opacity: float,
        mask=None,
    ):
        canvas = ensure_bhwc(canvas)
        overlay = ensure_bhwc(overlay)

        result = clone_tensor(canvas)
        batch_size = canvas.shape[0]
        overlay_batch = overlay.shape[0]

        results = []

        with torch.no_grad():
            for i in range(batch_size):
                canvas_img = to_pil(result, i)
                overlay_idx = min(i, overlay_batch - 1)
                overlay_img = to_pil(overlay, overlay_idx)

                # Scale overlay
                overlay_img = self._scale_overlay(overlay_img, scale_percent)

                # Apply mask if provided
                if mask is not None:
                    # Ensure mask is 3D [B, H, W]
                    if mask.dim() == 2:
                        mask = mask.unsqueeze(0)

                    mask_idx = min(i, mask.shape[0] - 1)
                    mask_tensor = mask[mask_idx]

                    # Get mask dimensions (before scaling)
                    original_overlay = to_pil(overlay, overlay_idx)
                    mask_h, mask_w = mask_tensor.shape

                    # Resize mask to match scaled overlay dimensions
                    scaled_w = overlay_img.width
                    scaled_h = overlay_img.height

                    # Convert mask tensor to PIL for resizing
                    mask_np = (mask_tensor.cpu().numpy() * 255).astype(np.uint8)
                    mask_img = Image.fromarray(mask_np, mode="L")

                    # Resize mask to match original overlay size if needed
                    if mask_img.size != original_overlay.size:
                        mask_img = mask_img.resize(original_overlay.size, Image.LANCZOS)

                    # Then resize to scaled overlay size
                    if mask_img.size != (scaled_w, scaled_h):
                        mask_img = mask_img.resize((scaled_w, scaled_h), Image.LANCZOS)

                    # Apply mask as alpha channel
                    if overlay_img.mode != "RGBA":
                        overlay_img = overlay_img.convert("RGBA")

                    # Multiply existing alpha with mask
                    r, g, b, a = overlay_img.split()
                    # Mask is 0-1 where 1=keep, 0=discard
                    # PIL alpha is 0=transparent, 255=opaque
                    # ComfyUI MASK is 0=masked, 1=unmasked
                    overlay_img = Image.merge("RGBA", (r, g, b, mask_img))

                # Calculate position based on anchor
                pos_x, pos_y = self._calc_anchor_position(
                    x, y, anchor, overlay_img.width, overlay_img.height
                )

                # Apply blend mode and composite
                composited = self._blend_images(
                    canvas_img, overlay_img, pos_x, pos_y, blend_mode, opacity / 100.0
                )

                results.append(from_pil(composited))

        return (torch.cat(results, dim=0), x, y)

    def _calc_anchor_position(self, x: int, y: int, anchor: str, w: int, h: int):
        """Calculate top-left position based on anchor point."""
        anchor_offsets = {
            "top_left": (0, 0),
            "top_center": (-w // 2, 0),
            "top_right": (-w, 0),
            "middle_left": (0, -h // 2),
            "center": (-w // 2, -h // 2),
            "middle_right": (-w, -h // 2),
            "bottom_left": (0, -h),
            "bottom_center": (-w // 2, -h),
            "bottom_right": (-w, -h),
        }
        ox, oy = anchor_offsets.get(anchor, (0, 0))
        return x + ox, y + oy


class ColorPicker:
    """
    Pick a color with visual color picker.

    JS widget provides eyedropper to pick color from connected image.
    Outputs hex color string that connects to Solid Color.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "color_hex": ("STRING", {"default": "#FFFFFF"}),
            },
            "optional": {
                "image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("color",)
    FUNCTION = "get_color"
    CATEGORY = "ComfyAngel/Widget"

    def get_color(self, color_hex: str, image=None):
        # JS widget handles eyedropper and updates color_hex directly
        # image input is for JS widget preview only

        # Validate and normalize hex color
        color_hex = color_hex.strip()
        if not color_hex.startswith("#"):
            color_hex = "#" + color_hex
        # Expand shorthand (#FFF -> #FFFFFF)
        if len(color_hex) == 4:
            color_hex = "#" + "".join([c * 2 for c in color_hex[1:]])
        # Validate format
        if len(color_hex) != 7:
            color_hex = "#FFFFFF"
        return (color_hex.upper(),)


class ImageBridge:
    """
    Pass-through node with preview or save option.

    Use this between nodes to:
    - Preview: Show image and make it available for visual editors
    - Save: Save image to output folder

    Image passes through unchanged to the output.
    When images have different sizes, preview shows them padded to same size,
    but output remains original (unmodified) images.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": (["preview", "save"], {"default": "preview"}),
            },
            "optional": {
                "filename_prefix": ("STRING", {"default": "ComfyAngel"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "bridge"
    CATEGORY = "ComfyAngel/Utility"
    OUTPUT_NODE = True

    def bridge(self, image, mode: str = "preview", filename_prefix: str = "ComfyAngel", prompt=None, extra_pnginfo=None):
        import os
        import time
        import random
        import folder_paths

        # Handle list of tensors (from loop nodes)
        original_tensors = []  # Keep originals for output

        if isinstance(image, list):
            if len(image) == 0:
                raise ValueError("Empty image list")

            # Filter and collect tensors
            for img in image:
                if isinstance(img, torch.Tensor):
                    img = ensure_bhwc(img)
                    original_tensors.append(img)
                elif isinstance(img, list):
                    # Nested list - flatten it
                    for nested_img in img:
                        if isinstance(nested_img, torch.Tensor):
                            original_tensors.append(ensure_bhwc(nested_img))

            if not original_tensors:
                raise ValueError(f"No valid image tensors found in list. Got types: {[type(x).__name__ for x in image]}")
        else:
            image = ensure_bhwc(image)
            # Split batch into individual tensors
            for i in range(image.shape[0]):
                original_tensors.append(image[i:i+1])

        # Check if all tensors have same shape (except batch dim)
        first_shape = original_tensors[0].shape[1:]  # (H, W, C)
        all_same_shape = all(t.shape[1:] == first_shape for t in original_tensors)

        # Create preview tensors (padded if needed)
        if all_same_shape:
            # Same size - just concatenate
            preview_batch = torch.cat(original_tensors, dim=0)
        else:
            # Different sizes - pad all to max size for preview (black background)
            max_h = max(t.shape[1] for t in original_tensors)
            max_w = max(t.shape[2] for t in original_tensors)

            padded_tensors = []
            with torch.no_grad():
                for t in original_tensors:
                    _, h, w, c = t.shape
                    if h == max_h and w == max_w:
                        padded_tensors.append(t)
                    else:
                        # Create black background tensor
                        padded = torch.zeros(1, max_h, max_w, c, dtype=t.dtype, device=t.device)
                        # Center the image
                        y_offset = (max_h - h) // 2
                        x_offset = (max_w - w) // 2
                        padded[:, y_offset:y_offset+h, x_offset:x_offset+w, :] = t
                        padded_tensors.append(padded)

            preview_batch = torch.cat(padded_tensors, dim=0)

        # Generate unique ID for this execution
        unique_id = f"{int(time.time()*1000)}_{random.randint(1000,9999)}"

        # Create metadata (same as official SaveImage)
        metadata = PngInfo()
        if prompt is not None:
            metadata.add_text("prompt", json.dumps(prompt))
        if extra_pnginfo is not None:
            for key in extra_pnginfo:
                metadata.add_text(key, json.dumps(extra_pnginfo[key]))

        results = []
        with torch.no_grad():
            # Use preview_batch for preview/save (may be padded)
            for i in range(preview_batch.shape[0]):
                pil_img = to_pil(preview_batch, i)

                if mode == "save":
                    # Save to output folder - use ORIGINAL images, not padded
                    orig_pil = to_pil(original_tensors[i], 0)
                    output_dir = folder_paths.get_output_directory()
                    subfolder = ""

                    # Generate unique filename
                    counter = 1
                    while True:
                        filename = f"{filename_prefix}_{counter:05d}.png"
                        filepath = os.path.join(output_dir, filename)
                        if not os.path.exists(filepath):
                            break
                        counter += 1

                    orig_pil.save(filepath, pnginfo=metadata, compress_level=4)

                    results.append({
                        "filename": filename,
                        "subfolder": subfolder,
                        "type": "output",
                    })
                else:
                    # Preview - save padded version for display
                    temp_dir = folder_paths.get_temp_directory()
                    filename = f"imgbridge_{unique_id}_{i:03d}.png"
                    filepath = os.path.join(temp_dir, filename)
                    pil_img.save(filepath, pnginfo=metadata)

                    results.append({
                        "filename": filename,
                        "subfolder": "",
                        "type": "temp",
                    })

        # Return original tensors as list (OUTPUT_IS_LIST handles this)
        return {"ui": {"images": results}, "result": (original_tensors,)}


class ResolutionPicker:
    """
    Pick from common image resolutions by aspect ratio.

    First select aspect ratio, then select resolution within that ratio.
    Includes optimized sizes for: SD 1.5, SDXL, SD3/SD3.5, Flux, DALL-E 3,
    Qwen-Image, Midjourney, Ideogram, Hunyuan, Kolors, Z-Image Turbo.
    """

    ASPECT_RATIOS = [
        "1:1 (Square)",
        "4:3 (Standard)",
        "3:2 (Photo)",
        "16:9 (Widescreen)",
        "21:9 (Ultrawide)",
        "9:16 (Portrait Mobile)",
        "3:4 (Portrait Standard)",
        "2:3 (Portrait Photo)",
    ]

    # Resolutions organized by aspect ratio
    # Includes AI model optimized sizes integrated into standard ratios
    RESOLUTIONS = {
        "1:1 (Square)": {
            # SD 1.5 native
            "512x512 (SD1.5)": (512, 512),
            # SD 1.5 fine-tuned
            "768x768 (SD1.5 HiRes)": (768, 768),
            # SDXL/SD3/SD3.5/Flux/Kolors/Z-Image native
            "1024x1024 (SDXL/SD3/Flux)": (1024, 1024),
            # Instagram / Social
            "1080x1080 (Instagram)": (1080, 1080),
            # Hunyuan-DiT
            "1280x1280 (Hunyuan)": (1280, 1280),
            # Qwen-Image native (~1.6MP)
            "1328x1328 (Qwen-Image)": (1328, 1328),
            # 2K
            "1440x1440 (2K)": (1440, 1440),
            # Flux Pro Ultra / Hunyuan 2.1+
            "2048x2048 (Flux Ultra/Hunyuan)": (2048, 2048),
            # 4K
            "4096x4096 (4K)": (4096, 4096),
        },
        "4:3 (Standard)": {
            # Classic VGA
            "640x480 (VGA/480p)": (640, 480),
            # SVGA
            "800x600 (SVGA)": (800, 600),
            # XGA
            "1024x768 (XGA)": (1024, 768),
            # SDXL optimized (close to 4:3)
            "1152x896 (SDXL ~9:7)": (1152, 896),
            # SXGA+
            "1280x960 (SXGA+)": (1280, 960),
            # Qwen-Image 4:3
            "1472x1104 (Qwen-Image)": (1472, 1104),
            # UXGA
            "1600x1200 (UXGA)": (1600, 1200),
            # 2K
            "2048x1536 (2K)": (2048, 1536),
            # 3K
            "2880x2160 (3K)": (2880, 2160),
            # 4K
            "4096x3072 (4K)": (4096, 3072),
        },
        "3:2 (Photo)": {
            # SD 1.5
            "768x512 (SD1.5)": (768, 512),
            # Basic
            "720x480": (720, 480),
            # 720p-ish
            "1080x720": (1080, 720),
            # SDXL optimized 3:2
            "1216x832 (SDXL)": (1216, 832),
            # HD-ish
            "1440x960": (1440, 960),
            # Qwen-Image 3:2
            "1584x1056 (Qwen-Image)": (1584, 1056),
            # FHD-ish
            "1620x1080": (1620, 1080),
            # 2K
            "2160x1440 (2K)": (2160, 1440),
            # 3K
            "3000x2000 (3K)": (3000, 2000),
            # 4K
            "4320x2880 (4K)": (4320, 2880),
            # 6K
            "6000x4000 (6K)": (6000, 4000),
        },
        "16:9 (Widescreen)": {
            # 360p
            "640x360 (360p)": (640, 360),
            # 480p
            "854x480 (480p)": (854, 480),
            # 720p HD
            "1280x720 (720p HD)": (1280, 720),
            # SDXL optimized 16:9
            "1344x768 (SDXL)": (1344, 768),
            # Qwen-Image 16:9
            "1664x928 (Qwen-Image)": (1664, 928),
            # DALL-E 3 landscape
            "1792x1024 (DALL-E 3)": (1792, 1024),
            # 1080p FHD
            "1920x1080 (1080p FHD)": (1920, 1080),
            # 1440p QHD
            "2560x1440 (1440p 2K QHD)": (2560, 1440),
            # Hunyuan 2.1
            "2560x1536 (Hunyuan 2.1)": (2560, 1536),
            # 4K UHD
            "3840x2160 (2160p 4K UHD)": (3840, 2160),
            # 5K
            "5120x2880 (5K)": (5120, 2880),
            # 8K
            "7680x4320 (8K)": (7680, 4320),
        },
        "21:9 (Ultrawide)": {
            # SDXL optimized 21:9
            "1536x640 (SDXL)": (1536, 640),
            # Cinema
            "1280x548 (Cinema)": (1280, 548),
            # Cinema HD
            "1720x720 (Cinema HD)": (1720, 720),
            # UWFHD
            "2560x1080 (UWFHD)": (2560, 1080),
            # UWQHD
            "3440x1440 (UWQHD)": (3440, 1440),
            # Wide 4K
            "3840x1600 (Wide 4K)": (3840, 1600),
            # 5K UW
            "5120x2160 (5K UW)": (5120, 2160),
        },
        "9:16 (Portrait Mobile)": {
            # Basic
            "360x640": (360, 640),
            # 480p
            "480x854 (480p)": (480, 854),
            # 720p HD
            "720x1280 (720p HD)": (720, 1280),
            # SDXL optimized 9:16
            "768x1344 (SDXL)": (768, 1344),
            # Qwen-Image 9:16
            "928x1664 (Qwen-Image)": (928, 1664),
            # DALL-E 3 portrait
            "1024x1792 (DALL-E 3)": (1024, 1792),
            # 1080p FHD
            "1080x1920 (1080p FHD)": (1080, 1920),
            # 2K
            "1440x2560 (1440p 2K)": (1440, 2560),
            # 4K
            "2160x3840 (4K)": (2160, 3840),
        },
        "3:4 (Portrait Standard)": {
            # VGA
            "480x640 (VGA)": (480, 640),
            # SVGA
            "600x800 (SVGA)": (600, 800),
            # XGA
            "768x1024 (XGA)": (768, 1024),
            # SDXL optimized ~7:9
            "896x1152 (SDXL ~7:9)": (896, 1152),
            # SXGA
            "960x1280 (SXGA)": (960, 1280),
            # Qwen-Image 3:4
            "1104x1472 (Qwen-Image)": (1104, 1472),
            # UXGA
            "1200x1600 (UXGA)": (1200, 1600),
            # 2K
            "1536x2048 (2K)": (1536, 2048),
            # 4K
            "3072x4096 (4K)": (3072, 4096),
        },
        "2:3 (Portrait Photo)": {
            # SD 1.5
            "512x768 (SD1.5)": (512, 768),
            # Basic
            "480x720": (480, 720),
            # Basic HD
            "720x1080": (720, 1080),
            # SDXL optimized 2:3
            "832x1216 (SDXL)": (832, 1216),
            # HD
            "960x1440": (960, 1440),
            # Qwen-Image 2:3
            "1056x1584 (Qwen-Image)": (1056, 1584),
            # FHD
            "1080x1620 (FHD)": (1080, 1620),
            # 2K
            "1440x2160 (2K)": (1440, 2160),
            # 3K
            "2000x3000 (3K)": (2000, 3000),
            # 4K
            "2880x4320 (4K)": (2880, 4320),
        },
    }

    @classmethod
    def INPUT_TYPES(cls):
        # Get all resolution options for all aspect ratios
        all_resolutions = []
        for aspect, resolutions in cls.RESOLUTIONS.items():
            all_resolutions.extend(list(resolutions.keys()))

        return {
            "required": {
                "aspect_ratio": (cls.ASPECT_RATIOS, {"default": "16:9 (Widescreen)"}),
                "resolution": (all_resolutions, {"default": "1920x1080 (1080p FHD)"}),
            },
        }

    RETURN_TYPES = ("INT", "INT", "STRING")
    RETURN_NAMES = ("width", "height", "aspect_ratio")
    FUNCTION = "get_resolution"
    CATEGORY = "ComfyAngel/Utility"

    def get_resolution(self, aspect_ratio: str, resolution: str):
        # First try to find in selected aspect ratio
        if aspect_ratio in self.RESOLUTIONS:
            resolutions = self.RESOLUTIONS[aspect_ratio]
            if resolution in resolutions:
                width, height = resolutions[resolution]
                return (width, height, aspect_ratio)
            else:
                # Resolution not in this aspect - use first one
                first_res = list(resolutions.keys())[0]
                width, height = resolutions[first_res]
                return (width, height, aspect_ratio)

        # Fallback: search all aspect ratios (should not reach here normally)
        for aspect, resolutions in self.RESOLUTIONS.items():
            if resolution in resolutions:
                width, height = resolutions[resolution]
                return (width, height, aspect)

        # Ultimate fallback
        return (1024, 1024, "1:1 (Square)")


class WorkflowMetadata:
    """
    Output the current workflow/prompt as JSON string.

    Use this to get the workflow metadata for the current execution.
    Useful for embedding workflow info or debugging.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt_json", "workflow_json")
    FUNCTION = "get_metadata"
    CATEGORY = "ComfyAngel/Utility"

    def get_metadata(self, prompt=None, extra_pnginfo=None):
        prompt_json = ""
        workflow_json = ""

        if prompt is not None:
            prompt_json = json.dumps(prompt, indent=2)

        if extra_pnginfo is not None and "workflow" in extra_pnginfo:
            workflow_json = json.dumps(extra_pnginfo["workflow"], indent=2)

        return (prompt_json, workflow_json)


class TextCombine:
    """
    Combine multiple inputs into one string.

    Accepts ANY data type and auto-converts to text.
    Supports up to 10 inputs with customizable delimiter.
    Empty inputs are skipped automatically.
    """

    DELIMITER_PRESETS = [
        "newline",
        "space",
        "comma",
        "comma_space",
        "pipe",
        "tab",
        "none",
        "custom",
    ]

    @classmethod
    def INPUT_TYPES(cls):
        # Use "*" to accept any type
        any_input = ("*", {})
        return {
            "required": {
                "delimiter": (cls.DELIMITER_PRESETS, {"default": "newline"}),
            },
            "optional": {
                "input_1": any_input,
                "input_2": any_input,
                "input_3": any_input,
                "input_4": any_input,
                "input_5": any_input,
                "input_6": any_input,
                "input_7": any_input,
                "input_8": any_input,
                "input_9": any_input,
                "input_10": any_input,
                "custom_delimiter": ("STRING", {"default": " | "}),
                "skip_empty": ("BOOLEAN", {"default": True}),
                "trim_whitespace": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("text", "count")
    FUNCTION = "combine"
    CATEGORY = "ComfyAngel/Utility"
    OUTPUT_NODE = True  # Show preview in node after execution

    def combine(
        self,
        delimiter: str,
        input_1=None,
        input_2=None,
        input_3=None,
        input_4=None,
        input_5=None,
        input_6=None,
        input_7=None,
        input_8=None,
        input_9=None,
        input_10=None,
        custom_delimiter: str = " | ",
        skip_empty: bool = True,
        trim_whitespace: bool = True,
    ):
        # Get delimiter string
        delim_map = {
            "newline": "\n",
            "space": " ",
            "comma": ",",
            "comma_space": ", ",
            "pipe": " | ",
            "tab": "\t",
            "none": "",
            "custom": custom_delimiter,
        }
        delim = delim_map.get(delimiter, "\n")

        # Collect all inputs
        inputs = [input_1, input_2, input_3, input_4, input_5, input_6, input_7, input_8, input_9, input_10]

        # Process inputs
        processed = []
        for value in inputs:
            if value is None:
                continue

            # Convert to string
            text = self._to_string(value)

            if trim_whitespace:
                text = text.strip()
            if skip_empty and not text:
                continue
            processed.append(text)

        # Combine
        result = delim.join(processed)
        count = len(processed)

        # Return with UI preview
        return {
            "ui": {"text": [result]},
            "result": (result, count)
        }

    def _to_string(self, value) -> str:
        """Convert any value to string."""
        import torch

        # Already string
        if isinstance(value, str):
            return value

        # Boolean
        if isinstance(value, bool):
            return "true" if value else "false"

        # Numbers
        if isinstance(value, int):
            return str(value)
        if isinstance(value, float):
            # Format nicely, remove trailing zeros
            if value == int(value):
                return str(int(value))
            return f"{value:.6g}"

        # Torch tensor
        if isinstance(value, torch.Tensor):
            shape = list(value.shape)
            dtype = str(value.dtype).replace("torch.", "")
            if value.numel() == 1:
                # Single value tensor
                return f"{value.item():.6g}"
            elif len(shape) == 4:
                # Image tensor (B, H, W, C) or (B, C, H, W)
                return f"Tensor[{shape[0]}x{shape[1]}x{shape[2]}x{shape[3]}] {dtype}"
            else:
                return f"Tensor{shape} {dtype}"

        # List or tuple
        if isinstance(value, (list, tuple)):
            if len(value) == 0:
                return ""
            # If all items are simple, join them
            if all(isinstance(v, (str, int, float, bool)) for v in value):
                return ", ".join(self._to_string(v) for v in value)
            return f"[{len(value)} items]"

        # Dict
        if isinstance(value, dict):
            if len(value) == 0:
                return ""
            # Try to format as key=value pairs
            try:
                parts = [f"{k}={self._to_string(v)}" for k, v in list(value.items())[:5]]
                if len(value) > 5:
                    parts.append(f"...+{len(value)-5} more")
                return "{" + ", ".join(parts) + "}"
            except Exception:
                return f"{{dict: {len(value)} keys}}"

        # None
        if value is None:
            return ""

        # Fallback: use str()
        try:
            return str(value)
        except Exception:
            return f"<{type(value).__name__}>"


class TextPermutation:
    """
    Generate all combinations from a template with inline options.

    Syntax: "white {dog,cat,pig} is {sitting,jumping} on the floor"
    Output: List of all 6 combinations

    Supports:
    - Multiple groups: {a,b,c} ... {x,y}
    - Escaped braces: \\{ and \\} for literal braces
    - Custom separator (default: comma)
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "template": ("STRING", {
                    "default": "a {red,green,blue} {cat,dog} sitting on a {chair,sofa}",
                    "multiline": True,
                }),
            },
            "optional": {
                "separator": ("STRING", {"default": ","}),
                "trim_options": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("texts", "count")
    OUTPUT_IS_LIST = (True, False)
    FUNCTION = "generate"
    CATEGORY = "ComfyAngel/Utility"

    def generate(self, template: str, separator: str = ",", trim_options: bool = True):
        import re
        from itertools import product

        # Find all {option1,option2,...} groups
        pattern = r'\{([^{}]+)\}'
        matches = list(re.finditer(pattern, template))

        if not matches:
            # No groups found, return template as-is
            return ([template], 1)

        # Extract options from each group
        groups = []
        for match in matches:
            options_str = match.group(1)
            options = options_str.split(separator)
            if trim_options:
                options = [opt.strip() for opt in options]
            groups.append(options)

        # Generate all combinations
        combinations = list(product(*groups))

        # Prevent memory explosion
        MAX_COMBINATIONS = 10000
        if len(combinations) > MAX_COMBINATIONS:
            raise ValueError(f"Too many combinations ({len(combinations)}). Maximum allowed: {MAX_COMBINATIONS}")

        # Build result strings
        results = []
        for combo in combinations:
            result = template
            # Replace each group with corresponding option
            for match, option in zip(matches, combo):
                result = result.replace(match.group(0), option, 1)
            results.append(result)

        return (results, len(results))


class JSONExtract:
    """
    Extract values from JSON using field paths.

    Supports:
    - Simple fields: "seed"
    - Nested fields: "data.user.name"
    - Array index: "items[0]" or "nodes[2].type"

    Input multiple field paths separated by delimiter.
    """

    DELIMITER_OPTIONS = ["newline", "comma", "pipe", "semicolon"]
    DELIMITER_MAP = {
        "newline": "\n",
        "comma": ",",
        "pipe": "|",
        "semicolon": ";",
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "json_string": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "placeholder": "Paste JSON here or connect from metadata"
                }),
                "fields": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "placeholder": "Field paths (one per line)\ne.g. seed\n3.inputs.steps"
                }),
            },
            "optional": {
                "delimiter": (cls.DELIMITER_OPTIONS, {"default": "newline"}),
                "output_delimiter": (cls.DELIMITER_OPTIONS, {"default": "newline"}),
                "default_value": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "INT")
    RETURN_NAMES = ("values", "values_joined", "count")
    OUTPUT_IS_LIST = (True, False, False)
    OUTPUT_NODE = True  # Enable UI feedback for caching JSON
    FUNCTION = "extract"
    CATEGORY = "ComfyAngel/Utility"

    def _parse_field_path(self, path: str) -> list:
        """
        Parse field path into list of keys/indices.
        "data.users[0].name" -> ["data", "users", 0, "name"]
        """
        import re
        parts = []
        # Split by dots, but handle array brackets
        tokens = re.split(r'\.(?![^\[]*\])', path)

        for token in tokens:
            # Check for array index: "items[0]" or just "[0]"
            match = re.match(r'^([^\[]*)\[(\d+)\](.*)$', token)
            if match:
                key, index, rest = match.groups()
                if key:
                    parts.append(key)
                parts.append(int(index))
                # Handle chained brackets like [0][1]
                while rest:
                    match = re.match(r'^\[(\d+)\](.*)$', rest)
                    if match:
                        index, rest = match.groups()
                        parts.append(int(index))
                    else:
                        break
            else:
                if token:
                    parts.append(token)

        return parts

    def _get_value(self, data, path: str, default: str = "") -> str:
        """
        Get value from nested data using path.
        Returns string representation of value.
        """
        if not path.strip():
            return default

        parts = self._parse_field_path(path.strip())
        current = data

        try:
            for part in parts:
                if isinstance(part, int):
                    current = current[part]
                elif isinstance(current, dict):
                    current = current[part]
                else:
                    return default
        except (KeyError, IndexError, TypeError):
            return default

        # Convert to string
        if current is None:
            return default
        elif isinstance(current, bool):
            return "true" if current else "false"
        elif isinstance(current, (dict, list)):
            return json.dumps(current, ensure_ascii=False)
        else:
            return str(current)

    def extract(
        self,
        json_string: str,
        fields: str,
        delimiter: str = "newline",
        output_delimiter: str = "newline",
        default_value: str = "",
    ):
        # Parse JSON
        if not json_string.strip():
            return {"ui": {"json_cache": [""]}, "result": ([], "", 0)}

        try:
            data = json.loads(json_string)
        except json.JSONDecodeError as e:
            # Return error message as single value
            return {"ui": {"json_cache": [json_string]}, "result": ([f"JSON Error: {e}"], f"JSON Error: {e}", 1)}

        # Parse field paths
        delim = self.DELIMITER_MAP.get(delimiter, "\n")
        field_list = [f.strip() for f in fields.split(delim) if f.strip()]

        if not field_list:
            return {"ui": {"json_cache": [json_string]}, "result": ([], "", 0)}

        # Extract values
        values = []
        for field in field_list:
            value = self._get_value(data, field, default_value)
            values.append(value)

        # Join for output
        out_delim = self.DELIMITER_MAP.get(output_delimiter, "\n")
        values_joined = out_delim.join(values)

        # Return with UI data for JS caching
        return {"ui": {"json_cache": [json_string]}, "result": (values, values_joined, len(values))}


# Export for registration
NODE_CLASS_MAPPINGS = {
    "ComfyAngel_SmartCrop": SmartCrop,
    "ComfyAngel_SolidColor": SolidColor,
    "ComfyAngel_SmartCompositeXY": SmartCompositeXY,
    "ComfyAngel_ColorPicker": ColorPicker,
    "ComfyAngel_ImageInfo": ImageInfo,
    "ComfyAngel_ResolutionPicker": ResolutionPicker,
    "ComfyAngel_ImageBridge": ImageBridge,
    "ComfyAngel_WorkflowMetadata": WorkflowMetadata,
    "ComfyAngel_TextCombine": TextCombine,
    "ComfyAngel_TextPermutation": TextPermutation,
    "ComfyAngel_JSONExtract": JSONExtract,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyAngel_SmartCrop": "Smart Crop 🪽",
    "ComfyAngel_SolidColor": "Solid Color 🪽",
    "ComfyAngel_SmartCompositeXY": "Smart Composite 🪽",
    "ComfyAngel_ColorPicker": "Color Picker 🪽",
    "ComfyAngel_ImageInfo": "Image Info 🪽",
    "ComfyAngel_ResolutionPicker": "Resolution Picker 🪽",
    "ComfyAngel_ImageBridge": "Image Bridge 🪽",
    "ComfyAngel_WorkflowMetadata": "Workflow Metadata 🪽",
    "ComfyAngel_TextCombine": "Text Combine 🪽",
    "ComfyAngel_TextPermutation": "Text Permutation 🪽",
    "ComfyAngel_JSONExtract": "JSON Extract 🪽",
}
