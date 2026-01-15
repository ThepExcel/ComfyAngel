# ComfyUI Custom Node Development Best Practices

**Research Date:** 2026-01-15
**Confidence:** HIGH
**Sources:** 12+ verified sources

---

## Executive Summary

ComfyUI รองรับทั้ง **V1 (Legacy)** และ **V3 (Modern)** API พร้อมกัน โดย:
- V1 nodes ยังทำงานได้ตามปกติ ไม่ต้องรีบ migrate
- V3 เป็น future-proof API ที่มี backward compatibility guarantee
- **Nodes 2.0** (UI redesign) ≠ **Node V3 API** (backend API change)

---

## 1. V1 API (Legacy) - Best Practices

### 1.1 Basic Node Structure

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
                    "max": 1.0,
                    "step": 0.01
                }),
            },
            "optional": {
                "mask": ("MASK",),
            }
        }

    RETURN_TYPES = ("IMAGE",)  # ต้องมี comma!
    RETURN_NAMES = ("image",)
    FUNCTION = "process"
    CATEGORY = "ComfyAngel"

    def process(self, image, strength, mask=None):
        # Always check optional inputs
        if mask is not None:
            # use mask
            pass
        return (result_image,)
```

### 1.2 Required Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `INPUT_TYPES` | ✅ | `@classmethod` ที่ return dict ของ inputs |
| `RETURN_TYPES` | ✅ | Tuple ของ output types (ต้องมี comma แม้ตัวเดียว) |
| `FUNCTION` | ✅ | ชื่อ method ที่จะถูก execute |
| `CATEGORY` | ✅ | ตำแหน่งใน Add Node menu |
| `RETURN_NAMES` | ❌ | ชื่อ outputs (optional) |
| `OUTPUT_NODE` | ❌ | `True` ถ้าเป็น output node |

### 1.3 Data Types Reference

| Type | Shape | Value Range | Notes |
|------|-------|-------------|-------|
| `IMAGE` | (B, H, W, C) | 0.0 - 1.0 | BHWC format, **NOT** BCHW |
| `MASK` | (B, H, W) | 0.0 - 1.0 | No channel dimension |
| `LATENT` | dict | - | Must have "samples" key |
| `INT` | scalar | - | Integer widget |
| `FLOAT` | scalar | - | Float widget |
| `STRING` | str | - | Text widget |
| `BOOLEAN` | bool | - | Checkbox widget |

### 1.4 Common Gotchas

```python
# ❌ WRONG - Missing comma makes it NOT a tuple
RETURN_TYPES = ("IMAGE")

# ✅ CORRECT
RETURN_TYPES = ("IMAGE",)

# ❌ WRONG - Function returns non-tuple
def process(self, image):
    return image

# ✅ CORRECT
def process(self, image):
    return (image,)

# ❌ WRONG - Not handling optional inputs
def process(self, image, mask):
    result = image * mask  # Crashes if mask is None

# ✅ CORRECT
def process(self, image, mask=None):
    if mask is not None:
        result = image * mask
    else:
        result = image
    return (result,)
```

### 1.5 Memory Best Practices

```python
import torch

def process(self, image):
    # Use no_grad for inference
    with torch.no_grad():
        # Clone before modifying to avoid affecting cached data
        result = image.clone()

        # Process...
        result = 1.0 - result

        # Clean up large intermediates
        del large_temp_tensor

    return (result,)
```

### 1.6 Registration in `__init__.py`

```python
from .nodes.my_node import MyCustomNode

NODE_CLASS_MAPPINGS = {
    "MyCustomNode": MyCustomNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MyCustomNode": "My Custom Node",
}

# For JS widgets
WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
```

---

## 2. V3 API (Modern) - Future-Proof Approach

### 2.1 Key Changes from V1

| V1 | V3 |
|----|----|
| `INPUT_TYPES()` dict | `define_schema()` with `io.Schema` |
| `FUNCTION = "name"` | Always `execute` (classmethod) |
| `self` in execute | `cls` in execute (stateless) |
| `NODE_CLASS_MAPPINGS` | `ComfyExtension.get_node_list()` |
| `IS_CHANGED` | `fingerprint_inputs` |
| `VALIDATE_INPUTS` | `validate_inputs` |

### 2.2 V3 Node Example

```python
from comfy_api.latest import ComfyExtension, io, ui

class MyNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyNode",
            display_name="My Node",
            category="ComfyAngel",
            description="Does something cool",
            inputs=[
                io.Image.Input("image"),
                io.Float.Input("strength",
                    default=1.0,
                    min=0.0,
                    max=1.0,
                    step=0.01
                ),
                io.Mask.Input("mask", optional=True),
            ],
            outputs=[
                io.Image.Output(display_name="image"),
            ]
        )

    @classmethod
    def execute(cls, image, strength, mask=None) -> io.NodeOutput:
        # Process...
        result = image * strength
        if mask is not None:
            result = result * mask

        return io.NodeOutput(result)

# Extension registration
class MyExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [MyNode]

async def comfy_entrypoint() -> ComfyExtension:
    return MyExtension()
