# PyTorch Tensor Operations for ComfyUI Custom Node Development

**Research Date:** 2026-01-19
**Tier:** Quick (5-10 sources)
**Type:** B - Multi-fact technical research

---

## Executive Summary

This research documents PyTorch tensor operations specifically for ComfyUI custom node development. Key findings include ComfyUI's BHWC format (vs PyTorch's native BCHW), proper dtype handling, memory management patterns, and broadcasting rules essential for image processing nodes.

---

## 1. Tensor Shapes and Formats

### ComfyUI Standard Formats

| Type | Shape | Description |
|------|-------|-------------|
| **IMAGE** | `(B, H, W, C)` | Batch, Height, Width, Channels; values 0.0-1.0 |
| **MASK** | `(B, H, W)` | Batch, Height, Width; values 0.0-1.0 |
| **LATENT** | `(B, C, H, W)` | BCHW format for latent space |

**Key Insight:** ComfyUI uses **BHWC** (channels last) for images, while PyTorch natively uses **BCHW** (channels first). This is a critical distinction when using PyTorch operations.

### BHWC vs BCHW Conversion

```python
# BHWC (ComfyUI) -> BCHW (PyTorch native)
image_bchw = image_bhwc.permute(0, 3, 1, 2)

# BCHW (PyTorch native) -> BHWC (ComfyUI)
image_bhwc = image_bchw.permute(0, 2, 3, 1)
```

**Using einops (more readable):**
```python
from einops import rearrange

# BHWC -> BCHW
image_bchw = rearrange(image, "b h w c -> b c h w")

# BCHW -> BHWC
image_bhwc = rearrange(image, "b c h w -> b h w c")
```

### Common Shape Manipulations

#### squeeze / unsqueeze

```python
# Problem: Some nodes return squeezed tensors without batch dim
# Solution: Always ensure batch dimension exists

def ensure_bhwc(tensor: torch.Tensor) -> torch.Tensor:
    """Ensure tensor has batch dimension (BHWC format)."""
    if tensor.dim() == 3:  # (H, W, C) missing batch
        return tensor.unsqueeze(0)  # -> (1, H, W, C)
    return tensor

def ensure_mask_batch(mask: torch.Tensor) -> torch.Tensor:
    """Ensure mask has batch dimension."""
    if mask.dim() == 2:  # (H, W) missing batch
        return mask.unsqueeze(0)  # -> (1, H, W)
    return mask
```

#### Adding dimensions with None

```python
# Using None in slicing inserts dimension of size 1
a = torch.Tensor([1, 2])  # shape: (2,)
a[:, None].shape          # shape: (2, 1)
a[None, :].shape          # shape: (1, 2)
```

#### reshape with -1 (auto-calculate)

```python
# -1 calculates dimension automatically
tensor.reshape((1, -1))    # Flatten to (1, N)
tensor.reshape((-1, 3))    # Reshape to (N, 3)
```

### Batch Processing Pattern

```python
def process_batch(images: torch.Tensor) -> torch.Tensor:
    """Process each image in batch."""
    images = ensure_bhwc(images)
    batch_size = images.shape[0]
    results = []

    for i in range(batch_size):
        single_image = images[i]  # (H, W, C)
        # Process single image...
        processed = some_operation(single_image)
        results.append(processed.unsqueeze(0))  # Add batch back

    return torch.cat(results, dim=0)  # (B, H, W, C)
```

---

## 2. Data Types (dtypes)

### Floating Point Types

| dtype | Bits | Range | Precision | Use Case |
|-------|------|-------|-----------|----------|
| `torch.float32` | 32 | Large | High | Default, most operations |
| `torch.float16` | 16 | Limited | Low | Memory savings, Tensor Cores |
| `torch.bfloat16` | 16 | Large (like f32) | Low | Training stability |

### When to Use Each

- **float32**: Default choice, safe for all operations
- **float16**: Use for memory-constrained scenarios on GPUs with Tensor Cores. Can cause overflow/underflow.
- **bfloat16**: Better than float16 when dynamic range matters (avoids overflow). Use if float16 causes instabilities.

### dtype Conversion

```python
# Convert dtype
tensor_fp16 = tensor.to(torch.float16)
tensor_fp32 = tensor.to(torch.float32)

# Check dtype
print(tensor.dtype)  # torch.float32

# Create with specific dtype
tensor = torch.zeros(1, 3, 512, 512, dtype=torch.float16)
```

### Precision Considerations

```python
# WARNING: float32 -> float16 loses precision!
# Range: float16 max ~65504, min ~6e-8

# Inspect dtype properties
info = torch.finfo(torch.float16)
print(f"Max: {info.max}, Min: {info.min}")
```

### Mixed Precision Pattern

```python
# Using autocast for automatic mixed precision
with torch.cuda.amp.autocast():
    # Operations automatically use appropriate precision
    output = model(input_tensor)
```

---

## 3. GPU Memory Management

### Device Management

