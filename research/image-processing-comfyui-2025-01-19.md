# Image Processing Techniques for ComfyUI Custom Node Development

**Research Date:** 2025-01-19
**Tier:** Quick (5-10 sources)
**Classification:** Type B (Multi-fact)

---

## Executive Summary

This research covers essential image processing techniques for ComfyUI custom node development, including PIL/Pillow operations, color space conversions, blend modes, tensor-PIL conversions, and mask operations. All techniques are documented with ComfyUI-specific patterns (BHWC format, 0-1 value range).

---

## 1. ComfyUI Tensor Fundamentals

### IMAGE Tensor Format

**Shape:** `[B, H, W, C]` (Batch, Height, Width, Channels)

| Dimension | Description | Typical Values |
|-----------|-------------|----------------|
| B | Batch size | 1+ |
| H | Height in pixels | Variable |
| W | Width in pixels | Variable |
| C | Channels (RGB) | 3 |

**Value Range:** `0.0` to `1.0` (float32)

**Key Difference from PyTorch:** ComfyUI uses "channel last" (BHWC), while PyTorch typically uses "channel first" (BCHW).

### MASK Tensor Format

**Shape:** `[B, H, W]` (no channel dimension)

| Value | Meaning |
|-------|---------|
| 0.0 | Fully masked (transparent) |
| 1.0 | Fully visible (opaque) |
| 0.0-1.0 | Partial masking |

### LATENT Format

**Shape:** `[B, C, H, W]` with C=4 (channel first!)

```python
latent = {"samples": torch.Tensor}  # Dict with 'samples' key
```

---

## 2. Tensor <-> PIL Conversion

### ComfyUI IMAGE to PIL

```python
import torch
from PIL import Image
import numpy as np

def tensor_to_pil(tensor: torch.Tensor) -> Image.Image:
    """
    Convert ComfyUI IMAGE tensor to PIL Image.

    Args:
        tensor: Shape [B, H, W, C] or [H, W, C], values 0-1

    Returns:
        PIL Image in RGB mode
    """
    # Handle batch dimension
    if tensor.dim() == 4:
        tensor = tensor[0]  # Take first image from batch

    # Convert to numpy and scale to 0-255
    np_image = tensor.cpu().numpy()
    np_image = (np_image * 255).clip(0, 255).astype(np.uint8)

    return Image.fromarray(np_image, mode='RGB')
```

### PIL to ComfyUI IMAGE

```python
def pil_to_tensor(image: Image.Image) -> torch.Tensor:
    """
    Convert PIL Image to ComfyUI IMAGE tensor.

    Args:
        image: PIL Image (RGB or RGBA)

    Returns:
        Tensor shape [1, H, W, C], values 0-1
    """
    # Ensure RGB mode
    if image.mode == 'RGBA':
        image = image.convert('RGB')
    elif image.mode != 'RGB':
        image = image.convert('RGB')

    # Convert to numpy
    np_image = np.array(image).astype(np.float32) / 255.0

    # Convert to tensor with batch dimension
    tensor = torch.from_numpy(np_image).unsqueeze(0)  # Add batch dim

    return tensor
```

### Batch Processing Pattern

```python
def process_batch(images: torch.Tensor) -> torch.Tensor:
    """Process each image in a batch."""
    results = []

    for i in range(images.shape[0]):
        # Extract single image [H, W, C]
        img = images[i]

        # Convert to PIL for processing
        pil_img = tensor_to_pil(img.unsqueeze(0))

        # Process with PIL...
        processed = some_pil_operation(pil_img)

        # Convert back
        tensor = pil_to_tensor(processed)
        results.append(tensor[0])  # Remove batch dim

    return torch.stack(results)  # Stack back to [B, H, W, C]
```

---

## 3. PIL/Pillow Operations

### Basic Image Operations

```python
from PIL import Image, ImageFilter, ImageOps

# Load and basic operations
img = Image.open("image.png")
img = img.convert("RGB")  # Ensure RGB

# Resize
resized = img.resize((512, 512), Image.Resampling.LANCZOS)

# Crop (left, top, right, bottom)
cropped = img.crop((100, 100, 400, 400))

# Rotate (degrees, counterclockwise)
rotated = img.rotate(45, expand=True, fillcolor=(0, 0, 0))

# Flip
flipped_h = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
flipped_v = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
```

### Resize Methods Comparison

