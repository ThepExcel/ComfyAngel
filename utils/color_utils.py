"""
Color utilities for ComfyAngel nodes.

Shared functions for hex color conversion.
"""


def hex_to_rgb(hex_color: str, default: tuple[int, int, int] = (255, 255, 255)) -> tuple[int, int, int]:
    """
    Convert hex color (#FFFFFF or #FFF) to RGB tuple.

    Args:
        hex_color: Hex color string (with or without #)
        default: Default color if parsing fails

    Returns:
        RGB tuple (0-255 each)
    """
    hex_color = hex_color.strip().lstrip("#")

    # Expand shorthand (#FFF -> FFFFFF)
    if len(hex_color) == 3:
        hex_color = "".join([c * 2 for c in hex_color])

    # Validate length
    if len(hex_color) != 6:
        return default

    try:
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    except ValueError:
        return default


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    """
    Convert RGB tuple to hex color string.

    Args:
        rgb: RGB tuple (0-255 each)

    Returns:
        Hex color string with # prefix
    """
    return f"#{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"