```python
# Check device
device = tensor.device  # cpu or cuda:0

# Move between devices
tensor_gpu = tensor.to("cuda")
tensor_cpu = tensor.to("cpu")

# Create on specific device
tensor = torch.zeros(1, 3, 512, 512, device="cuda")
```

### Memory-Efficient Patterns

#### 1. Use torch.no_grad() for Inference

```python
# CRITICAL: Always use no_grad when not training
with torch.no_grad():
    output = process_image(input_tensor)

# Why: Prevents storing intermediate buffers for gradient computation
# Result: Significant memory savings and faster execution
```

#### 2. Use torch.inference_mode() (Even Better)

```python
# More efficient than no_grad for pure inference
with torch.inference_mode():
    output = process_image(input_tensor)

# Difference: Also disables view tracking and version counter bumps
# Warning: Tensors created here can't be used in autograd later
```

#### 3. Clear Intermediate Tensors

```python
def process_large_image(image):
    with torch.no_grad():
        intermediate = heavy_operation_1(image)
        result = heavy_operation_2(intermediate)
        del intermediate  # Explicitly release memory
        torch.cuda.empty_cache()  # Release cached memory
        return result
```

#### 4. Process in Batches (Memory Control)

```python
def process_batch_safe(images, batch_size=4):
    """Process in smaller batches to control memory."""
    results = []
    for i in range(0, len(images), batch_size):
        batch = images[i:i+batch_size]
        with torch.no_grad():
            result = process(batch)
        results.append(result)
        del batch
        torch.cuda.empty_cache()
    return torch.cat(results, dim=0)
```

### Memory Monitoring

```python
# Check memory usage
print(f"Allocated: {torch.cuda.memory_allocated() / 1e9:.2f} GB")
print(f"Reserved: {torch.cuda.memory_reserved() / 1e9:.2f} GB")
print(f"Max Allocated: {torch.cuda.max_memory_allocated() / 1e9:.2f} GB")

# Clear cache
torch.cuda.empty_cache()

# Reset peak stats
torch.cuda.reset_peak_memory_stats()
```

---

## 4. Broadcasting and Common Operations

### Broadcasting Rules (PyTorch)

Two tensors are **broadcastable** if:
1. Each tensor has at least one dimension
2. When comparing dimensions from right to left:
   - Sizes are equal, OR
   - One of them is 1, OR
   - One doesn't exist

```python
# Compatible:
# (5, 3, 4, 1) + (3, 1, 1) -> (5, 3, 4, 1)
# (1,)        + (3, 1, 7) -> (3, 1, 7)

# Incompatible:
# (5, 2, 4, 1) + (3, 1, 1) -> ERROR (2 != 3)
```

### Element-wise Operations

```python
# All arithmetic operations are element-wise
result = tensor_a + tensor_b   # Add
result = tensor_a - tensor_b   # Subtract
result = tensor_a * tensor_b   # Multiply
result = tensor_a / tensor_b   # Divide

# With broadcasting
image = image * 2.0  # Scale all values
image = image + 0.5  # Add offset

# Per-channel operations (BHWC format)
# Apply different multiplier per channel
multiplier = torch.tensor([1.0, 0.5, 0.8])  # (3,)
image = image * multiplier  # (B,H,W,C) * (C,) broadcasts
```

### Common Image Operations

```python
# Normalize to 0-1 range
image = (image - image.min()) / (image.max() - image.min())

# Clamp values
image = torch.clamp(image, 0.0, 1.0)

# Blend two images
alpha = 0.5
blended = image1 * alpha + image2 * (1 - alpha)

# Apply mask (MASK is (B,H,W), IMAGE is (B,H,W,C))
mask = mask.unsqueeze(-1)  # (B,H,W) -> (B,H,W,1)
masked_image = image * mask  # Broadcasts across channels
```

### Concatenation and Stacking

```python
# Stack along new dimension
images = [img1, img2, img3]  # Each (H, W, C)
batch = torch.stack(images, dim=0)  # (3, H, W, C)

# Concatenate along existing dimension
batch1 = ...  # (2, H, W, C)
batch2 = ...  # (3, H, W, C)
combined = torch.cat([batch1, batch2], dim=0)  # (5, H, W, C)

# Horizontal concat (same height)
wide = torch.cat([img1, img2], dim=2)  # Along width

# Vertical concat (same width)
tall = torch.cat([img1, img2], dim=1)  # Along height
```

---

## 5. Best Practices for ComfyUI

### Tensor Validation Pattern

```python
def validate_image_tensor(tensor: torch.Tensor, name: str = "tensor") -> torch.Tensor:
    """Validate and normalize ComfyUI IMAGE tensor."""
    # Ensure tensor exists
    if tensor is None:
        raise ValueError(f"{name} cannot be None")

    # Check dimensions
    if tensor.dim() not in (3, 4):
        raise ValueError(f"{name} must be 3D (H,W,C) or 4D (B,H,W,C), got {tensor.dim()}D")

    # Add batch if needed
    if tensor.dim() == 3:
        tensor = tensor.unsqueeze(0)

    # Verify BHWC format (channels should be 1, 3, or 4)
    if tensor.shape[-1] not in (1, 3, 4):
        raise ValueError(f"{name} channels must be 1, 3, or 4, got {tensor.shape[-1]}")

    return tensor
```

