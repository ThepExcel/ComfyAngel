# PRD: ComfyAngel Custom Nodes

**Version:** 0.2.0 (Revised after Research)
**Last Updated:** 2026-01-15
**Status:** Draft - Revised scope based on competitive analysis

---

## 1. Overview

### 1.1 Product Vision

**ComfyAngel** เป็น custom node pack สำหรับ ComfyUI ที่เน้น:
1. **Parameter Overlay** - แสดง workflow params บนรูปแบบ visual (ไม่มีใครทำ!)
2. **Visual Widgets** - UI ที่ใช้ง่ายกว่า nodes ที่มีอยู่
3. **Simple Wrappers** - รวม common operations ให้ใช้ง่ายขึ้น

### 1.2 Competitive Analysis Summary

| Category | Existing Solutions | ComfyAngel Approach |
|----------|-------------------|---------------------|
| Layer/Blend | LayerStyle (ครบ 30+ modes, GPU accel) | ❌ ไม่ทำซ้ำ |
| Resize/Crop | Essentials, FitSize, built-in | ⚠️ ทำเฉพาะถ้ามี widget ที่ดีกว่า |
| Filters | LayerStyle, Virtuoso | ❌ ไม่ทำซ้ำ |
| **Parameter Overlay** | **ไม่มี!** (มีแค่ save metadata) | ✅ **Unique value!** |
| **Visual Widgets** | LayerForge (canvas only) | ✅ **Per-node widgets** |

> **Key Insight:** ไม่ควรแข่งกับ LayerStyle ที่มี 100+ nodes แล้ว
> ควร focus ที่สิ่งที่ไม่มีใครทำ = **Parameter Overlay + Visual UX**

### 1.3 Target Users

| User Type | Needs |
|-----------|-------|
| **Beginners** | Nodes ที่ใช้ง่าย มี defaults ที่ดี ไม่ต้อง config เยอะ |
| **Power Users** | มี advanced options ซ่อนไว้ ปรับแต่งได้ละเอียด |

### 1.4 Distribution

- **Public release** บน ComfyUI Registry
- ทำตาม Registry standards
- รองรับ ComfyUI Manager

---

## 2. Node Categories (Revised Scope)

### ~~2.1 Layer & Compositing~~ → REMOVED
> **Reason:** ComfyUI_LayerStyle มีครบแล้ว 30+ blend modes พร้อม GPU acceleration
> **Recommendation:** ใช้ LayerStyle แทน

### ~~2.2 Filters & Adjustments~~ → REMOVED
> **Reason:** LayerStyle + Virtuoso Nodes มีครบแล้ว
> **Recommendation:** ใช้ nodes ที่มีอยู่แทน

### ~~2.3 Mask Operations~~ → REMOVED
> **Reason:** LayerStyle มี mask operations ครบแล้ว
> **Recommendation:** ใช้ nodes ที่มีอยู่แทน

---

## 2.1 Parameter Overlay ⭐ (Priority: HIGHEST - Unique!)

**ไม่มีใครทำ!** Nodes ที่มีอยู่แค่ save metadata ภายใน file แต่ไม่มี visual overlay

| Node | Description | Inputs | Outputs |
|------|-------------|--------|---------|
| `Parameter Overlay` | เพิ่มแถบ parameter ใต้รูป | image (with metadata) | IMAGE |
| `Custom Text Overlay` | เพิ่ม custom text บนรูป | image, text, position, style | IMAGE |

### Implementation Approach (Simplified!)

**ใช้ metadata ที่มีอยู่แล้ว** แทนการอ่าน workflow ขณะรัน:

```
[Save Image w/Metadata] → [Load Image] → [Parameter Overlay] → [Preview/Save]
     ↑                         ↑                ↑
  save PNG             อ่าน metadata      วาด text บนรูป
  with params          จากรูป
```

**ข้อดี:**
1. ง่ายกว่า - ไม่ต้องยุ่งกับ hidden PROMPT input
2. ใช้ได้กับรูปเก่า - รูปที่ save ไว้แล้วก็เอามา overlay ได้
3. Compatible กับ existing nodes (comfy-image-saver, SaveImageWithMetaData)

### Parameters ที่จะ Extract จาก Metadata

- Seed
- Model name (checkpoint)
- LoRA (name + weight)
- CFG Scale
- Steps
- Sampler / Scheduler
- Denoise
- Resolution
- Positive/Negative prompt (optional, truncated)

**Example Output:**
```
┌─────────────────────────────────────────────┐
│                                             │
│              [Generated Image]              │
│                                             │
├─────────────────────────────────────────────┤
│ SDXL Base | detail_tweaker:0.8              │
│ Seed:12345 | CFG:7 | Steps:30 | euler/normal│
└─────────────────────────────────────────────┘
```