| Method | Quality | Speed | Use Case |
|--------|---------|-------|----------|
| `NEAREST` | Low | Fast | Pixel art, masks |
| `BILINEAR` | Medium | Medium | General purpose |
| `BICUBIC` | High | Slower | Photos |
| `LANCZOS` | Highest | Slowest | Final output |

### Filter Operations

```python
from PIL import ImageFilter

# Blur filters
blurred = img.filter(ImageFilter.BLUR)
blurred_box = img.filter(ImageFilter.BoxBlur(radius=5))
blurred_gauss = img.filter(ImageFilter.GaussianBlur(radius=5))

# Sharpen
sharpened = img.filter(ImageFilter.SHARPEN)
unsharp = img.filter(ImageFilter.UnsharpMask(radius=2, percent=150))

# Edge detection
edges = img.filter(ImageFilter.FIND_EDGES)
contour = img.filter(ImageFilter.CONTOUR)
edge_enhance = img.filter(ImageFilter.EDGE_ENHANCE)

# Enhancement
detail = img.filter(ImageFilter.DETAIL)
smooth = img.filter(ImageFilter.SMOOTH)
emboss = img.filter(ImageFilter.EMBOSS)
```

### Custom Convolution Kernels

```python
from PIL import ImageFilter

# Custom 3x3 kernel
custom_kernel = ImageFilter.Kernel(
    size=(3, 3),
    kernel=[
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ],
    scale=1,
    offset=0
)
result = img.filter(custom_kernel)
```

---

## 4. Color Space Conversions

### PIL Built-in Modes

```python
from PIL import Image

# RGB <-> Grayscale
gray = img.convert("L")           # RGB to Grayscale
rgb = gray.convert("RGB")         # Grayscale to RGB

# RGB <-> RGBA
rgba = img.convert("RGBA")        # Add alpha channel
rgb = rgba.convert("RGB")         # Remove alpha

# RGB <-> HSV (PIL supported)
hsv = img.convert("HSV")
rgb = hsv.convert("RGB")
```

### OpenCV Color Conversions (More Options)

```python
import cv2
import numpy as np

def convert_color_space(tensor: torch.Tensor, target: str) -> torch.Tensor:
    """
    Convert tensor between color spaces.

    Args:
        tensor: ComfyUI IMAGE [B, H, W, C]
        target: "HSV", "LAB", "YCrCb", "GRAY"

    Returns:
        Converted tensor
    """
    conversions = {
        "HSV": cv2.COLOR_RGB2HSV,
        "LAB": cv2.COLOR_RGB2LAB,
        "YCrCb": cv2.COLOR_RGB2YCrCb,
        "GRAY": cv2.COLOR_RGB2GRAY,
    }

    results = []
    for i in range(tensor.shape[0]):
        # Convert tensor to numpy (0-255 for OpenCV)
        np_img = (tensor[i].cpu().numpy() * 255).astype(np.uint8)

        # Apply conversion
        converted = cv2.cvtColor(np_img, conversions[target])

        # Normalize back to 0-1
        converted = converted.astype(np.float32) / 255.0

        # Handle grayscale (add channel dim)
        if target == "GRAY":
            converted = np.expand_dims(converted, -1)
            converted = np.repeat(converted, 3, axis=-1)

        results.append(torch.from_numpy(converted))

    return torch.stack(results)
```

### Color Space Value Ranges

| Space | Channel 1 | Channel 2 | Channel 3 |
|-------|-----------|-----------|-----------|
| RGB | R: 0-255 | G: 0-255 | B: 0-255 |
| HSV (OpenCV) | H: 0-179 | S: 0-255 | V: 0-255 |
| LAB | L: 0-255 | A: 0-255 | B: 0-255 |
| YCrCb | Y: 16-235 | Cr: 16-240 | Cb: 16-240 |

---

## 5. Blend Modes

### Mathematical Formulas

All formulas assume values normalized to 0-1 range.

