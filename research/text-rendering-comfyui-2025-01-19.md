# Text Rendering for ComfyUI Custom Node Development

**Research Date:** 2025-01-19
**Tier:** Quick (10 sources)
**Type:** B - Multi-fact technical reference

---

## Executive Summary

Text rendering สำหรับ ComfyUI custom nodes ใช้ **PIL/Pillow** เป็นหลัก โดยมี key components:
1. **System Font Discovery** - ค้นหา fonts จาก OS (Windows/Linux/Mac)
2. **Font Loading** - ใช้ `ImageFont.truetype()`
3. **Text Measurement** - ใช้ `textbbox()` และ `textlength()`
4. **Text Rendering** - ใช้ `ImageDraw.text()` และ `multiline_text()`
5. **Text Effects** - stroke/outline ด้วย `stroke_width` + `stroke_fill`

---

## 1. System Font Discovery

### Font Locations by OS

```python
import os
import platform

def get_system_font_dirs():
    """Get system font directories for current OS."""
    system = platform.system()

    if system == "Windows":
        return [
            os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts"),
        ]
    elif system == "Darwin":  # macOS
        return [
            "/System/Library/Fonts",
            "/Library/Fonts",
            os.path.expanduser("~/Library/Fonts"),
        ]
    else:  # Linux
        return [
            "/usr/share/fonts",
            "/usr/local/share/fonts",
            os.path.expanduser("~/.fonts"),
            os.path.expanduser("~/.local/share/fonts"),
        ]

def find_fonts(extensions=(".ttf", ".otf")):
    """Find all font files in system directories."""
    fonts = []
    for font_dir in get_system_font_dirs():
        if os.path.exists(font_dir):
            for root, _, files in os.walk(font_dir):
                for file in files:
                    if file.lower().endswith(extensions):
                        fonts.append(os.path.join(root, file))
    return fonts
```

### Fallback Font Strategy

```python
# Priority order for fallback fonts
FALLBACK_FONTS = [
    # Windows
    "arial.ttf", "segoeui.ttf", "tahoma.ttf",
    # macOS
    "Helvetica.ttc", "Arial.ttf",
    # Linux
    "DejaVuSans.ttf", "LiberationSans-Regular.ttf", "FreeSans.ttf",
]

def get_fallback_font(size=16):
    """Get a font that works on the current system."""
    from PIL import ImageFont

    # Try system fonts
    for font_name in FALLBACK_FONTS:
        try:
            return ImageFont.truetype(font_name, size)
        except OSError:
            continue

    # Ultimate fallback: PIL default font (bitmap, no scaling)
    return ImageFont.load_default()
```

### Font Caching

```python
from functools import lru_cache
from PIL import ImageFont

@lru_cache(maxsize=32)
def load_font_cached(font_path: str, size: int) -> ImageFont.FreeTypeFont:
    """Load font with caching to avoid repeated disk access."""
    return ImageFont.truetype(font_path, size)
```

