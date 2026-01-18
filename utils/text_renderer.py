"""
Text Renderer for Parameter Overlay.

Uses system fonts via PIL to render text on images.
"""

import os
import sys
from typing import Optional
from PIL import Image, ImageDraw, ImageFont


def get_system_font(size: int = 16, bold: bool = False) -> ImageFont.FreeTypeFont:
    """
    Get a system monospace font.

    Tries common font locations across platforms.
    Falls back to PIL default if nothing found.

    Args:
        size: Font size in pixels
        bold: Use bold variant if available

    Returns:
        PIL Font object
    """
    # Fonts with good Unicode/Thai support (prioritized first)
    # Then fallback to monospace fonts
    font_candidates = []

    if sys.platform == "win32":
        font_candidates = [
            # Thai/Unicode support (prioritized)
            "C:/Windows/Fonts/leelawui.ttf",  # Leelawadee UI (Thai)
            "C:/Windows/Fonts/leelauib.ttf",  # Leelawadee UI Bold
            "C:/Windows/Fonts/tahoma.ttf",  # Tahoma (Thai)
            "C:/Windows/Fonts/tahomabd.ttf",  # Tahoma Bold
            "C:/Windows/Fonts/segoeui.ttf",  # Segoe UI
            "C:/Windows/Fonts/segoeuib.ttf",  # Segoe UI Bold
            "C:/Windows/Fonts/arial.ttf",  # Arial
            # Monospace fallbacks
            "C:/Windows/Fonts/consola.ttf",  # Consolas
            "C:/Windows/Fonts/consolab.ttf",  # Consolas Bold
            "C:/Windows/Fonts/cour.ttf",  # Courier New
        ]
    elif sys.platform == "darwin":  # macOS
        font_candidates = [
            # Thai/Unicode support
            "/System/Library/Fonts/Thonburi.ttc",  # Thai
            "/System/Library/Fonts/Supplemental/Tahoma.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/SFNS.ttf",  # San Francisco
            # Monospace fallbacks
            "/System/Library/Fonts/Monaco.ttf",
            "/System/Library/Fonts/Menlo.ttc",
        ]
    else:  # Linux
        font_candidates = [
            # Thai/Unicode support
            "/usr/share/fonts/truetype/thai/Garuda.ttf",
            "/usr/share/fonts/truetype/thai/TlwgTypo.ttf",
            "/usr/share/fonts/truetype/tlwg/Garuda.ttf",
            "/usr/share/fonts/truetype/tlwg/TlwgTypo.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            # Monospace fallbacks
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
            "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
        ]

    # Try bold variants first if requested
    if bold:
        bold_candidates = [f.replace(".ttf", "b.ttf").replace("Regular", "Bold")
                          for f in font_candidates]
        font_candidates = bold_candidates + font_candidates

    # Try each font
    for font_path in font_candidates:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                continue

    # Fallback to PIL default
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        # Older PIL versions don't support size parameter
        return ImageFont.load_default()