```python
import numpy as np

def blend_normal(bg, fg, alpha=1.0):
    """Normal blend: fg over bg"""
    return bg * (1 - alpha) + fg * alpha

def blend_multiply(bg, fg):
    """Multiply: darkens image"""
    return bg * fg

def blend_screen(bg, fg):
    """Screen: lightens image"""
    return 1 - (1 - bg) * (1 - fg)

def blend_overlay(bg, fg):
    """Overlay: multiply dark, screen light"""
    return np.where(
        bg < 0.5,
        2 * bg * fg,
        1 - 2 * (1 - bg) * (1 - fg)
    )

def blend_soft_light(bg, fg):
    """Soft light: gentle contrast"""
    return np.where(
        fg < 0.5,
        bg - (1 - 2 * fg) * bg * (1 - bg),
        bg + (2 * fg - 1) * (np.sqrt(bg) - bg)
    )

def blend_hard_light(bg, fg):
    """Hard light: overlay with fg/bg swapped"""
    return blend_overlay(fg, bg)

def blend_color_dodge(bg, fg):
    """Color dodge: brighten based on fg"""
    return np.minimum(1.0, bg / (1 - fg + 1e-6))

def blend_color_burn(bg, fg):
    """Color burn: darken based on fg"""
    return np.maximum(0.0, 1 - (1 - bg) / (fg + 1e-6))

def blend_difference(bg, fg):
    """Difference: absolute difference"""
    return np.abs(bg - fg)

def blend_add(bg, fg):
    """Add: linear dodge"""
    return np.minimum(1.0, bg + fg)

def blend_subtract(bg, fg):
    """Subtract"""
    return np.maximum(0.0, bg - fg)

def blend_darken(bg, fg):
    """Darken: keep darker pixels"""
    return np.minimum(bg, fg)

def blend_lighten(bg, fg):
    """Lighten: keep lighter pixels"""
    return np.maximum(bg, fg)
```

### Alpha Compositing (Porter-Duff)

```python
def alpha_composite(bg: torch.Tensor, fg: torch.Tensor,
                    mask: torch.Tensor) -> torch.Tensor:
    """
    Composite fg over bg using mask as alpha.

    Args:
        bg: Background [B, H, W, C]
        fg: Foreground [B, H, W, C]
        mask: Alpha mask [B, H, W] values 0-1

    Returns:
        Composited image [B, H, W, C]
    """
    # Expand mask to match channels
    alpha = mask.unsqueeze(-1)  # [B, H, W, 1]

    # Porter-Duff "over" operation
    result = fg * alpha + bg * (1 - alpha)

    return result
```

### Using blend_modes Library

```python
from blend_modes import multiply, screen, overlay, soft_light
import numpy as np

def apply_blend_mode(bg_tensor: torch.Tensor,
                     fg_tensor: torch.Tensor,
                     mode: str,
                     opacity: float = 1.0) -> torch.Tensor:
    """
    Apply blend mode using blend_modes library.

    Note: Library expects RGBA float arrays with values 0-255
    """
    blend_funcs = {
        'multiply': multiply,
        'screen': screen,
        'overlay': overlay,
        'soft_light': soft_light,
    }

    # Convert to numpy RGBA (0-255 range)
    bg = bg_tensor[0].cpu().numpy() * 255
    fg = fg_tensor[0].cpu().numpy() * 255

    # Add alpha channel if needed
    if bg.shape[-1] == 3:
        bg = np.dstack([bg, np.full(bg.shape[:2], 255)])
    if fg.shape[-1] == 3:
        fg = np.dstack([fg, np.full(fg.shape[:2], 255)])

    # Apply blend
    blended = blend_funcs[mode](bg, fg, opacity)

    # Convert back (remove alpha, normalize)
    result = blended[:, :, :3] / 255.0
    return torch.from_numpy(result).unsqueeze(0).float()
```

---

## 6. Mask Operations

### Creating Masks

```python
def create_mask_from_threshold(image: torch.Tensor,
                               threshold: float = 0.5) -> torch.Tensor:
    """Create binary mask from image luminance."""
    # Convert to grayscale (luminance)
    luminance = 0.299 * image[..., 0] + 0.587 * image[..., 1] + 0.114 * image[..., 2]

    # Apply threshold
    mask = (luminance > threshold).float()

    return mask  # Shape [B, H, W]

def create_mask_from_alpha(rgba_tensor: torch.Tensor) -> torch.Tensor:
    """Extract alpha channel as mask."""
    return rgba_tensor[..., 3]  # Shape [B, H, W]
```

### Mask Manipulation with PIL