**Confidence:** HIGH
**Sources:** [Python Utilities sysfont](https://python-utilities.readthedocs.io/en/latest/sysfont.html), [Pillow ImageFont docs](https://pillow.readthedocs.io/en/stable/reference/ImageFont.html)

---

## 2. Font Loading with PIL/Pillow

### Basic Usage

```python
from PIL import ImageFont

# Load TrueType font
font = ImageFont.truetype("path/to/font.ttf", size=24)

# Load with specific encoding
font = ImageFont.truetype("font.ttf", size=24, encoding="unic")

# Load from bytes (useful for bundled fonts)
with open("font.ttf", "rb") as f:
    font_bytes = f.read()
font = ImageFont.truetype(io.BytesIO(font_bytes), size=24)
```

### Layout Engine Options

```python
from PIL import ImageFont

# Basic layout (faster, less features)
font = ImageFont.truetype("font.ttf", 24,
                          layout_engine=ImageFont.Layout.BASIC)

# Raqm layout (required for Thai, Arabic, complex scripts)
# Needs libraqm installed
font = ImageFont.truetype("font.ttf", 24,
                          layout_engine=ImageFont.Layout.RAQM)
```

**Key Points:**
- **BASIC layout:** Faster performance, good for simple Latin text
- **RAQM layout:** Required for bidirectional text, Thai, Arabic, Hebrew, and OpenType features

**Confidence:** HIGH
**Source:** [Pillow ImageFont documentation](https://pillow.readthedocs.io/en/stable/reference/ImageFont.html)

---

## 3. Text Measurement

### Getting Text Bounding Box

```python
from PIL import Image, ImageDraw, ImageFont

font = ImageFont.truetype("arial.ttf", 24)
draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))

# Method 1: textbbox (recommended, Pillow 8.0+)
bbox = draw.textbbox((0, 0), "Hello World", font=font)
# Returns: (left, top, right, bottom)
width = bbox[2] - bbox[0]
height = bbox[3] - bbox[1]

# Method 2: textlength (width only, more precise)
width = draw.textlength("Hello World", font=font)

# Method 3: font.getbbox (without anchor position)
bbox = font.getbbox("Hello World")
```

### Multiline Text Dimensions

```python
def get_multiline_text_size(draw, text, font, spacing=4):
    """Calculate total size of multiline text."""
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing)
    return (bbox[2] - bbox[0], bbox[3] - bbox[1])

# Example
text = "Line 1\nLine 2\nLine 3"
width, height = get_multiline_text_size(draw, text, font)
```

### Character-Level Metrics (Advanced)

```python
def get_text_metrics(font, text):
    """Get detailed metrics for text."""
    bbox = font.getbbox(text)

    return {
        "width": bbox[2] - bbox[0],
        "height": bbox[3] - bbox[1],
        "ascent": -bbox[1],  # Distance above baseline
        "descent": bbox[3],   # Distance below baseline
        "left_bearing": bbox[0],
    }
```

**Confidence:** HIGH
**Source:** [Pillow ImageDraw documentation](https://pillow.readthedocs.io/en/stable/reference/ImageDraw.html)

---

## 4. Text Layout (Multiline & Alignment)

### Text Wrapping Function

```python
def wrap_text(text, font, max_width, draw):
    """
    Wrap text to fit within max_width pixels.

    Args:
        text: Input text string
        font: PIL ImageFont object
        max_width: Maximum width in pixels
        draw: PIL ImageDraw object

    Returns:
        List of wrapped lines
    """
    words = text.split()
    lines = []
    current_line = []

    for word in words:
        test_line = ' '.join(current_line + [word])
        width = draw.textlength(test_line, font=font)
        if width <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]

    if current_line:
        lines.append(' '.join(current_line))

    return lines
```

### Text Alignment

```python
def draw_aligned_text(draw, position, text, font, fill, align="left", max_width=None):
    """
    Draw text with specified alignment.

    Args:
        align: "left", "center", or "right"
    """
    x, y = position

    if align == "left":
        draw.text((x, y), text, font=font, fill=fill)
    elif align == "center":
        text_width = draw.textlength(text, font=font)
        draw.text((x - text_width / 2, y), text, font=font, fill=fill)
    elif align == "right":
        text_width = draw.textlength(text, font=font)
        draw.text((x - text_width, y), text, font=font, fill=fill)
```

### Multiline with Alignment

```python
from PIL import Image, ImageDraw, ImageFont

image = Image.new("RGB", (400, 300), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("arial.ttf", 20)

text = "First line\nSecond line\nThird line"

# Draw multiline with center alignment
draw.multiline_text(
    (200, 50),           # Position
    text,
    font=font,
    fill="black",
    align="center",      # "left", "center", "right", or "justify"
    spacing=8,           # Pixels between lines
    anchor="ma"          # Middle-ascender anchor
)
```

### Complete Text Box Renderer

```python
def render_text_box(image, text, font, box_rect,
                    text_color="black", bg_color=None,
                    align="left", padding=10, spacing=4):
    """
    Render text within a bounding box with optional background.

    Args:
        box_rect: (x, y, width, height) tuple
    """
    draw = ImageDraw.Draw(image)
    x, y, width, height = box_rect

    # Draw background if specified
    if bg_color:
        draw.rectangle([x, y, x + width, y + height], fill=bg_color)

    # Wrap text to fit width
    max_text_width = width - (padding * 2)
    wrapped = wrap_text(text, font, max_text_width, draw)
    wrapped_text = "\n".join(wrapped)

    # Draw text
    text_x = x + padding
    text_y = y + padding

    draw.multiline_text(
        (text_x, text_y),
        wrapped_text,
        font=font,
        fill=text_color,
        align=align,
        spacing=spacing
    )

    return image
```

**Confidence:** HIGH
**Sources:** [DEV.to Text Wrapping Tutorial](https://dev.to/emiloju/wrap-and-render-multiline-text-on-images-using-pythons-pillow-library-2ppp), [Pillow ImageDraw](https://pillow.readthedocs.io/en/stable/reference/ImageDraw.html)

---

## 5. Unicode and Special Characters

### Thai, CJK, and Complex Scripts

```python
from PIL import ImageFont

# For Thai text - requires RAQM layout engine
# Install: pip install pillow[raqm] หรือ system libraqm

# Option 1: Use Raqm layout (if available)
try:
    font = ImageFont.truetype("THSarabunNew.ttf", 24,
                              layout_engine=ImageFont.Layout.RAQM)
except Exception:
    # Fallback to basic layout
    font = ImageFont.truetype("THSarabunNew.ttf", 24,
                              layout_engine=ImageFont.Layout.BASIC)

# Recommended Thai fonts:
# - TH Sarabun New
# - Noto Sans Thai
# - Tahoma (มีกับ Windows)
```

### Emoji Support

**Problem:** Standard Pillow cannot render color emojis properly - shows boxes or question marks.

**Solutions:**

```python
# Solution 1: Use pilmoji library
# pip install pilmoji

from pilmoji import Pilmoji
from PIL import Image, ImageFont

image = Image.new("RGB", (400, 200), "white")
font = ImageFont.truetype("arial.ttf", 32)

with Pilmoji(image) as pilmoji:
    pilmoji.text((10, 10), "Hello World! 🎉🔥", font=font, fill="black")

# Solution 2: Replace emoji with text or skip
import re

def remove_emojis(text):
    """Remove emoji characters from text."""
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+",
        flags=re.UNICODE
    )
    return emoji_pattern.sub('', text)
```

### Font Fallback for Missing Glyphs

```python
def can_render_text(font, text):
    """Check if font can render all characters in text."""
    try:
        # Try to get mask - will fail if glyphs missing
        font.getmask(text)
        return True
    except Exception:
        return False

def render_with_fallback(draw, position, text, primary_font, fallback_fonts, fill):
    """Render text with font fallback for missing glyphs."""
    x, y = position

    for char in text:
        rendered = False
        for font in [primary_font] + fallback_fonts:
            try:
                font.getmask(char)
                draw.text((x, y), char, font=font, fill=fill)
                x += draw.textlength(char, font=font)
                rendered = True
                break
            except Exception:
                continue

        if not rendered:
            # Skip or use replacement character
            x += draw.textlength("?", font=primary_font)
```

**Confidence:** MEDIUM
**Known Issues:**
- Color emoji rendering is problematic in native Pillow
- Thai text may not render correctly without Raqm library
- Font fallback is manual - no automatic system

**Sources:** [pilmoji PyPI](https://pypi.org/project/pilmoji/), [jdhao Color Emoji Guide](https://jdhao.github.io/2022/04/03/add_color_emoji_to_image_in_python/)

---

## 6. Text Effects

### Outline/Stroke Effect (Native - Pillow 6.2.0+)

```python
from PIL import Image, ImageDraw, ImageFont

image = Image.new("RGB", (400, 200), "gray")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("arial.ttf", 48)

# Draw text with outline
draw.text(
    (50, 50),
    "Outlined Text",
    font=font,
    fill="white",           # Text color
    stroke_width=2,         # Outline thickness (pixels)
    stroke_fill="black"     # Outline color
)

# IMPORTANT: Must specify BOTH stroke_width AND stroke_fill
# Otherwise stroke_fill defaults to fill color (invisible outline)
```

### Shadow Effect (Manual)

```python
def draw_text_with_shadow(draw, position, text, font,
                          fill="white", shadow_color="black",
                          shadow_offset=(2, 2)):
    """Draw text with drop shadow effect."""
    x, y = position
    sx, sy = shadow_offset

    # Draw shadow first (behind main text)
    draw.text((x + sx, y + sy), text, font=font, fill=shadow_color)

    # Draw main text on top
    draw.text((x, y), text, font=font, fill=fill)
```

### Soft Shadow (with blur)

```python
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def draw_text_with_soft_shadow(image, position, text, font,
                               fill="white", shadow_color="black",
                               shadow_offset=(3, 3), blur_radius=3):
    """Draw text with blurred drop shadow."""
    # Create shadow layer
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)

    x, y = position
    sx, sy = shadow_offset

    # Draw shadow text
    shadow_draw.text((x + sx, y + sy), text, font=font, fill=shadow_color)

    # Blur the shadow
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))

    # Composite shadow onto image
    image = Image.alpha_composite(image.convert("RGBA"), shadow)

    # Draw main text
    draw = ImageDraw.Draw(image)
    draw.text(position, text, font=font, fill=fill)

    return image
```

### Glow Effect

```python
def draw_text_with_glow(image, position, text, font,
                        fill="white", glow_color="cyan",
                        glow_radius=5, glow_intensity=3):
    """Draw text with glow effect."""
    # Create glow layer
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)

    # Draw multiple passes of text with increasing size for glow
    for i in range(glow_intensity, 0, -1):
        glow_draw.text(
            position, text, font=font, fill=glow_color,
            stroke_width=glow_radius * i // glow_intensity,
            stroke_fill=glow_color
        )

    # Blur glow
    glow = glow.filter(ImageFilter.GaussianBlur(glow_radius))

    # Composite
    image = Image.alpha_composite(image.convert("RGBA"), glow)

    # Draw main text
    draw = ImageDraw.Draw(image)
    draw.text(position, text, font=font, fill=fill)

    return image
```

**Confidence:** HIGH
**Source:** [jdhao Text Outline Tutorial](https://jdhao.github.io/2020/08/18/pillow_create_text_outline/), [Pillow ImageDraw](https://pillow.readthedocs.io/en/stable/reference/ImageDraw.html)

---

## 7. ComfyUI Integration Pattern

### Complete Text Renderer Class

```python
import os
import platform
from PIL import Image, ImageDraw, ImageFont
from functools import lru_cache
from typing import Optional, Tuple, List

class TextRenderer:
    """
    Text rendering utility for ComfyUI nodes.
    Handles font loading, measurement, and rendering.
    """

    # Font cache
    _font_cache = {}

    # System font directories
    FONT_DIRS = {
        "Windows": [
            os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts"),
        ],
        "Darwin": [
            "/System/Library/Fonts",
            "/Library/Fonts",
            os.path.expanduser("~/Library/Fonts"),
        ],
        "Linux": [
            "/usr/share/fonts",
            "/usr/local/share/fonts",
            os.path.expanduser("~/.fonts"),
        ]
    }

    # Fallback fonts by platform
    FALLBACK_FONTS = {
        "Windows": ["arial.ttf", "segoeui.ttf", "tahoma.ttf"],
        "Darwin": ["Helvetica.ttc", "Arial.ttf"],
        "Linux": ["DejaVuSans.ttf", "LiberationSans-Regular.ttf"],
    }

    @classmethod
    def get_font_dirs(cls) -> List[str]:
        """Get font directories for current platform."""
        system = platform.system()
        return cls.FONT_DIRS.get(system, cls.FONT_DIRS["Linux"])

    @classmethod
    def find_fonts(cls) -> List[str]:
        """Find all available fonts."""
        fonts = []
        for font_dir in cls.get_font_dirs():
            if os.path.exists(font_dir):
                for root, _, files in os.walk(font_dir):
                    for f in files:
                        if f.lower().endswith(('.ttf', '.otf', '.ttc')):
                            fonts.append(os.path.join(root, f))
        return sorted(fonts)

    @classmethod
    def get_font_names(cls) -> List[str]:
        """Get list of font filenames (for ComfyUI dropdown)."""
        fonts = cls.find_fonts()
        return [os.path.basename(f) for f in fonts]

    @classmethod
    @lru_cache(maxsize=64)
    def load_font(cls, font_path: str, size: int) -> ImageFont.FreeTypeFont:
        """Load font with caching."""
        try:
            return ImageFont.truetype(font_path, size)
        except Exception:
            # Try fallback
            system = platform.system()
            for fallback in cls.FALLBACK_FONTS.get(system, []):
                try:
                    return ImageFont.truetype(fallback, size)
                except Exception:
                    continue
            # Ultimate fallback
            return ImageFont.load_default()

    @classmethod
    def measure_text(cls, text: str, font: ImageFont.FreeTypeFont) -> Tuple[int, int]:
        """Get text dimensions."""
        dummy = Image.new("RGB", (1, 1))
        draw = ImageDraw.Draw(dummy)
        bbox = draw.textbbox((0, 0), text, font=font)
        return (bbox[2] - bbox[0], bbox[3] - bbox[1])

    @classmethod
    def wrap_text(cls, text: str, font: ImageFont.FreeTypeFont,
                  max_width: int) -> List[str]:
        """Wrap text to fit within max_width."""
        dummy = Image.new("RGB", (1, 1))
        draw = ImageDraw.Draw(dummy)

        words = text.split()
        lines = []
        current_line = []

        for word in words:
            test_line = ' '.join(current_line + [word])
            width = draw.textlength(test_line, font=font)
            if width <= max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]

        if current_line:
            lines.append(' '.join(current_line))

        return lines

    @classmethod
    def render(cls, image: Image.Image, text: str,
               position: Tuple[int, int], font: ImageFont.FreeTypeFont,
               color: str = "white",
               align: str = "left",
               stroke_width: int = 0,
               stroke_color: Optional[str] = None,
               shadow_offset: Optional[Tuple[int, int]] = None,
               shadow_color: str = "black") -> Image.Image:
        """
        Render text on image with optional effects.

        Args:
            image: PIL Image to draw on
            text: Text to render
            position: (x, y) position
            font: PIL ImageFont
            color: Text fill color
            align: "left", "center", or "right"
            stroke_width: Outline thickness
            stroke_color: Outline color
            shadow_offset: (x, y) shadow offset or None
            shadow_color: Shadow color

        Returns:
            Image with text rendered
        """
        draw = ImageDraw.Draw(image)
        x, y = position

        # Calculate position based on alignment
        if align in ("center", "right"):
            text_width = draw.textlength(text, font=font)
            if align == "center":
                x -= text_width / 2
            elif align == "right":
                x -= text_width

        # Draw shadow if specified
        if shadow_offset:
            sx, sy = shadow_offset
            draw.text((x + sx, y + sy), text, font=font, fill=shadow_color)

        # Draw main text
        if stroke_width > 0 and stroke_color:
            draw.text((x, y), text, font=font, fill=color,
                      stroke_width=stroke_width, stroke_fill=stroke_color)
        else:
            draw.text((x, y), text, font=font, fill=color)

        return image
```

### Example ComfyUI Node

```python
class TextOverlayNode:
    """ComfyUI node for text overlay."""

    @classmethod
    def INPUT_TYPES(cls):
        fonts = TextRenderer.get_font_names()
        return {
            "required": {
                "image": ("IMAGE",),
                "text": ("STRING", {"default": "Sample Text", "multiline": True}),
                "font": (fonts, {"default": fonts[0] if fonts else "arial.ttf"}),
                "font_size": ("INT", {"default": 24, "min": 8, "max": 256}),
                "x": ("INT", {"default": 10, "min": 0, "max": 4096}),
                "y": ("INT", {"default": 10, "min": 0, "max": 4096}),
                "color": ("STRING", {"default": "#FFFFFF"}),
                "align": (["left", "center", "right"], {"default": "left"}),
            },
            "optional": {
                "stroke_width": ("INT", {"default": 0, "min": 0, "max": 10}),
                "stroke_color": ("STRING", {"default": "#000000"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "render_text"
    CATEGORY = "ComfyAngel/Text"

    def render_text(self, image, text, font, font_size, x, y, color, align,
                    stroke_width=0, stroke_color="#000000"):
        import torch
        import numpy as np

        # Convert tensor to PIL
        # ComfyUI IMAGE is (B, H, W, C) in range 0-1
        batch_size = image.shape[0]
        results = []

        for i in range(batch_size):
            # Get single image
            img_tensor = image[i]
            img_np = (img_tensor.cpu().numpy() * 255).astype(np.uint8)
            pil_image = Image.fromarray(img_np)

            # Load font
            font_obj = TextRenderer.load_font(font, font_size)

            # Render text
            pil_image = TextRenderer.render(
                pil_image, text, (x, y), font_obj,
                color=color, align=align,
                stroke_width=stroke_width,
                stroke_color=stroke_color if stroke_width > 0 else None
            )

            # Convert back to tensor
            result_np = np.array(pil_image).astype(np.float32) / 255.0
            results.append(torch.from_numpy(result_np))

        return (torch.stack(results),)
```

---

## 8. Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Text appears as boxes | Font missing glyphs | Use font with Unicode support (Noto Sans) |
| Thai text garbled | Missing Raqm | `pip install pillow[raqm]` or use Thai-specific font |
| Emoji shows as ? | Pillow can't render color emoji | Use pilmoji library |
| Stroke invisible | stroke_fill not set | Always set BOTH stroke_width AND stroke_fill |
| Font not found | Wrong path | Use absolute path or search system fonts |
| Text blurry | Small font scaled up | Use larger font_size, not image scaling |
| Inconsistent size | Points vs pixels | Pillow uses pixels; 72 DPI = 1pt = 1px |
| Memory leak | Font objects created each call | Use font caching (lru_cache) |

---

## Sources

1. [Pillow ImageFont Documentation](https://pillow.readthedocs.io/en/stable/reference/ImageFont.html)
2. [Pillow ImageDraw Documentation](https://pillow.readthedocs.io/en/stable/reference/ImageDraw.html)
3. [DEV.to - Wrap and Render Multiline Text](https://dev.to/emiloju/wrap-and-render-multiline-text-on-images-using-pythons-pillow-library-2ppp)
4. [jdhao - Create Outline Text with Pillow](https://jdhao.github.io/2020/08/18/pillow_create_text_outline/)
5. [jdhao - Add Color Emoji in Python](https://jdhao.github.io/2022/04/03/add_color_emoji_to_image_in_python/)
6. [pilmoji PyPI](https://pypi.org/project/pilmoji/)
7. [Python Utilities sysfont](https://python-utilities.readthedocs.io/en/latest/sysfont.html)
8. [ComfyUI-TextOverlay GitHub](https://github.com/Munkyfoot/ComfyUI-TextOverlay)
9. [ComfyUI_Image_Text_Overlay GitHub](https://github.com/Big-Idea-Technology/ComfyUI_Image_Text_Overlay)
10. [RunComfy - ComfyUI Text Overlay Nodes](https://www.runcomfy.com/comfyui-nodes/ComfyUI-text-overlay)

---

## Key Takeaways

1. **Use PIL/Pillow** - It's the standard for ComfyUI nodes, well-documented
2. **Cache fonts** - Use `@lru_cache` to avoid repeated disk access
3. **Handle cross-platform** - Detect OS and search appropriate font directories
4. **Provide fallbacks** - Always have a backup font strategy
5. **Native stroke effects** - Use `stroke_width` + `stroke_fill` (Pillow 6.2.0+)
6. **Thai/CJK support** - Install Raqm library and use appropriate fonts
7. **Emoji limitation** - Consider pilmoji or skip emoji rendering
8. **Measure before render** - Use `textbbox()` for accurate positioning