class TextRenderer:
    """Renders text overlays on images."""

    def __init__(
        self,
        font_size: int = 14,
        padding: int = 8,
        bg_color: tuple = (0, 0, 0),
        text_color: tuple = (255, 255, 255),
        bg_opacity: float = 0.7,
    ):
        """
        Initialize renderer.

        Args:
            font_size: Font size in pixels
            padding: Padding around text in pixels
            bg_color: Background color RGB tuple
            text_color: Text color RGB tuple
            bg_opacity: Background opacity (0.0-1.0)
        """
        self.font_size = font_size
        self.padding = padding
        self.bg_color = bg_color
        self.text_color = text_color
        self.bg_opacity = bg_opacity
        self.font = get_system_font(font_size)

    def get_text_size(self, text: str) -> tuple[int, int]:
        """Get width and height of text."""
        # Create temporary image for measuring
        temp_img = Image.new("RGB", (1, 1))
        draw = ImageDraw.Draw(temp_img)
        bbox = draw.textbbox((0, 0), text, font=self.font)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]

    def wrap_text(self, text: str, max_width: int) -> list[str]:
        """
        Wrap text to fit within max_width.

        Args:
            text: Text to wrap
            max_width: Maximum width in pixels

        Returns:
            List of wrapped lines
        """
        if not text:
            return []

        # Account for padding
        available_width = max_width - (self.padding * 2)

        # Check if text fits
        text_width, _ = self.get_text_size(text)
        if text_width <= available_width:
            return [text]

        # Split by words
        words = text.split(' ')
        lines = []
        current_line = ""

        for word in words:
            test_line = f"{current_line} {word}".strip() if current_line else word
            test_width, _ = self.get_text_size(test_line)

            if test_width <= available_width:
                current_line = test_line
            else:
                # Word doesn't fit, check if current line has content
                if current_line:
                    lines.append(current_line)
                    current_line = word
                else:
                    # Single word too long, force break by character
                    current_line = self._break_word(word, available_width)
                    if len(current_line) < len(word):
                        # There's remaining text
                        lines.append(current_line)
                        current_line = word[len(current_line):]

        if current_line:
            lines.append(current_line)

        return lines

    def _break_word(self, word: str, max_width: int) -> str:
        """Break a single word to fit within max_width."""
        for i in range(len(word), 0, -1):
            width, _ = self.get_text_size(word[:i])
            if width <= max_width:
                return word[:i]
        return word[:1]  # At minimum return first character

    def wrap_lines(self, lines: list[str], max_width: int) -> list[str]:
        """
        Wrap multiple lines to fit within max_width.

        Args:
            lines: List of text lines
            max_width: Maximum width in pixels

        Returns:
            List of wrapped lines
        """
        wrapped = []
        for line in lines:
            wrapped.extend(self.wrap_text(line, max_width))
        return wrapped

    def render_text_block(
        self,
        lines: list[str],
        width: int,
        position: str = "bottom",
    ) -> Image.Image:
        """
        Render a text block with background.

        Args:
            lines: List of text lines
            width: Width of the output image
            position: "top" or "bottom" (affects visual style)

        Returns:
            RGBA image with text block
        """
        if not lines:
            return Image.new("RGBA", (width, 1), (0, 0, 0, 0))

        # Calculate dimensions
        line_height = self.font_size + 4
        total_height = len(lines) * line_height + self.padding * 2

        # Create RGBA image
        img = Image.new("RGBA", (width, total_height), (0, 0, 0, 0))

        # Draw semi-transparent background
        bg_alpha = int(255 * self.bg_opacity)
        bg_img = Image.new("RGBA", (width, total_height),
                          (*self.bg_color, bg_alpha))
        img = Image.alpha_composite(img, bg_img)

        # Draw text
        draw = ImageDraw.Draw(img)
        y = self.padding
        for line in lines:
            # Center text horizontally
            text_width, _ = self.get_text_size(line)
            x = (width - text_width) // 2
            draw.text((x, y), line, font=self.font, fill=(*self.text_color, 255))
            y += line_height

        return img

    def add_overlay_bottom(
        self,
        image: Image.Image,
        lines: list[str],
    ) -> Image.Image:
        """
        Add text overlay at the bottom of an image.

        This extends the image height to add the overlay.

        Args:
            image: Input PIL Image (RGB)
            lines: List of text lines

        Returns:
            New image with overlay added
        """
        if not lines:
            return image.copy()

        width, height = image.size

        # Wrap lines to fit image width
        wrapped_lines = self.wrap_lines(lines, width)

        # Render text block
        text_block = self.render_text_block(wrapped_lines, width, "bottom")
        text_height = text_block.size[1]

        # Create new image with extended height
        new_height = height + text_height
        result = Image.new("RGB", (width, new_height), self.bg_color)

        # Paste original image
        result.paste(image, (0, 0))

        # Paste text block at bottom
        result.paste(text_block, (0, height), text_block)

        return result

    def add_overlay_inside(
        self,
        image: Image.Image,
        lines: list[str],
        position: str = "bottom",
    ) -> Image.Image:
        """
        Add text overlay inside the image (doesn't extend size).

        Args:
            image: Input PIL Image (RGB)
            lines: List of text lines
            position: "top" or "bottom"

        Returns:
            Image with overlay
        """
        if not lines:
            return image.copy()

        width, height = image.size
        result = image.convert("RGBA")

        # Wrap lines to fit image width
        wrapped_lines = self.wrap_lines(lines, width)

        # Render text block
        text_block = self.render_text_block(wrapped_lines, width, position)
        text_height = text_block.size[1]

        # Calculate position
        if position == "top":
            y = 0
        else:  # bottom
            y = height - text_height

        # Composite
        result.paste(text_block, (0, y), text_block)

        return result.convert("RGB")