### Avoiding Memory Leaks

```python
class MyNode:
    def process(self, image):
        # ALWAYS clone before modifying input!
        # ComfyUI caches node outputs - modifying input corrupts cache
        image = image.clone()

        # Use no_grad for inference operations
        with torch.no_grad():
            # Do processing...
            result = some_operation(image)

        return (result,)
```

### Tensor Truthiness Gotcha

```python
# WRONG - Raises error for multi-element tensors
if tensor:  # RuntimeError!
    pass

# CORRECT - Check for None explicitly
if tensor is not None:
    pass

# CORRECT - Check if any/all elements are truthy
if tensor.any():
    pass
if tensor.all():
    pass
```

### Clone vs Detach vs Copy

| Method | Memory | Gradient | Use Case |
|--------|--------|----------|----------|
| `clone()` | New copy | Preserves | Safe modification |
| `detach()` | Same data | Breaks graph | Read-only reference |
| `clone().detach()` | New copy | No gradient | Safe, no gradients |

```python
# For ComfyUI nodes - typically use clone()
safe_tensor = input_tensor.clone()

# If you also want to ensure no gradients
safe_tensor = input_tensor.clone().detach()
```

### PIL Conversion Pattern

```python
import numpy as np
from PIL import Image

def tensor_to_pil(tensor: torch.Tensor, index: int = 0) -> Image.Image:
    """Convert ComfyUI IMAGE tensor to PIL Image."""
    tensor = ensure_bhwc(tensor)
    img = tensor[index]  # Get single image
    img_np = (img.cpu().numpy() * 255).astype(np.uint8)
    return Image.fromarray(img_np, mode="RGB")

def pil_to_tensor(image: Image.Image) -> torch.Tensor:
    """Convert PIL Image to ComfyUI IMAGE tensor."""
    if image.mode != "RGB":
        image = image.convert("RGB")
    img_np = np.array(image).astype(np.float32) / 255.0
    return torch.from_numpy(img_np).unsqueeze(0)  # Add batch
```

---

## Quick Reference Card

### Shape Manipulation

```python
tensor.unsqueeze(0)     # Add dim at position 0
tensor.squeeze(0)       # Remove dim at position 0 (if size 1)
tensor.permute(0,3,1,2) # Reorder dimensions
tensor.reshape(1,-1)    # Reshape (-1 = auto)
tensor.view(1,-1)       # View (must be contiguous)
tensor.contiguous()     # Make memory contiguous
```

### Device/dtype

```python
tensor.to("cuda")           # To GPU
tensor.to("cpu")            # To CPU
tensor.to(torch.float16)    # Change dtype
tensor.device               # Current device
tensor.dtype                # Current dtype
```

### Memory

```python
with torch.no_grad():       # Disable gradients
with torch.inference_mode(): # Even more efficient
del tensor                  # Delete reference
torch.cuda.empty_cache()    # Clear GPU cache
```

### Validation

```python
tensor.dim()        # Number of dimensions
tensor.shape        # Size tuple
tensor.numel()      # Total elements
tensor.is_cuda      # Is on GPU?
```

---

## Sources

- [ComfyUI Official Docs - Working with Tensors](https://docs.comfy.org/custom-nodes/backend/tensors)
- [PyTorch Broadcasting Semantics](https://docs.pytorch.org/docs/stable/notes/broadcasting.html)
- [PyTorch CUDA Semantics](https://docs.pytorch.org/docs/stable/notes/cuda.html)
- [PyTorch Channels Last Memory Format Tutorial](https://docs.pytorch.org/tutorials/intermediate/memory_format_tutorial.html)
- [PyTorch no_grad Documentation](https://docs.pytorch.org/docs/stable/generated/torch.no_grad.html)
- [PyTorch inference_mode Documentation](https://docs.pytorch.org/docs/stable/generated/torch.autograd.grad_mode.inference_mode.html)
- [PyTorch Performance Tuning Guide](https://docs.pytorch.org/tutorials/recipes/recipes/tuning_guide.html)
- [PyTorch Tensor Attributes (dtypes)](https://docs.pytorch.org/docs/stable/tensor_attributes.html)
- [PyTorch AMP Documentation](https://docs.pytorch.org/docs/stable/amp.html)
- [Einops Tutorial for Deep Learning](https://einops.rocks/2-einops-for-deep-learning/)
- [GeeksforGeeks - clone vs detach vs deepcopy](https://www.geeksforgeeks.org/deep-learning/difference-between-detach-clone-and-deepcopy-in-pytorch-tensors/)
- [ComfyUI-Tensor-Operations GitHub](https://github.com/ttulttul/ComfyUI-Tensor-Operations)
- [Understanding GPU Memory - PyTorch Blog](https://pytorch.org/blog/understanding-gpu-memory-1/)