```python
def erode_mask(mask: torch.Tensor, iterations: int = 1) -> torch.Tensor:
    """
    Erode mask (shrink white areas).
    Uses PIL MinFilter.
    """
    results = []
    for i in range(mask.shape[0]):
        # Convert to PIL grayscale
        np_mask = (mask[i].cpu().numpy() * 255).astype(np.uint8)
        pil_mask = Image.fromarray(np_mask, mode='L')

        # Apply erosion
        for _ in range(iterations):
            pil_mask = pil_mask.filter(ImageFilter.MinFilter(3))

        # Convert back
        result = torch.from_numpy(np.array(pil_mask).astype(np.float32) / 255.0)
        results.append(result)

    return torch.stack(results)

def dilate_mask(mask: torch.Tensor, iterations: int = 1) -> torch.Tensor:
    """
    Dilate mask (expand white areas).
    Uses PIL MaxFilter.
    """
    results = []
    for i in range(mask.shape[0]):
        np_mask = (mask[i].cpu().numpy() * 255).astype(np.uint8)
        pil_mask = Image.fromarray(np_mask, mode='L')

        for _ in range(iterations):
            pil_mask = pil_mask.filter(ImageFilter.MaxFilter(3))

        result = torch.from_numpy(np.array(pil_mask).astype(np.float32) / 255.0)
        results.append(result)

    return torch.stack(results)

def blur_mask(mask: torch.Tensor, radius: float = 5.0) -> torch.Tensor:
    """
    Blur mask edges (feathering).
    """
    results = []
    for i in range(mask.shape[0]):
        np_mask = (mask[i].cpu().numpy() * 255).astype(np.uint8)
        pil_mask = Image.fromarray(np_mask, mode='L')

        pil_mask = pil_mask.filter(ImageFilter.GaussianBlur(radius))

        result = torch.from_numpy(np.array(pil_mask).astype(np.float32) / 255.0)
        results.append(result)

    return torch.stack(results)
```

### Applying Masks to Images

```python
def apply_mask(image: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """
    Apply mask to image (multiply).

    Args:
        image: [B, H, W, C]
        mask: [B, H, W]

    Returns:
        Masked image [B, H, W, C]
    """
    # Expand mask to match channels
    mask_expanded = mask.unsqueeze(-1)  # [B, H, W, 1]

    return image * mask_expanded

def invert_mask(mask: torch.Tensor) -> torch.Tensor:
    """Invert mask values."""
    return 1.0 - mask

def combine_masks(mask1: torch.Tensor, mask2: torch.Tensor,
                  operation: str = "multiply") -> torch.Tensor:
    """
    Combine two masks.

    Operations:
        multiply: intersection (AND)
        add: union (OR)
        subtract: difference
        max: union (OR)
        min: intersection (AND)
    """
    ops = {
        "multiply": lambda a, b: a * b,
        "add": lambda a, b: torch.clamp(a + b, 0, 1),
        "subtract": lambda a, b: torch.clamp(a - b, 0, 1),
        "max": torch.maximum,
        "min": torch.minimum,
    }
    return ops[operation](mask1, mask2)
```

---

## 7. Performance Considerations

### Memory Management

```python
# Always clone before modifying
image = image.clone()

# Use no_grad for inference
with torch.no_grad():
    result = process_image(image)

# Move to CPU for PIL operations, GPU for tensor ops
cpu_tensor = tensor.cpu()
gpu_tensor = tensor.to('cuda')

# Clean up large tensors
del large_tensor
torch.cuda.empty_cache()  # If using GPU
```

### Batch vs Single Image Processing

```python
# Preferred: Process entire batch with tensor operations
def batch_brightness(images: torch.Tensor, factor: float) -> torch.Tensor:
    return torch.clamp(images * factor, 0, 1)

# Fallback: Loop when PIL is necessary
def batch_pil_operation(images: torch.Tensor) -> torch.Tensor:
    results = []
    for i in range(images.shape[0]):
        pil_img = tensor_to_pil(images[i:i+1])
        processed = pil_operation(pil_img)
        results.append(pil_to_tensor(processed)[0])
    return torch.stack(results)
```

### Common Gotchas

| Issue | Wrong | Correct |
|-------|-------|---------|
| Dimension check | `if tensor.dim() == 3` only | Handle both 3D and 4D |
| Value range | Assume 0-255 | Check if 0-1 or 0-255 |
| Tensor truthiness | `if mask:` | `if mask is not None:` |
| Modifying input | `image[0] = 0` | `image = image.clone(); image[0] = 0` |
| Channel order | PyTorch BCHW | ComfyUI BHWC |

---

## 8. Complete Node Example

