"""
Visual Widget Nodes for ComfyAngel.

Nodes with enhanced JS widget interfaces.
"""

import torch
import numpy as np
from PIL import Image

from ..utils.tensor_ops import ensure_bhwc, to_pil, from_pil, clone_tensor


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


class SmartComposite:
    """
    Composite two images with visual position picker.

    Place an overlay image on a canvas with position, scale,
    blend mode, and opacity controls.
    """

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

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "canvas": ("IMAGE",),
                "overlay": ("IMAGE",),
                "x": ("INT", {"default": 0, "min": -8192, "max": 8192, "step": 1}),
                "y": ("INT", {"default": 0, "min": -8192, "max": 8192, "step": 1}),
                "anchor": (cls.ANCHORS, {"default": "top_left"}),
                "scale": ("FLOAT", {"default": 100.0, "min": 1.0, "max": 500.0, "step": 1.0}),
                "blend_mode": (cls.BLEND_MODES, {"default": "normal"}),
                "opacity": ("FLOAT", {"default": 100.0, "min": 0.0, "max": 100.0, "step": 1.0}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "composite"
    CATEGORY = "ComfyAngel/Composite"

    def composite(
        self,
        canvas,
        overlay,
        x: int,
        y: int,
        anchor: str,
        scale: float,
        blend_mode: str,
        opacity: float,
    ):
        canvas = ensure_bhwc(canvas)
        overlay = ensure_bhwc(overlay)

        # Clone canvas to avoid modifying original
        result = clone_tensor(canvas)

        batch_size = canvas.shape[0]
        overlay_batch = overlay.shape[0]

        results = []

        for i in range(batch_size):
            canvas_img = to_pil(result, i)
            # Use matching overlay or last one if batch sizes differ
            overlay_idx = min(i, overlay_batch - 1)
            overlay_img = to_pil(overlay, overlay_idx)

            # Scale overlay
            if scale != 100.0:
                new_w = max(1, int(overlay_img.width * scale / 100))
                new_h = max(1, int(overlay_img.height * scale / 100))
                overlay_img = overlay_img.resize((new_w, new_h), Image.LANCZOS)

            # Calculate position based on anchor
            pos_x, pos_y = self._calc_anchor_position(
                x, y, anchor, overlay_img.width, overlay_img.height
            )

            # Apply blend mode and composite
            composited = self._blend_images(
                canvas_img, overlay_img, pos_x, pos_y, blend_mode, opacity / 100.0
            )

            results.append(from_pil(composited))

        return (torch.cat(results, dim=0),)

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


class ColorPicker:
    """
    Pick a color with visual color picker.

    Supports RGB, HSL, and Hex formats.
    Can pick color from connected image using eyedropper.
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
        # Find resolution in selected aspect ratio first
        if aspect_ratio in self.RESOLUTIONS:
            resolutions = self.RESOLUTIONS[aspect_ratio]
            if resolution in resolutions:
                width, height = resolutions[resolution]
                return (width, height, aspect_ratio)

        # Fallback: search all aspect ratios
        for aspect, resolutions in self.RESOLUTIONS.items():
            if resolution in resolutions:
                width, height = resolutions[resolution]
                return (width, height, aspect)

        return (1024, 1024, "1:1 (Square)")


# Export for registration
NODE_CLASS_MAPPINGS = {
    "ComfyAngel_SmartCrop": SmartCrop,
    "ComfyAngel_SolidColor": SolidColor,
    "ComfyAngel_SmartComposite": SmartComposite,
    "ComfyAngel_ColorPicker": ColorPicker,
    "ComfyAngel_ImageInfo": ImageInfo,
    "ComfyAngel_ResolutionPicker": ResolutionPicker,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyAngel_SmartCrop": "Smart Crop 🪽",
    "ComfyAngel_SolidColor": "Solid Color 🪽",
    "ComfyAngel_SmartComposite": "Smart Composite 🪽",
    "ComfyAngel_ColorPicker": "Color Picker 🪽",
    "ComfyAngel_ImageInfo": "Image Info 🪽",
    "ComfyAngel_ResolutionPicker": "Resolution Picker 🪽",
}