**Why This Is Unique:**
- `ComfyUI-SaveImageWithMetaData` → embed ใน PNG metadata (ไม่เห็น)
- `comfy-image-saver` → embed ใน file (ไม่เห็น)
- **ComfyAngel** → **วาดบนรูปเลย** share ได้เห็นทันที!

---

## 2.2 Visual Widget Nodes (Priority: HIGH)

Nodes ที่มี **interactive JS widgets** ทำให้ใช้ง่ายกว่า nodes ปกติ

| Node | Widget Type | Why Better |
|------|-------------|------------|
| `Smart Crop` | Crop Area Selector | ลากเลือกพื้นที่แทนใส่ตัวเลข |
| `Smart Position` | Position Picker | คลิกเลือกตำแหน่งแทนใส่ x,y |
| `Color Generator` | Color Picker | เลือกสี visual แทน hex code |

**เหตุผลที่ทำ:**
- Built-in `ImageCrop` ต้องใส่ x, y, w, h ด้วยตัวเลข → ยาก
- `Smart Crop` ลาก rectangle บนรูปเลย → ง่าย!

---

## 2.3 Utility Nodes

Helper nodes ที่ยังไม่มีใครทำดี

| Node | Description | Inputs | Outputs |
|------|-------------|--------|---------|
| `Image Info` | แสดงข้อมูลรูป | image | width, height, channels, batch |
| `Solid Color` | สร้างสี solid (with color picker widget) | color, width, height | IMAGE |
| `Resolution Picker` | Common resolutions dropdown | preset | width, height |

---

## 3. Technical Specifications

### 3.1 API Version

- **Primary:** V3 API (Modern)
- **Fallback:** V1 API (Legacy) สำหรับ older ComfyUI versions

### 3.2 Dependencies

```
torch
numpy
Pillow>=9.0.0
```

**No heavy dependencies** - ไม่ใช้ OpenCV หรือ library ที่ติดตั้งยาก

### 3.3 Project Structure (Simplified)

```
ComfyAngel/
├── __init__.py              # Node registration (V1 + V3 dual support)
├── pyproject.toml           # Registry metadata
├── requirements.txt
├── nodes/
│   ├── __init__.py
│   ├── overlay_nodes.py     # Parameter Overlay (main feature!)
│   ├── widget_nodes.py      # Visual widget nodes (crop, position, color)
│   └── util_nodes.py        # Utilities
├── utils/
│   ├── __init__.py
│   ├── tensor_ops.py        # Tensor utilities (BHWC handling)
│   ├── workflow_parser.py   # Parse workflow PROMPT for params
│   └── text_renderer.py     # System font text rendering
├── js/                      # Frontend widgets
│   ├── crop_widget.js       # Crop Area Selector
│   ├── position_widget.js   # Position Picker
│   └── color_widget.js      # Color Picker
├── docs/
│   └── PRD.md
└── tests/
```

### 3.4 Naming Convention

| Element | Convention | Example |
|---------|------------|---------|
| Node class | PascalCase | `LayerComposite` |
| Node ID | PascalCase with prefix | `ComfyAngel_LayerComposite` |
| Display name | Title Case with spaces | `Layer Composite` |
| Category | `ComfyAngel/subcategory` | `ComfyAngel/Layer` |

---

## 4. Implementation Phases (Simplified - 5 Phases)

### Phase 1: Project Setup
- [ ] Project structure + V3 API setup
- [ ] pyproject.toml สำหรับ Registry
- [ ] Basic tensor utilities (BHWC handling, squeeze fix)
- [ ] V1/V3 dual support pattern

### Phase 2: Parameter Overlay ⭐ (Core Feature)
- [ ] PNG metadata parser (read from image file)
- [ ] Support formats: A1111, ComfyUI, Civitai
- [ ] Extract: seed, model, lora, cfg, steps, sampler
- [ ] System font text rendering (Pillow)
- [ ] `Parameter Overlay` node
- [ ] `Custom Text Overlay` node

### Phase 3: Visual Widgets - Crop & Color
- [ ] **JS: Crop Area Selector widget**
- [ ] `Smart Crop` node
- [ ] **JS: Color Picker widget**
- [ ] `Solid Color` node

### Phase 4: Visual Widgets - Position
- [ ] **JS: Position Picker widget**
- [ ] `Smart Position` node
- [ ] Utility nodes (Image Info, Resolution Picker)

### Phase 5: Polish & Release
- [ ] Documentation per node
- [ ] Tests
- [ ] Registry publish
- [ ] ComfyUI Manager submission

**Total Nodes: ~8 nodes** (focused, high quality)