```python
import torch
import numpy as np
from PIL import Image, ImageFilter

class ImageProcessingNode:
    """Example node demonstrating all techniques."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "operation": (["blur", "sharpen", "edge", "invert"],),
                "strength": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 2.0,
                    "step": 0.1
                }),
            },
            "optional": {
                "mask": ("MASK",),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "generated_mask")
    FUNCTION = "process"
    CATEGORY = "ComfyAngel/ImageProcessing"

    def process(self, image, operation, strength, mask=None):
        # Clone to avoid modifying cached data
        result = image.clone()

        # Ensure 4D tensor
        if result.dim() == 3:
            result = result.unsqueeze(0)

        # Process each image in batch
        processed = []
        masks = []

        for i in range(result.shape[0]):
            # Convert to PIL
            np_img = (result[i].cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
            pil_img = Image.fromarray(np_img, mode='RGB')

            # Apply operation
            if operation == "blur":
                radius = strength * 5
                pil_img = pil_img.filter(ImageFilter.GaussianBlur(radius))
            elif operation == "sharpen":
                pil_img = pil_img.filter(ImageFilter.UnsharpMask(
                    radius=2, percent=int(strength * 150)
                ))
            elif operation == "edge":
                pil_img = pil_img.filter(ImageFilter.FIND_EDGES)
            elif operation == "invert":
                np_img = 255 - np.array(pil_img)
                pil_img = Image.fromarray(np_img)

            # Convert back to tensor
            processed_np = np.array(pil_img).astype(np.float32) / 255.0
            processed.append(torch.from_numpy(processed_np))

            # Generate luminance mask
            lum = 0.299 * processed_np[..., 0] + 0.587 * processed_np[..., 1] + 0.114 * processed_np[..., 2]
            masks.append(torch.from_numpy(lum))

        # Stack results
        output_image = torch.stack(processed)
        output_mask = torch.stack(masks)

        # Apply input mask if provided
        if mask is not None:
            # Ensure mask has correct dimensions
            if mask.dim() == 2:
                mask = mask.unsqueeze(0)

            # Expand for channels
            mask_expanded = mask.unsqueeze(-1)

            # Blend with original based on mask
            output_image = image * (1 - mask_expanded) + output_image * mask_expanded

        return (output_image, output_mask)
```

---

## Sources

1. [ComfyUI Official Docs - Images and Masks](https://docs.comfy.org/custom-nodes/backend/images_and_masks)
2. [Pillow ImageFilter Documentation](https://pillow.readthedocs.io/en/stable/reference/ImageFilter.html)
3. [blend-modes PyPI](https://pypi.org/project/blend-modes/)
4. [blend-modes Documentation](https://blend-modes.readthedocs.io/en/latest/reference.html)
5. [Torchvision pil_to_tensor](https://docs.pytorch.org/vision/main/generated/torchvision.transforms.functional.pil_to_tensor.html)
6. [OpenCV Color Spaces](https://learnopencv.com/color-spaces-in-opencv-cpp-python/)
7. [HommageTools for ComfyUI](https://github.com/ArtHommage/HommageTools)
8. [ComfyUI_ImageProcessing](https://github.com/bvhari/ComfyUI_ImageProcessing)
9. [Alpha Blending with PIL](https://note.nkmk.me/en/python-pillow-composite/)
10. [Python colorsys module](https://docs.python.org/3/library/colorsys.html)

---

## Quick Reference Card

### Tensor Shapes
```
IMAGE: [B, H, W, C] where C=3, values 0-1
MASK:  [B, H, W], values 0-1
LATENT: {"samples": [B, C, H, W]} where C=4
```

### Key Conversions
```python
# Tensor to PIL
np_img = (tensor[0].cpu().numpy() * 255).astype(np.uint8)
pil = Image.fromarray(np_img, 'RGB')

# PIL to Tensor
tensor = torch.from_numpy(np.array(pil) / 255.0).unsqueeze(0)

# Mask expand for multiplication
mask_4d = mask.unsqueeze(-1)  # [B,H,W] -> [B,H,W,1]
```

### Essential PIL Filters
```python
ImageFilter.GaussianBlur(radius)  # Smooth
ImageFilter.UnsharpMask(radius, percent)  # Sharpen
ImageFilter.MinFilter(3)  # Erode
ImageFilter.MaxFilter(3)  # Dilate
ImageFilter.FIND_EDGES  # Edge detection
```

### Blend Mode Formulas
```python
multiply = a * b
screen = 1 - (1-a) * (1-b)
overlay = where(a<0.5, 2*a*b, 1-2*(1-a)*(1-b))
```