```

### 2.3 V3 Type Mapping

| V1 Type | V3 Type |
|---------|---------|
| `"IMAGE"` | `io.Image.Input()` / `io.Image.Output()` |
| `"MASK"` | `io.Mask.Input()` |
| `"INT"` | `io.Int.Input()` |
| `"FLOAT"` | `io.Float.Input()` |
| `"STRING"` | `io.String.Input()` |
| `"BOOLEAN"` | `io.Boolean.Input()` |
| `"MODEL"` | `io.Model.Input()` |
| `"CLIP"` | `io.Clip.Input()` |
| `"VAE"` | `io.Vae.Input()` |
| `"MY_TYPE"` (custom) | `io.Custom("my_type").Input()` |

---

## 3. Supporting Both V1 and V3

### 3.1 Current Situation

**ComfyUI รองรับทั้ง V1 และ V3 พร้อมกัน:**

- V1 nodes ยังทำงานได้ 100%
- ไม่มีการ force migrate
- V3 features จะถูกเพิ่มเฉพาะใน V3 API

### 3.2 Recommended Strategy

```
┌─────────────────────────────────────────────────────────┐
│  สำหรับ NEW projects:                                   │
│  → เริ่มเขียนด้วย V3 API เลย                            │
│                                                         │
│  สำหรับ EXISTING projects:                              │
│  → V1 ยังทำงานได้ ค่อยๆ migrate ทีละ node               │
│  → ไม่ต้องรีบ แต่ใหม่ๆ ให้เขียน V3                      │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Dual Support Pattern (Advanced)

ถ้าต้องการรองรับ ComfyUI เก่าที่ยังไม่มี V3 API:

```python
# nodes/my_node.py

try:
    from comfy_api.latest import io, ComfyExtension
    HAS_V3 = True
except ImportError:
    HAS_V3 = False

if HAS_V3:
    # V3 Implementation
    class MyNode(io.ComfyNode):
        @classmethod
        def define_schema(cls):
            return io.Schema(
                node_id="MyNode",
                display_name="My Node",
                category="ComfyAngel",
                inputs=[io.Image.Input("image")],
                outputs=[io.Image.Output()]
            )

        @classmethod
        def execute(cls, image):
            return io.NodeOutput(1.0 - image)

else:
    # V1 Fallback
    class MyNode:
        @classmethod
        def INPUT_TYPES(cls):
            return {"required": {"image": ("IMAGE",)}}

        RETURN_TYPES = ("IMAGE",)
        FUNCTION = "execute"
        CATEGORY = "ComfyAngel"

        def execute(self, image):
            return (1.0 - image,)
```

```python
# __init__.py

try:
    from comfy_api.latest import ComfyExtension
    from .nodes.my_node import MyNode

    class MyExtension(ComfyExtension):
        async def get_node_list(self):
            return [MyNode]

    async def comfy_entrypoint():
        return MyExtension()

except ImportError:
    # V1 fallback
    from .nodes.my_node import MyNode

    NODE_CLASS_MAPPINGS = {"MyNode": MyNode}
    NODE_DISPLAY_NAME_MAPPINGS = {"MyNode": "My Node"}
```

---

## 4. Troubleshooting Checklist

| Problem | Solution |
|---------|----------|
| Node ไม่แสดงใน menu | ตรวจสอบ `NODE_CLASS_MAPPINGS` |
| `RETURN_TYPES` error | ใส่ comma: `("IMAGE",)` |
| Tensor shape mismatch | ComfyUI ใช้ BHWC ไม่ใช่ BCHW |
| Memory leak | ใช้ `torch.no_grad()` + `del` unused |
| JS widget ไม่ load | ตรวจสอบ `WEB_DIRECTORY` path |
| Import error | ใช้ relative imports หรือ fix `sys.path` |
| Optional input crash | ตรวจสอบ `if input is not None` |

---

## 5. Sources

1. [Official ComfyUI Docs - Custom Nodes](https://docs.comfy.org/development/core-concepts/custom-nodes)
2. [V3 Migration Guide](https://docs.comfy.org/custom-nodes/v3_migration)
3. [ComfyUI Properties Reference](https://docs.comfy.org/custom-nodes/backend/server_overview)
4. [ComfyUI v3 Dependency Resolution](https://comfyui.org/en/comfyui-v3-dependency-resolution)
5. [Suzie1's Guide to Making Custom Nodes](https://github.com/Suzie1/ComfyUI_Guide_To_Making_Custom_Nodes)
6. [ComfyUI GitHub Discussions](https://github.com/comfyanonymous/ComfyUI/discussions/1291)
7. [BentoML Guide to ComfyUI Custom Nodes](https://www.bentoml.com/blog/a-guide-to-comfyui-custom-nodes)
8. [Civitai Basic Guide](https://civitai.com/articles/4934/a-basic-guide-to-creating-comfyui-custom-nodes)
9. [Nodes 2.0 Beta Announcement](https://blog.comfy.org/p/comfyui-node-2-0)
10. [ComfyUI Troubleshooting](https://docs.comfy.org/troubleshooting/custom-node-issues)
11. [comfyui-types PyPI](https://pypi.org/project/comfyui-types/)
12. [Apatero ComfyUI Guides](https://apatero.com/blog/comfyui-v0376-nodes-20-beta-complete-guide-2025)
