"""
Tensor utilities for ComfyUI IMAGE/MASK handling.

ComfyUI uses BHWC format:
- IMAGE: (Batch, Height, Width, Channels) with values 0.0-1.0
- MASK: (Batch, Height, Width) with values 0.0-1.0
"""

import torch
import numpy as np
from PIL import Image


def ensure_bhwc(tensor: torch.Tensor) -> torch.Tensor:
    """
    Ensure tensor has batch dimension (BHWC format).

    Some nodes return squeezed tensors without batch dim.
    This function safely adds it back.

    Args:
        tensor: Image tensor, either (H, W, C) or (B, H, W, C)

    Returns:
        Tensor with shape (B, H, W, C)
    """
    if tensor.dim() == 3:
        return tensor.unsqueeze(0)
    return tensor


def ensure_mask_batch(mask: torch.Tensor) -> torch.Tensor:
    """
    Ensure mask has batch dimension.

    Args:
        mask: Mask tensor, either (H, W) or (B, H, W)

    Returns:
        Tensor with shape (B, H, W)
    """
    if mask.dim() == 2:
        return mask.unsqueeze(0)
    return mask


def to_pil(tensor: torch.Tensor, index: int = 0) -> Image.Image:
    """
    Convert ComfyUI IMAGE tensor to PIL Image.

    Args:
        tensor: Image tensor (B, H, W, C) with values 0.0-1.0
        index: Batch index to extract

    Returns:
        PIL Image in RGB or RGBA mode (depending on channels)
    """
    tensor = ensure_bhwc(tensor)
    # Get single image from batch
    img = tensor[index]
    # Convert to numpy and scale to 0-255
    img_np = (img.cpu().numpy() * 255).astype(np.uint8)

    # Check number of channels
    channels = img_np.shape[2] if img_np.ndim == 3 else 1
    if channels == 4:
        return Image.fromarray(img_np, mode="RGBA")
    elif channels == 3:
        return Image.fromarray(img_np, mode="RGB")
    elif channels == 1:
        return Image.fromarray(img_np[:, :, 0], mode="L")
    else:
        # Fallback: treat as RGB
        return Image.fromarray(img_np[:, :, :3], mode="RGB")


def from_pil(image: Image.Image) -> torch.Tensor:
    """
    Convert PIL Image to ComfyUI IMAGE tensor.

    Args:
        image: PIL Image (RGB)

    Returns:
        Tensor with shape (1, H, W, C) and values 0.0-1.0
    """
    # Convert to RGB if needed
    if image.mode != "RGB":
        image = image.convert("RGB")
    # Convert to numpy array
    img_np = np.array(image).astype(np.float32) / 255.0
    # Convert to tensor and add batch dimension
    return torch.from_numpy(img_np).unsqueeze(0)


def clone_tensor(tensor: torch.Tensor) -> torch.Tensor:
    """
    Clone tensor to avoid modifying cached data.

    Always clone before modifying a tensor from node input!

    Args:
        tensor: Any tensor

    Returns:
        Cloned tensor
    """
    return tensor.clone()
