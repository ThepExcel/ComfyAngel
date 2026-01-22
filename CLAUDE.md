# CLAUDE.md — ComfyAngel

> **Docs:** ดู `docs/PRD.md` สำหรับ full specifications

---

## Project Overview

**ComfyAngel** — Custom nodes สำหรับ ComfyUI ที่เน้น:
1. **Parameter Overlay** — วาด workflow params บนรูป (ไม่มีใครทำ!)
2. **Visual Widgets** — UI ที่ใช้ง่ายกว่า nodes ปกติ

**Tech Stack:** Python + PyTorch + Pillow + ComfyUI API (V1 + V3)

### What We DO NOT Build (มีคนทำแล้ว)
- ❌ Layer/Blend modes → ใช้ [ComfyUI_LayerStyle](https://github.com/chflame163/ComfyUI_LayerStyle)
- ❌ Filters (Brightness/Contrast) → ใช้ LayerStyle หรือ Virtuoso
- ❌ Mask operations → ใช้ LayerStyle
- ❌ Basic resize/crop → ใช้ ComfyUI Essentials

### What We BUILD (Unique Value)
| Node | Why Unique |
|------|------------|
| `Parameter Overlay` | วาด metadata บนรูป (ไม่ใช่แค่ embed ใน file) |
| `Custom Text Overlay` | วาด text บนรูป |
| `Smart Crop` | มี visual crop selector widget |
| `Smart Position` | มี visual position picker widget |
| `Solid Color` | มี visual color picker widget |

---

## Architecture

### Project Structure

```
ComfyAngel/
├── __init__.py              # Node registration (V1 + V3 dual support)
├── pyproject.toml           # Registry metadata
├── requirements.txt
├── nodes/
│   ├── __init__.py
│   ├── overlay_nodes.py     # Parameter Overlay (main feature!)
│   ├── widget_nodes.py      # Visual widget nodes
│   └── util_nodes.py        # Utilities
├── utils/
│   ├── __init__.py
│   ├── tensor_ops.py        # BHWC handling, squeeze fix
│   ├── metadata_parser.py   # Parse PNG metadata (A1111, ComfyUI format)
│   └── text_renderer.py     # System font text rendering
├── js/                      # Frontend widgets
│   ├── crop_widget.js
│   ├── position_widget.js
│   └── color_widget.js
├── docs/
│   └── PRD.md
└── research/                # Research findings
```

### Node Anatomy

```python
class MyCustomNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0}),
            },
            "optional": {
                "mask": ("MASK",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "process"
    CATEGORY = "ComfyAngel"

    def process(self, image, strength, mask=None):
        # Implementation
        return (result_image,)
```

### Key Gotchas

| Issue | Solution |
|-------|----------|
| Tensor shape mismatch | ComfyUI uses BHWC format (Batch, Height, Width, Channel) |
| Squeezed tensor | ตรวจสอบ `if image.dim() == 3: image = image.unsqueeze(0)` |
| Modifying cached data | ใช้ `image.clone()` ก่อน modify เสมอ |
| Tensor truthiness | ใช้ `if mask is not None:` ไม่ใช่ `if mask:` |
| Memory leaks | ใช้ `torch.no_grad()` และ clear unused tensors |
| Node not showing | ตรวจสอบ `NODE_CLASS_MAPPINGS` ใน `__init__.py` |
| JS widget not loading | ตรวจสอบ `WEB_DIRECTORY` และ path |

### ComfyUI Data Types

| Type | Description |
|------|-------------|
| `IMAGE` | Tensor shape (B, H, W, C), values 0.0-1.0 |
| `MASK` | Tensor shape (B, H, W), values 0.0-1.0 |
| `LATENT` | Dict with "samples" key |
| `CONDITIONING` | List of [cond, pooled_dict] |
| `MODEL` | UNet model |
| `CLIP` | CLIP model |
| `VAE` | VAE model |

---

## Parameter Overlay Implementation

### Approach: อ่าน Metadata จากรูปที่ Save แล้ว

```
[Save Image w/Metadata] → [Load Image] → [Parameter Overlay] → [Preview/Save]
```

**ไม่ใช้** hidden PROMPT input → ใช้ PNG metadata แทน (ง่ายกว่า + ใช้กับรูปเก่าได้)

### Metadata Formats ที่ต้อง Support

```python
# A1111 format: "parameters" key
metadata["parameters"] = "prompt text\nNegative: ...\nSteps: 30, CFG: 7, Seed: 12345..."

# ComfyUI format: "prompt" key (JSON)
metadata["prompt"] = '{"3": {"class_type": "KSampler", "inputs": {...}}}'
```

---

## Implementation Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Project Setup (V1+V3, pyproject.toml) | ✅ |
| 2 | **Parameter Overlay** (metadata parser, text render) | ✅ |
| 3 | Visual Widgets - Crop & Color | ✅ |
| 4 | Visual Widgets - Position | ✅ |
| 5 | Polish & Registry Publish | ⬜ |

**Total: ~8 nodes** (focused, high quality)

---

## Development Workflow

### Testing Nodes

```bash
# Restart ComfyUI to reload nodes
# Or use ComfyUI-Manager's "Reload Custom Nodes"

# Check console for errors
python main.py --listen
```

### Publishing to Registry

**สำคัญ:** ComfyUI Registry ใช้ **git tags** เพื่อระบุ version ที่ download ได้

```bash
# 1. แก้ version ใน pyproject.toml
version = "0.7.0"

# 2. Commit การเปลี่ยนแปลง
git add pyproject.toml
git commit -m "chore: bump version to 0.7.0"

# 3. สร้าง git tag (ต้องตรงกับ version ใน pyproject.toml)
git tag 0.7.0

# 4. Push ทั้ง commit และ tag
git push origin main --tags
```

**Gotchas:**
| Issue | Solution |
|-------|----------|
| Manager install version เก่า | ตรวจสอบว่ามี git tag สำหรับ version นั้นหรือยัง |
| "Version already exists" error | Version นี้ publish ไปแล้ว ต้อง bump version ใหม่ |
| Exit code 2 | `REGISTRY_ACCESS_TOKEN` secret ไม่ถูกต้อง |

### Common Patterns

**Image Batch Processing:**
```python
def process(self, images):
    results = []
    for i in range(images.shape[0]):
        img = images[i]  # Single image (H, W, C)
        # Process...
        results.append(processed)
    return (torch.stack(results),)
```

**Optional Inputs:**
```python
def process(self, required_input, optional_input=None):
    if optional_input is not None:
        # Use optional
    else:
        # Default behavior
```

---

## Skills & Agents

### Primary Skill: `/comfyui-node-designer`

**ใช้ skill นี้สำหรับงาน ComfyUI node ทุกอย่าง** — ทั้งออกแบบและ implement

**Domain Skills (auto-loaded):**
| Task | Skill |
|------|-------|
| Node API, data types, patterns | `comfyui-node-spec` |
| Tensor shapes, memory | `pytorch-tensors` |
| PIL, resize, blend | `image-processing` |
| Font, text layout | `text-rendering` |
| Latent, video, execution | `advanced-comfyui` |

---

## Lessons Learned (Project Level)

*(เพิ่มบทเรียนเฉพาะ project นี้ที่นี่)*