---

## 5. Design Decisions

| Question | Decision |
|----------|----------|
| Font for Parameter Overlay | System font (no bundling) |
| Batch support | เฉพาะ nodes ที่จำเป็น |
| JS widgets | ต้องการ visual widgets ครบ |

---

## 6. Visual Widgets (JS) - Specifications

### 6.1 Crop Area Selector
**ใช้กับ:** Smart Crop

```
┌─────────────────────────────────┐
│  ┌───────────────────────────┐  │
│  │   ┌─────────────┐         │  │
│  │   │ ░░░░░░░░░░░ │ ← drag  │  │
│  │   │ ░░░CROP░░░░ │         │  │
│  │   └─────────────┘         │  │
│  └───────────────────────────┘  │
│  X: [50] Y: [30] W: [256] H: [256] │
└─────────────────────────────────┘
```

**Features:**
- ลาก rectangle เลือกพื้นที่
- Resize handles ที่มุม
- Lock aspect ratio (optional)
- Preset sizes (256, 512, 1024)

### 6.2 Position Picker
**ใช้กับ:** Smart Position

```
┌─────────────────────────────────┐
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │         Canvas            │  │
│  │            ⊕ ← click      │  │
│  │                           │  │
│  └───────────────────────────┘  │
│  X: [  150  ]  Y: [  200  ]     │
│  Anchor: [Top-Left ▼]           │
└─────────────────────────────────┘
```

**Features:**
- คลิกบน canvas เพื่อเลือกตำแหน่ง
- Anchor point selection (9 จุด)
- Snap to grid (optional)

### 6.3 Color Picker
**ใช้กับ:** Solid Color

```
┌─────────────────────────────────┐
│  ┌──────────┐  ┌─────────────┐  │
│  │ Gradient │  │ Hue Strip   │  │
│  │  Picker  │  │             │  │
│  │    ⊕     │  │      ▲      │  │
│  └──────────┘  └─────────────┘  │
│  HEX: [#FF5733]  RGB: 255,87,51 │
│  [■] Preview                    │
└─────────────────────────────────┘
```

**Features:**
- HSV gradient picker
- Hue slider
- HEX input
- RGB values display

---

## 7. Technical Gotchas (From Research)

### 7.1 Tensor Handling
```python
# ComfyUI IMAGE format: [B, H, W, C] values 0.0-1.0
# ComfyUI MASK format: [B, H, W] values 0.0-1.0

# ❌ Common bug: squeezed tensor (missing batch dim)
if image.dim() == 3:
    image = image.unsqueeze(0)  # Fix: add batch dim

# ❌ Common bug: modifying cached tensor
result = image.clone()  # Always clone first!

# ❌ Common bug: wrong truthiness check
if mask is not None:  # Correct (not "if mask:")
```

### 7.2 PNG Metadata Reading
```python
from PIL import Image
from PIL.PngImagePlugin import PngInfo

def read_metadata(image_path):
    img = Image.open(image_path)
    metadata = img.info  # Dict of PNG text chunks

    # Common formats:
    # A1111: "parameters" key with formatted text
    # ComfyUI: "prompt" and "workflow" keys with JSON
    # Civitai: Similar to A1111 format

    if "parameters" in metadata:
        return parse_a1111_format(metadata["parameters"])
    elif "prompt" in metadata:
        return parse_comfyui_format(metadata["prompt"])
    return {}
```

**Note:** ต้อง handle รูปที่ไม่มี metadata ด้วย (show placeholder หรือ skip)

---

## 8. Success Metrics

- [ ] ติดตั้งได้ผ่าน ComfyUI Manager
- [ ] ไม่มี dependency conflicts
- [ ] ทำงานได้ทั้ง Nodes 2.0 UI และ Classic UI
- [ ] Documentation ครบทุก node
- [ ] **Parameter Overlay works with common workflows** (txt2img, img2img)

---

## 9. Research References

ดู full research ที่:
- `research/comfyui-custom-node-best-practices-2026-01-15.md`
- `research/existing-nodes-analysis-2026-01-15.md`

**Key Sources:**
- [ComfyUI_LayerStyle](https://github.com/chflame163/ComfyUI_LayerStyle) - ทำไมไม่ต้องทำ layer nodes
- [ComfyUI-SaveImageWithMetaData](https://github.com/nkchocoai/ComfyUI-SaveImageWithMetaData) - ทำไม overlay ต่างจาก metadata
- [Official Tensor Docs](https://docs.comfy.org/custom-nodes/backend/tensors) - BHWC format

---

*Draft by: น้องฟ้า*
*Review by: พี่ระ (pending)*
*Research completed: 2026-01-15*
