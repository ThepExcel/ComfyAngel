# Existing ComfyUI Image Manipulation Nodes Analysis

**Research Date:** 2026-01-15
**Purpose:** ตรวจสอบ nodes ที่มีอยู่แล้วก่อนพัฒนา ComfyAngel

---

## Executive Summary

| Category | มีอยู่แล้ว? | Recommendation |
|----------|-------------|----------------|
| Layer/Compositing | **มีครบ** (LayerStyle, LayerForge) | ไม่ต้องทำใหม่ |
| Blend Modes | **มีครบ** (30+ modes) | ไม่ต้องทำใหม่ |
| Resize/Crop/Transform | **มีเยอะมาก** | ไม่ต้องทำใหม่ |
| Convert Image↔Mask | **มีอยู่** | อาจทำ wrapper ที่ใช้ง่ายกว่า |
| Filters (Brightness/Contrast) | **มีอยู่** | ไม่ต้องทำใหม่ |
| **Parameter Overlay (Visual)** | **ไม่มี!** | **ต้องทำ - Unique!** |
| Visual Widgets | **มีบ้าง** (LayerForge) | **Focus ตรงนี้!** |

---

## 1. Existing Layer/Compositing Nodes

### ComfyUI_LayerStyle ⭐ (Comprehensive)
**GitHub:** https://github.com/chflame163/ComfyUI_LayerStyle

**Features:**
- Photoshop-like layer compositing
- All blend modes
- Layer transformations
- Color adjustments
- Mask operations
- **GPU acceleration** สำหรับ blend modes (เร็วกว่า 10x)

**Verdict:** ครบมาก ไม่ต้องทำซ้ำ

---

### Comfyui-LayerForge
**GitHub:** https://github.com/Azornes/Comfyui-LayerForge

**Features:**
- Visual canvas editor (Photoshop-like UI)
- Multi-layer support
- 12 blend modes
- AI-powered background removal (BiRefNet)
- Auto-save to IndexedDB

**Verdict:** เน้น visual editing ต่างจาก LayerStyle ที่เป็น nodes

---

### Virtuoso Nodes
**Features:**
- 30 blend modes
- Selective Color, Blend If, Color Balance
- Levels, Hue/Saturation, Black and White

---

### Built-in ImageBlend
- Normal, Multiply, Screen, Overlay, Soft Light, Difference
- ใช้ได้เลยไม่ต้อง install

---

## 2. Existing Convert/Transform Nodes

### Built-in Nodes
- `ImageCrop` - crop by x, y, width, height
- `ImageScale` - resize with upscale methods

### ComfyUI Essentials ⭐
**Features:**
- ImageResize+ (5 methods: nearest, bilinear, area, bicubic, lanczos)
- ImageCrop
- ImageFlip
- MaskBlur, MaskFlip
- Get Image Size

### palant/image-resize-comfyui
- Aspect ratio preservation
- Crop to ratio / Pad to ratio modes
- Mask auto-resize

### ComfyUI-FitSize
- Fit content to bounding box
- Auto-adjust to multiples of 8

### WAS Node Suite (ltdrdata fork)
**Status:** Original archived June 2025, แต่ **ltdrdata fork ยัง maintain อยู่**
**GitHub:** https://github.com/ltdrdata/was-node-suite-comfyui

**Features:**
- 210+ nodes
- Image blend, save with metadata
- Text concatenate
- Conditional logic

---

## 3. Parameter Metadata Nodes (NOT Visual Overlay)

### ComfyUI-SaveImageWithMetaData
- Save PNG with PNGInfo metadata
- **ไม่ใช่ visual overlay บนรูป**

### comfy-image-saver (Save Image w/Metadata)
- Embed metadata ใน PNG/JPEG/WebP
- Auto-detect from workflow
- **ไม่ใช่ visual overlay บนรูป**

### WLSH Image Save with Prompt/Info
- Save prompt, model, seed ใน metadata
- **ไม่ใช่ visual overlay บนรูป**

### LayerUtility: Add BlindWaterMark
- Invisible watermark (ไม่มองเห็น)
- **ไม่ใช่ visible text overlay**

---

## 4. GAP ANALYSIS: What's Missing?

### Parameter Overlay (Visual on Image) ⭐⭐⭐
**ไม่มีใครทำ!**

