"""
Visual Widget Nodes for ComfyAngel.

Nodes with enhanced JS widget interfaces.
"""

import torch
import numpy as np
from PIL import Image

from ..utils.tensor_ops import ensure_bhwc, from_pil, clone_tensor


class SmartCrop:
    """
    Crop image with visual crop area selector.

    Uses a JS widget for interactive crop area selection.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "x": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "y": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "crop_width": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
                "crop_height": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "crop"
    CATEGORY = "ComfyAngel/Widget"

    def crop(self, image, x: int, y: int, crop_width: int, crop_height: int):
        image = ensure_bhwc(image)
        batch_size, height, width, channels = image.shape

        # Clamp coordinates to valid range
        x = max(0, min(x, width - 1))
        y = max(0, min(y, height - 1))

        # Adjust crop size if it exceeds image bounds
        crop_width = min(crop_width, width - x)
        crop_height = min(crop_height, height - y)

        if crop_width <= 0 or crop_height <= 0:
            # Return original if crop is invalid
            return (image,)

        # Crop all images in batch
        cropped = image[:, y:y+crop_height, x:x+crop_width, :]

        return (cropped,)


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
        rgb = self._hex_to_rgb(color)

        # Create numpy array with the color
        img_np = np.full((height, width, 3), rgb, dtype=np.float32) / 255.0

        # Convert to tensor
        img_tensor = torch.from_numpy(img_np).unsqueeze(0)

        # Repeat for batch
        if batch_size > 1:
            img_tensor = img_tensor.repeat(batch_size, 1, 1, 1)

        return (img_tensor,)

    def _hex_to_rgb(self, hex_color: str) -> tuple:
        """Convert hex color to RGB tuple."""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 3:
            hex_color = "".join([c * 2 for c in hex_color])
        try:
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        except ValueError:
            return (255, 255, 255)


class ImageInfo:
    """
    Display information about an image.

    Shows width, height, channels, and batch size.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("INT", "INT", "INT", "INT")
    RETURN_NAMES = ("width", "height", "channels", "batch_size")
    FUNCTION = "get_info"
    CATEGORY = "ComfyAngel/Utility"

    def get_info(self, image):
        image = ensure_bhwc(image)
        batch_size, height, width, channels = image.shape
        return (width, height, channels, batch_size)


class SmartPosition:
    """
    Get position coordinates with visual position picker.

    Uses a JS widget for interactive position selection.
    Useful for placing overlays, watermarks, or other elements.
    """

    ANCHORS = [
        "top_left", "top_center", "top_right",
        "middle_left", "center", "middle_right",
        "bottom_left", "bottom_center", "bottom_right",
    ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "canvas_width": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
                "canvas_height": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
                "x": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "y": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "anchor": (cls.ANCHORS, {"default": "top_left"}),
            },
        }

    RETURN_TYPES = ("INT", "INT", "STRING")
    RETURN_NAMES = ("x", "y", "anchor")
    FUNCTION = "get_position"
    CATEGORY = "ComfyAngel/Widget"

    def get_position(self, canvas_width: int, canvas_height: int, x: int, y: int, anchor: str):
        # Clamp coordinates
        x = max(0, min(x, canvas_width))
        y = max(0, min(y, canvas_height))
        return (x, y, anchor)


class ResolutionPicker:
    """
    Pick from common image resolutions.

    Returns width and height for the selected preset.
    """

    PRESETS = {
        "512x512 (SD 1.5)": (512, 512),
        "768x768": (768, 768),
        "1024x1024 (SDXL)": (1024, 1024),
        "512x768 (Portrait)": (512, 768),
        "768x512 (Landscape)": (768, 512),
        "832x1216 (SDXL Portrait)": (832, 1216),
        "1216x832 (SDXL Landscape)": (1216, 832),
        "1024x576 (16:9)": (1024, 576),
        "576x1024 (9:16)": (576, 1024),
        "1920x1080 (Full HD)": (1920, 1080),
        "1080x1920 (Full HD Portrait)": (1080, 1920),
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "preset": (list(cls.PRESETS.keys()),),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "get_resolution"
    CATEGORY = "ComfyAngel/Utility"

    def get_resolution(self, preset: str):
        width, height = self.PRESETS.get(preset, (512, 512))
        return (width, height)


# Export for registration
NODE_CLASS_MAPPINGS = {
    "ComfyAngel_SmartCrop": SmartCrop,
    "ComfyAngel_SolidColor": SolidColor,
    "ComfyAngel_SmartPosition": SmartPosition,
    "ComfyAngel_ImageInfo": ImageInfo,
    "ComfyAngel_ResolutionPicker": ResolutionPicker,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyAngel_SmartCrop": "Smart Crop",
    "ComfyAngel_SolidColor": "Solid Color",
    "ComfyAngel_SmartPosition": "Smart Position",
    "ComfyAngel_ImageInfo": "Image Info",
    "ComfyAngel_ResolutionPicker": "Resolution Picker",
}
