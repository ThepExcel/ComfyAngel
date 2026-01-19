# ComfyUI Custom Node Development Research Report

**Date:** 2025-01-19
**Research Tier:** Deep (20+ sources)
**Purpose:** สร้าง skill `comfyui-node-builder` ที่ครบเครื่อง

---

## Executive Summary

ComfyUI เป็น node-based AI image generation tool ที่มี ecosystem ขนาดใหญ่และกำลังเติบโตอย่างรวดเร็ว การพัฒนา custom node ที่ดีต้องเข้าใจ:

1. **Official API** (V1 + V3) และ tensor formats
2. **Frontend widgets** (JavaScript/LiteGraph)
3. **Popular custom nodes** เป็น reference
4. **User pain points** เพื่อสร้าง value ที่แท้จริง

---

## 1. ComfyUI Data Types & Tensor Handling

### 1.1 IMAGE Type
```python
# Shape: [B, H, W, C] - Batch, Height, Width, Channel
# Channel-LAST format (ต่างจาก PyTorch default)
# Values: 0.0 - 1.0 (float32)
# C = 3 (RGB)

# Example: Single image → batch
if image.dim() == 3:  # [H, W, C]
    image = image.unsqueeze(0)  # → [1, H, W, C]
```

**Confidence:** HIGH
**Sources:** [Official Docs](https://docs.comfy.org/custom-nodes/backend/images_and_masks), [DeepWiki](https://deepwiki.com/ltdrdata/ComfyUI-Impact-Pack/12-image-processing-utilities)

### 1.2 MASK Type
```python
# Shape: [B, H, W] - ไม่มี channel dimension!
# Values: 0.0 - 1.0 (float32)
# Binary (0/1) หรือ gradient values

# ⚠️ GOTCHA: อาจถูก squeeze เหลือ [H, W]
if len(mask.shape) == 2:
    mask = mask.unsqueeze(0)  # → [1, H, W]

# ต้องการ match กับ IMAGE? unsqueeze channel
mask_4d = mask.unsqueeze(-1)  # → [B, H, W, 1]
```

**Confidence:** HIGH
**Sources:** [Official Docs](https://docs.comfy.org/custom-nodes/backend/images_and_masks)

### 1.3 LATENT Type
```python
# Structure: Dict with "samples" key
# Shape: [B, C, H, W] - Channel-FIRST! (ต่างจาก IMAGE)
# C = 4 (latent channels)

latent_samples = latent["samples"]  # Access tensor
```

**Confidence:** HIGH
**Source:** [Official Docs](https://docs.comfy.org/custom-nodes/backend/images_and_masks)

### 1.4 Other Important Types

| Type | Description |
|------|-------------|
| `CONDITIONING` | List of `[cond, pooled_dict]` |
| `MODEL` | UNet model reference |
| `CLIP` | CLIP model reference |
| `VAE` | VAE model reference |
| `STRING` | Text input |
| `INT` | Integer input |
| `FLOAT` | Float input |

---

## 2. Node Development API

### 2.1 V1 API (Current Standard)

```python
class MyCustomNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "strength": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 2.0,
                    "step": 0.01,
                    "display": "slider"
                }),
                "mode": (["option1", "option2", "option3"],),
            },
            "optional": {
                "mask": ("MASK",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("output_image", "output_mask")
    FUNCTION = "process"
    CATEGORY = "MyNodes/Image"
    DESCRIPTION = "Description shown in help"

    # Optional flags
    OUTPUT_NODE = False  # True = terminal node (like SaveImage)
    OUTPUT_IS_LIST = (False, False)  # Per-output list handling

    def process(self, image, strength, mode, mask=None, unique_id=None, prompt=None):
        # Always clone input tensors before modifying!
        result = image.clone()

        # Process...

        # Return as tuple
        return (result, output_mask)
```

**Source:** [Official Walkthrough](https://docs.comfy.org/custom-nodes/walkthrough), [GitHub Discussion #1291](https://github.com/comfyanonymous/ComfyUI/discussions/1291)

### 2.2 V3 API (Proposed - In Development)

```python
from comfy_api.v0_0_3 import ComfyAPI, Schema, ImageInput, ImageOutput

class MyV3Node:
    @classmethod
    def DEFINE_SCHEMA(cls):
        return Schema(
            inputs=[ImageInput("image")],
            outputs=[ImageOutput("result")]
        )

    async def process(self, api: ComfyAPI, image):
        await api.set_progress(0.5)  # Progress reporting
        # Process...
        return {"result": processed_image}
```

**Confidence:** MEDIUM (ยังอยู่ระหว่างพัฒนา)
**Source:** [ComfyUI.org V3 Article](https://comfyui.org/en/comfyui-v3-dependency-resolution)

### 2.3 Registration (`__init__.py`)

```python
from .nodes.my_nodes import MyCustomNode, AnotherNode

NODE_CLASS_MAPPINGS = {
    "MyCustomNode": MyCustomNode,
    "AnotherNode": AnotherNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MyCustomNode": "My Custom Node (Friendly Name)",
    "AnotherNode": "Another Node",
}

# Optional: Web directory for JavaScript
WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
```

---

## 3. Frontend Widget Development (JavaScript)

### 3.1 Architecture Changes (2025)

LiteGraph.js ถูก merge เข้า ComfyUI Frontend monorepo แล้ว (ตั้งแต่ August 2025)

- **Old import:** `@comfyorg/litegraph`
- **New import:** `@/lib/litegraph` (ภายใน ComfyUI)

**Source:** [GitHub Comfy-Org/litegraph.js](https://github.com/Comfy-Org/litegraph.js)

### 3.2 Extension Registration

```javascript
// js/my_widget.js
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "MyExtension",

    async setup() {
        // Called once when ComfyUI starts
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Called before each node type is registered
        if (nodeData.name === "MyCustomNode") {
            // Customize node behavior
        }
    },

    async nodeCreated(node) {
        // Called when a node instance is created
    },

    async loadedGraphNode(node, app) {
        // Called when loading a workflow
    }
});
```

**Source:** [Official Docs](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking)

### 3.3 Custom Widget Types

```javascript
// Add custom widget to a node
const widget = node.addWidget(
    "customType",      // type
    "widget_name",     // name
    defaultValue,      // default value
    callback,          // onChange callback
    { /* options */ }
);

// Common widget types:
// - "number" / "slider"
// - "combo" (dropdown)
// - "text" / "string"
// - "toggle" (boolean)
// - "button"
// - Custom types via addCustomWidget
```

### 3.4 Server Communication

```javascript
// Send message from frontend to backend
const response = await fetch("/my_custom_endpoint", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" }
});

// Listen for server messages
api.addEventListener("my_event_type", (event) => {
    console.log(event.detail);
});
```

**Python Backend:**
```python
from server import PromptServer

# Send message to frontend
PromptServer.instance.send_sync("my_event_type", {"data": value})

# Custom endpoint
@PromptServer.instance.routes.post("/my_custom_endpoint")
async def my_handler(request):
    data = await request.json()
    return web.json_response({"status": "ok"})
```

---

## 4. Popular Custom Nodes (Reference Quality)

### 4.1 Tier 1: Essential Reference

| Node Pack | Author | Stars | Why Study |
|-----------|--------|-------|-----------|
| [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager) | ltdrdata → Comfy-Org | 8k+ | Installation/management patterns |
| [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) | rgthree | 2k+ | **Best architecture**, inheritance patterns |
| [ComfyUI_essentials](https://github.com/cubiq/ComfyUI_essentials) | cubiq | 2k+ | Clean code, missing core features |
| [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) | ltdrdata | 3k+ | Complex systems, SEGS architecture |
| [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) | pythongosssss | 2k+ | UI enhancements, JS patterns |

### 4.2 rgthree-comfy Architecture (Recommended Pattern)

```
Three-tier inheritance hierarchy:
1. RgthreeBaseNode (extends LGraphNode)
   - Node state management
   - Widget handling
   - Mode change propagation

2. RgthreeBaseServerNode (extends RgthreeBaseNode)
   - Server communication
   - Backend integration

3. Specific Node Classes
   - Inherit from appropriate base
   - Override only what's needed
```

**Source:** [DeepWiki rgthree Architecture](https://deepwiki.com/rgthree/rgthree-comfy/2.4-base-node-architecture)

### 4.3 Impact Pack SEGS System

```python
# SEGS = Segmentation Element Group System
# Core data structure for detected regions

class SEGS:
    def __init__(self, shape, segs):
        self.shape = shape  # Original image shape
        self.segs = segs    # List of SEG objects

class SEG:
    def __init__(self, cropped_image, cropped_mask,
                 confidence, crop_region, bbox, label, control_net_wrapper):
        # Each segment with metadata
```

**Source:** [DeepWiki Impact Pack](https://deepwiki.com/ltdrdata/ComfyUI-Impact-Pack)

---

## 5. User Pain Points (Opportunities)

### 5.1 Top Frustrations (2025)

| Pain Point | Frequency | Opportunity |
|------------|-----------|-------------|
| **Red Nodes / Missing Dependencies** | 85% of issues | Better error messages, auto-fix suggestions |
| **Steep Learning Curve** | High | Visual widgets, intuitive UI |
| **Custom Nodes Breaking After Updates** | Common | Version pinning, compatibility layers |
| **Complex Workflows** | High | Simplification nodes, presets |
| **VRAM/Memory Issues** | Medium | Memory-efficient implementations |
| **File Path Issues** | Medium | Relative paths, portable workflows |

**Sources:** [Toksta Review](https://www.toksta.com/products/comfy-ui), [Apatero Guide](https://apatero.com/blog/fixing-comfyui-red-box-hell-troubleshooting-guide-2025)

### 5.2 What Users Want

1. **Visual Feedback** - Real-time previews, progress indicators
2. **Less Node Spaghetti** - Combined/pipe nodes, context systems
3. **Better Defaults** - Smart presets, auto-configuration
4. **Portable Workflows** - Work across machines without path issues
5. **Documentation** - In-node help, tooltips, examples

---

## 6. Memory & Performance Best Practices

### 6.1 Essential Patterns

```python
import torch

class MemoryEfficientNode:
    def process(self, image):
        # 1. Always clone before modifying
        result = image.clone()

        # 2. Use no_grad for inference
        with torch.no_grad():
            # Process...
            pass

        # 3. Clear intermediate tensors
        del intermediate_tensor

        # 4. Move to CPU if not needed on GPU
        # result = result.cpu()

        return (result,)
```

### 6.2 VRAM Optimization Tips

1. **Process in chunks** for large batches
2. **Unload models** when not in use
3. **Use fp16** where precision allows
4. **Avoid storing** unnecessary intermediate results
5. **Test on low-VRAM systems** (8GB, 4GB)

**Source:** [Apatero VRAM Guide](https://apatero.com/blog/vram-optimization-flags-comfyui-explained-guide-2025)

---

## 7. Metadata & Workflow Embedding

### 7.1 PNG Metadata Formats

**A1111 Format:**
```
parameters: prompt text
Negative prompt: negative text
Steps: 30, Sampler: euler, CFG scale: 7, Seed: 12345, Model: model_name
```

**ComfyUI Format:**
```json
{
  "prompt": { /* full workflow graph */ },
  "workflow": { /* UI workflow */ }
}
```

### 7.2 Parsing Challenges

- ComfyUI ไม่ store prompt เป็น flat text → ต้อง traverse node graph
- Complex workflows อาจ fail ในการ resolve metadata
- Custom nodes มี input/output names ต่างกัน

**Source:** [ComfyUI-PNG-Metadata](https://github.com/romeobuilderotti/ComfyUI-PNG-Metadata), [ComfyUI-Image-Saver](https://github.com/alexopus/ComfyUI-Image-Saver)

---

## 8. Registry & Publishing

### 8.1 pyproject.toml Structure

```toml
[project]
name = "my-custom-node"
version = "1.0.0"
description = "Description of the node pack"
license = "MIT"
dependencies = [
    "torch",
    "Pillow",
]

[project.urls]
Repository = "https://github.com/user/repo"

[tool.comfy]
PublisherId = "your-publisher-id"
DisplayName = "My Custom Node"
Icon = "icon.png"

[tool.comfy.nodes]
# Node-specific metadata
```

### 8.2 Publishing Methods

1. **Manual:** `pip install comfy-cli && comfy node publish`
2. **GitHub Actions:** Auto-publish on version change
3. **Scaffold:** `comfy node scaffold` for new projects

**Source:** [Official Registry Docs](https://docs.comfy.org/registry/specifications)

---

## 9. Key Gotchas & Anti-Patterns

### 9.1 Common Mistakes

| Mistake | Solution |
|---------|----------|
| Modifying input tensors | Always `.clone()` first |
| `if tensor:` truthiness | Use `if tensor is not None:` |
| Wrong tensor shape | Check and convert BHWC ↔ BCHW |
| Squeezed dimensions | Always check `.dim()` or `len(shape)` |
| Memory leaks | Use `torch.no_grad()`, delete unused tensors |
| Hardcoded paths | Use relative paths, environment variables |
| Hijacking prototypes (JS) | Use official extension hooks |

### 9.2 Anti-Patterns to Avoid

1. **Over-engineering** - Start simple, add complexity only when needed
2. **Duplicate features** - Check existing nodes first
3. **Breaking changes** - Maintain backward compatibility
4. **Silent failures** - Provide clear error messages
5. **Assuming GPU** - Handle CPU-only environments

---

## 10. Recommended Learning Path

### For Skill Development

1. **Start with Official Docs**
   - https://docs.comfy.org/custom-nodes/walkthrough

2. **Study Quality Code**
   - rgthree-comfy (architecture)
   - ComfyUI_essentials (clean code)
   - pythongosssss (JS patterns)

3. **Understand the Ecosystem**
   - Install ComfyUI-Manager
   - Explore popular workflows
   - Read GitHub discussions

4. **Practice Incrementally**
   - Simple image processing node
   - Node with widgets
   - Node with JS extension
   - Complex multi-node system

---

## 11. Repositories to Clone for Reference

```bash
# Essential references
git clone https://github.com/rgthree/rgthree-comfy.git refs/rgthree-comfy
git clone https://github.com/cubiq/ComfyUI_essentials.git refs/comfyui-essentials
git clone https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git refs/custom-scripts
git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack.git refs/impact-pack

# UI/Widget references
git clone https://github.com/lovelybbq/comfyui-custom-node-color.git refs/node-color
git clone https://github.com/FunnyFinger/Dynamic-Sliders-ComfyUI.git refs/dynamic-sliders

# Metadata handling
git clone https://github.com/romeobuilderotti/ComfyUI-PNG-Metadata.git refs/png-metadata
git clone https://github.com/alexopus/ComfyUI-Image-Saver.git refs/image-saver
```

---

## Sources

### Official Documentation
- [ComfyUI Official Docs](https://docs.comfy.org)
- [Custom Nodes Walkthrough](https://docs.comfy.org/custom-nodes/walkthrough)
- [Images, Latents, and Masks](https://docs.comfy.org/custom-nodes/backend/images_and_masks)
- [JavaScript Objects](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking)
- [Registry Specifications](https://docs.comfy.org/registry/specifications)

### GitHub Repositories
- [ComfyUI Main](https://github.com/comfyanonymous/ComfyUI)
- [ComfyUI Frontend](https://github.com/Comfy-Org/ComfyUI_frontend)
- [rgthree-comfy](https://github.com/rgthree/rgthree-comfy)
- [ComfyUI_essentials](https://github.com/cubiq/ComfyUI_essentials)
- [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack)
- [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)

### Community Resources
- [ComfyUI Wiki](https://comfyui-wiki.com)
- [ComfyUI Manual](https://comfyuidoc.com)
- [Awesome ComfyUI](https://github.com/ComfyUI-Workflow/awesome-comfyui)
- [Modal Blog - Custom Nodes](https://modal.com/blog/comfyui-custom-nodes)
- [BentoML Guide](https://www.bentoml.com/blog/a-guide-to-comfyui-custom-nodes)

### Analysis & Guides
- [DeepWiki - rgthree Architecture](https://deepwiki.com/rgthree/rgthree-comfy)
- [DeepWiki - Impact Pack](https://deepwiki.com/ltdrdata/ComfyUI-Impact-Pack)
- [Apatero - Essential Nodes 2025](https://apatero.com/blog/ultimate-comfyui-custom-nodes-guide-20-essential-nodes-2025)
- [Apatero - VRAM Optimization](https://apatero.com/blog/vram-optimization-flags-comfyui-explained-guide-2025)

---

*Research completed: 2025-01-19*
*Total sources consulted: 25+*