ทุก node ที่มีอยู่ save metadata **ภายใน file** แต่ไม่มี node ที่:
- วาด text strip บนรูป
- แสดง seed/model/lora/cfg/steps แบบมองเห็น
- ทำให้ share รูปแล้วคนอื่นอ่าน params ได้เลย

**นี่คือ unique value ของ ComfyAngel!**

---

### Visual Widgets ที่ดีกว่า
LayerForge มี visual canvas แต่ไม่มี:
- Position picker แบบ drag-drop สำหรับ single node
- Crop selector แบบ interactive
- Color picker ที่ดี
- Blend preview realtime

---

## 5. Technical Best Practices & Gotchas

### Tensor Format
```python
# ComfyUI IMAGE format
shape: [B, H, W, C]  # Batch, Height, Width, Channels
values: 0.0 - 1.0    # Normalized float

# ComfyUI MASK format
shape: [B, H, W]     # No channel dimension
values: 0.0 - 1.0
```

### Common Gotchas

#### 1. Squeezed Tensors
```python
# ❌ Some nodes return squeezed tensors (no batch dim)
image = some_node_output  # shape: [H, W, C] - missing batch!

# ✅ Always ensure batch dimension
if image.dim() == 3:
    image = image.unsqueeze(0)  # shape: [1, H, W, C]
```

#### 2. Clone Before Modify
```python
# ❌ Modifying input affects cached data
def process(self, image):
    image[0, 0, 0, 0] = 1.0  # Corrupts cache!
    return (image,)

# ✅ Clone first
def process(self, image):
    result = image.clone()
    result[0, 0, 0, 0] = 1.0
    return (result,)
```

#### 3. Tensor Truthiness
```python
# ❌ Wrong - tensors don't have bool value
if mask:
    do_something()

# ✅ Correct
if mask is not None:
    do_something()
```

#### 4. None for Optional Inputs
```python
def process(self, image, mask=None):
    # ✅ Always check
    if mask is not None:
        result = image * mask.unsqueeze(-1)
    else:
        result = image
    return (result,)
```

---

## 6. Recommendations for ComfyAngel

### DO NOT Build (Already Exists)
- ❌ Blend modes - LayerStyle has 30+ modes with GPU acceleration
- ❌ Layer composite - LayerStyle, LayerForge ครบแล้ว
- ❌ Basic resize/crop - Essentials, FitSize, built-in มีแล้ว
- ❌ Brightness/Contrast - LayerStyle, Virtuoso มีแล้ว
- ❌ Mask operations - LayerStyle ครบแล้ว

### BUILD (Unique Value)
- ✅ **Parameter Overlay** - ไม่มีใครทำ visual overlay!
- ✅ **Visual Widgets** - Position picker, Crop selector, Color picker ที่ดี
- ✅ **Simpler Wrappers** - ถ้าจะทำ resize/crop ต้องง่ายกว่าที่มี + มี widget

### CONSIDER (Maybe)
- 🤔 "All-in-one" nodes ที่รวม common operations
- 🤔 Workflow-aware nodes ที่ auto-configure จาก context

---

## 7. Sources

1. [ComfyUI_LayerStyle](https://github.com/chflame163/ComfyUI_LayerStyle)
2. [Comfyui-LayerForge](https://github.com/Azornes/Comfyui-LayerForge)
3. [ComfyUI Essentials](https://www.runcomfy.com/comfyui-nodes/ComfyUI_essentials)
4. [WAS Node Suite (ltdrdata fork)](https://github.com/ltdrdata/was-node-suite-comfyui)
5. [ComfyUI-SaveImageWithMetaData](https://github.com/nkchocoai/ComfyUI-SaveImageWithMetaData)
6. [comfy-image-saver](https://www.runcomfy.com/comfyui-nodes/comfy-image-saver)
7. [Official Tensor Docs](https://docs.comfy.org/custom-nodes/backend/tensors)
8. [palant/image-resize-comfyui](https://github.com/palant/image-resize-comfyui)
9. [Apatero Essential Nodes Guide](https://apatero.com/blog/ultimate-comfyui-custom-nodes-guide-20-essential-nodes-2025)
10. [RunComfy Nodes Directory](https://www.runcomfy.com/comfyui-nodes)
