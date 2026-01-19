# ComfyUI Official Node Specification Research

**Source:** github.com/comfyanonymous/ComfyUI (cloned 2026-01-19)
**Researcher:** Claude Opus 4.5
**Purpose:** Update `/comfyui-node-spec` skill with accurate, source-verified information

---

## Table of Contents

1. [Lazy Evaluation](#1-lazy-evaluation)
2. [Dynamic Inputs](#2-dynamic-inputs)
3. [forceInput Option](#3-forceinput-option)
4. [Hidden Inputs](#4-hidden-inputs)
5. [CONDITIONING Structure](#5-conditioning-structure)
6. [IS_CHANGED / Caching](#6-is_changed--caching)
7. [VALIDATE_INPUTS](#7-validate_inputs)
8. [Error Handling](#8-error-handling)
9. [V3 API Analysis](#9-v3-api-analysis)
10. [Output Node Flags](#10-output-node-flags)
11. [Code Patterns from Built-in Nodes](#11-code-patterns-from-built-in-nodes)

---

## 1. Lazy Evaluation

### How It Works

Lazy evaluation allows nodes to request only the inputs they actually need, avoiding unnecessary computation. This is implemented via the `check_lazy_status()` method (V1) or `check_lazy_status()` classmethod (V3).

**From `comfy_execution/graph.py` (lines 159-164):**
```python
_, _, input_info = self.get_input_info(unique_id, input_name)
is_lazy = input_info is not None and "lazy" in input_info and input_info["lazy"]
if (include_lazy or not is_lazy):
    if not self.is_cached(from_node_id):
        node_ids.append(from_node_id)
```

### Declaring Lazy Inputs

Mark an input as lazy in `INPUT_TYPES`:

```python
@classmethod
def INPUT_TYPES(cls):
    return {
        "required": {
            "switch": ("BOOLEAN",),
            "on_false": ("*", {"lazy": True}),  # Will not be evaluated unless requested
            "on_true": ("*", {"lazy": True}),
        }
    }
```

### Implementing check_lazy_status

**V1 Pattern:**
```python
def check_lazy_status(self, switch, on_false=None, on_true=None):
    """Return list of input names that should be evaluated."""
    if switch and on_true is None:
        return ["on_true"]
    if not switch and on_false is None:
        return ["on_false"]
    return []  # Empty list = all needed inputs are available
```

**From `execution.py` (lines 482-495):**
```python
if lazy_status_present:
    # for check_lazy_status, the returned data should include the original key of the input
    v3_data_lazy = v3_data.copy()
    v3_data_lazy["create_dynamic_tuple"] = True
    required_inputs = await _async_map_node_over_list(...)
    required_inputs = set(sum([r for r in required_inputs if isinstance(r,list)], []))
    required_inputs = [x for x in required_inputs if isinstance(x,str) and (
        x not in input_data_all or x in missing_keys
    )]
    if len(required_inputs) > 0:
        for i in required_inputs:
            execution_list.make_input_strong_link(unique_id, i)
        return (ExecutionResult.PENDING, None, None)
```

**Key Points:**
- `check_lazy_status` is called repeatedly until it returns an empty list
- Return a list of input names that need evaluation
- `None` value means the input hasn't been evaluated yet
- When using `INPUT_IS_LIST = True`, unevaluated inputs are `(None,)` instead of `None`

### ExecutionBlocker

**From `comfy_execution/graph_utils.py` (lines 140-155):**
```python
class ExecutionBlocker:
    """
    Return this from a node and any users will be blocked with the given error message.
    If the message is None, execution will be blocked silently instead.

    Generally, you should avoid using this functionality unless absolutely necessary.
    Whenever it's possible, a lazy input will be more efficient and have a better user experience.

    This functionality is useful in two cases:
    1. You want to conditionally prevent an output node from executing.
    2. You have a node with multiple possible outputs, some of which are invalid.
    """
    def __init__(self, message):
        self.message = message
```

**Usage Example (from testing nodes):**
```python
from comfy_execution.graph import ExecutionBlocker

def execution_blocker(self, input, block, verbose):
    if block:
        return (ExecutionBlocker("Blocked Execution" if verbose else None),)
    return (input,)
```

---

## 2. Dynamic Inputs

### The "*" (Any) Type

**From `comfy/comfy_types/node_typing.py` (lines 55-63):**
```python
class IO(StrEnum):
    ANY = "*"
    """Always matches any type, but at a price.

    Causes some functionality issues (e.g. reroutes, link types),
    and should be avoided whenever possible.
    """
    NUMBER = "FLOAT,INT"
    """A float or an int - could be either"""
    PRIMITIVE = "STRING,FLOAT,INT,BOOLEAN"
    """Could be any of: string, float, int, or bool"""
```

### Using "*" Type

```python
@classmethod
def INPUT_TYPES(cls):
    inputs = {
        "required": {
            "condition": ("BOOLEAN", {"default": True}),
        },
        "optional": {},
    }
    for i in range(5):
        inputs["optional"][f"initial_value{i}"] = ("*",)  # Accept any type
    return inputs

RETURN_TYPES = tuple(["FLOW_CONTROL"] + ["*"] * 5)  # Return any type
```

### Type Validation Logic

**From `comfy_execution/validation.py` (lines 5-59):**
```python
def validate_node_input(received_type: str, input_type: str, strict: bool = False) -> bool:
    """
    If strict is True, the input_type must contain the received_type.
    If strict is False, the input_type must have overlap with the received_type.
    """
    # If the types are exactly the same, return immediately
    if not received_type != input_type:
        return True

    # If one of the types is '*', return True immediately (Any type)
    if received_type == IO.AnyType.io_type or input_type == IO.AnyType.io_type:
        return True

    # Split type strings for comparison (supports "FLOAT,INT" union types)
    received_types = set(t.strip() for t in received_type.split(","))
    input_types = set(t.strip() for t in input_type.split(","))

    if strict:
        return received_types.issubset(input_types)
    else:
        return len(received_types.intersection(input_types)) > 0
```

### rawLink Option

**From `comfy/comfy_types/node_typing.py` (lines 117-118):**
```python
rawLink: NotRequired[bool]
"""When a link exists, rather than receiving the evaluated value,
you will receive the link (i.e. `["nodeId", <outputIndex>]`).
Designed for node expansion."""
```

**Usage (for flow control nodes):**
```python
"flow_control": ("FLOW_CONTROL", {"rawLink": True}),
```

---

## 3. forceInput Option

**From `comfy/comfy_types/node_typing.py` (lines 107-114):**
```python
defaultInput: NotRequired[bool]
"""@deprecated in v1.16 frontend. v1.16 frontend allows input socket and widget to co-exist.
- defaultInput on required inputs should be dropped.
- defaultInput on optional inputs should be replaced with forceInput.
Ref: https://github.com/Comfy-Org/ComfyUI_frontend/pull/3364
"""
forceInput: NotRequired[bool]
"""Forces the input to be an input slot rather than a widget even if
a widget is available for the input type."""
```

**Usage Example (from `nodes_hooks.py`):**
```python
"floats_strength": ("FLOATS", {"default": -1, "min": -1, "step": 0.001, "forceInput": True}),
"condition": ("BOOLEAN", {"forceInput": True}),
```

**When to Use:**
- When you want a value that MUST come from another node (no manual input)
- For BOOLEAN inputs that should be computed, not user-selected
- For numeric types that should be connected, not manually entered

---

## 4. Hidden Inputs

**From `comfy/comfy_types/node_typing.py` (lines 181-193):**
```python
class HiddenInputTypeDict(TypedDict):
    node_id: NotRequired[Literal["UNIQUE_ID"]]
    """UNIQUE_ID is the unique identifier of the node, and matches the id property
    of the node on the client side."""

    unique_id: NotRequired[Literal["UNIQUE_ID"]]
    """Same as node_id."""

    prompt: NotRequired[Literal["PROMPT"]]
    """PROMPT is the complete prompt sent by the client to the server."""

    extra_pnginfo: NotRequired[Literal["EXTRA_PNGINFO"]]
    """EXTRA_PNGINFO is a dictionary that will be copied into the metadata of any
    .png files saved."""

    dynprompt: NotRequired[Literal["DYNPROMPT"]]
    """DYNPROMPT is an instance of comfy_execution.graph.DynamicPrompt.
    It differs from PROMPT in that it may mutate during execution in response to
    Node Expansion."""
```

### What Each Hidden Input Contains

**UNIQUE_ID:**
- String identifier matching the node's `id` on client side
- Used for client-server communication

**PROMPT:**
- Complete workflow graph as sent by client
- Dictionary with node IDs as keys

**EXTRA_PNGINFO:**
- Dictionary copied into PNG metadata
- Can store custom data for downstream nodes

**DYNPROMPT:**
- Instance of `comfy_execution.graph.DynamicPrompt`
- Supports node expansion (creating subgraphs at runtime)

### Usage Example (from `nodes.py` SaveImage):**
```python
@classmethod
def INPUT_TYPES(s):
    return {
        "required": {
            "images": ("IMAGE",),
            "filename_prefix": ("STRING", {"default": "ComfyUI"})
        },
        "hidden": {
            "prompt": "PROMPT",
            "extra_pnginfo": "EXTRA_PNGINFO"
        },
    }

def save_images(self, images, filename_prefix="ComfyUI", prompt=None, extra_pnginfo=None):
    # prompt and extra_pnginfo are automatically injected
    if prompt is not None:
        metadata.add_text("prompt", json.dumps(prompt))
    if extra_pnginfo is not None:
        for x in extra_pnginfo:
            metadata.add_text(x, json.dumps(extra_pnginfo[x]))
```

---

## 5. CONDITIONING Structure

**From `comfy_api/latest/_io.py` (lines 448-499):**

CONDITIONING is a list of `[cond_tensor, pooled_dict]` tuples.

```python
@comfytype(io_type="CONDITIONING")
class Conditioning(ComfyTypeIO):
    class PooledDict(TypedDict):
        pooled_output: torch.Tensor
        '''Pooled output from CLIP.'''

        control: NotRequired[ControlNet]
        '''ControlNet to apply to conditioning.'''

        control_apply_to_uncond: NotRequired[bool]
        '''Whether to apply ControlNet to matching negative conditioning.'''

        gligen: NotRequired[tuple[str, Gligen, list[tuple[torch.Tensor, int, ...]]]]
        '''GLIGEN to apply to conditioning.'''

        area: NotRequired[tuple[int, ...] | tuple[str, float, ...]]
        '''Set area of conditioning. (height, width, y, x) or
        ("percentage", h_pct, w_pct, y_pct, x_pct)'''

        strength: NotRequired[float]
        '''Strength of conditioning. Default is 1.0.'''

        mask: NotRequired[torch.Tensor]
        '''Mask to apply conditioning to.'''

        mask_strength: NotRequired[float]
        '''Strength of conditioning mask. Default is 1.0.'''

        concat_latent_image: NotRequired[torch.Tensor]
        '''Used for inpainting and specific models.'''

        hooks: NotRequired[HookGroup]
        '''Applies hooks to conditioning.'''

        start_percent: NotRequired[float]
        '''Relative step to begin applying (0.0 to 1.0).'''

        end_percent: NotRequired[float]
        '''Relative step to end applying (0.0 to 1.0).'''

    Type = list[tuple[torch.Tensor, PooledDict]]
```

**Working with CONDITIONING (from nodes.py):**
```python
def combine(self, conditioning_1, conditioning_2):
    # CONDITIONING is a list, can be concatenated
    return (conditioning_1 + conditioning_2, )

def addWeighted(self, conditioning_to, conditioning_from, conditioning_to_strength):
    cond_from = conditioning_from[0][0]  # Get tensor from first item
    pooled_output_from = conditioning_from[0][1].get("pooled_output", None)

    for i in range(len(conditioning_to)):
        t1 = conditioning_to[i][0]
        pooled_output_to = conditioning_to[i][1].get("pooled_output", pooled_output_from)
        # ... weighted combination
```

---

## 6. IS_CHANGED / Caching

### Purpose

`IS_CHANGED` controls node caching. If it returns the same value as the previous run, the node won't re-execute.

**From `nodes.py` LoadImage (lines 1712-1718):**
```python
@classmethod
def IS_CHANGED(s, image):
    image_path = folder_paths.get_annotated_filepath(image)
    m = hashlib.sha256()
    with open(image_path, 'rb') as f:
        m.update(f.read())
    return m.digest().hex()
```

### Key Points

1. **Signature:** `@classmethod` that receives `s` (class) and all input parameters
2. **Return Value:** Can be any hashable value (string, tuple, etc.)
3. **Same return = cached:** If value matches previous execution, node is skipped
4. **File-based nodes:** Typically hash file contents

**V3 Equivalent: `fingerprint_inputs`**
```python
@classmethod
def fingerprint_inputs(cls, **kwargs) -> Any:
    """If this function returns the same value as last run,
    the node will not be executed."""
    pass
```

---

## 7. VALIDATE_INPUTS

### Return Format

**From `nodes.py` (lines 1720-1725):**
```python
@classmethod
def VALIDATE_INPUTS(s, image):
    if not folder_paths.exists_annotated_filepath(image):
        return "Invalid image file: {}".format(image)
    return True
```

### Rules

1. **Return `True`** = inputs are valid
2. **Return string** = validation error message (will be shown to user)
3. Called **before** `check_lazy_status` and execution

**V3 Example (from `nodes_logic.py`):**
```python
@classmethod
def validate_inputs(cls, switch, on_false=MISSING, on_true=MISSING):
    if on_false is MISSING and on_true is MISSING:
        return "At least one of on_false or on_true must be connected to Switch node"
    return True
```

### Validation Flow

**From `execution.py` (lines 773-774):**
```python
# V1 uses VALIDATE_INPUTS, V3 uses validate_inputs
validate_function_name = "VALIDATE_INPUTS"  # for V1
validate_function_name = "validate_inputs"   # for V3
```

---

## 8. Error Handling

### Raising Errors

Nodes should raise standard Python exceptions:

**From `nodes.py` CLIPTextEncode:**
```python
def encode(self, clip, text):
    if clip is None:
        raise RuntimeError(
            "ERROR: clip input is invalid: None\n\n"
            "If the clip is from a checkpoint loader node your checkpoint "
            "does not contain a valid clip or text encoder model."
        )
```

### Error Response Format

**From `execution.py` (lines 608-614):**
```python
error_details = {
    "node_id": real_node_id,
    "exception_message": "{}\n{}".format(ex, tips),
    "exception_type": exception_type,
    "traceback": traceback.format_tb(tb),
    "current_inputs": input_data_formatted
}
```

### OOM Handling

**From `execution.py` (lines 602-606):**
```python
if isinstance(ex, comfy.model_management.OOM_EXCEPTION):
    tips = "This error means you ran out of memory on your GPU.\n\n" \
           "TIPS: If the workflow worked before you might have accidentally " \
           "set the batch_size to a large number."
    comfy.model_management.unload_all_models()
```

---

## 9. V3 API Analysis

### Status: Available but Experimental

The V3 API is present and functional in the codebase. It coexists with V1.

### Key Differences from V1

| Aspect | V1 | V3 |
|--------|----|----|
| Input definition | `INPUT_TYPES()` dict | `define_schema()` with `io.Schema` |
| Main function | `FUNCTION = "method_name"` | `execute()` classmethod |
| Validation | `VALIDATE_INPUTS()` | `validate_inputs()` |
| Caching | `IS_CHANGED()` | `fingerprint_inputs()` |
| Lazy eval | `check_lazy_status()` instance method | `check_lazy_status()` classmethod |
| Output | Return tuple | Return `io.NodeOutput` |
| Registration | `NODE_CLASS_MAPPINGS` dict | `comfy_entrypoint()` async function |

### V3 Node Structure

**From `comfy_extras/nodes_primitive.py`:**
```python
from comfy_api.latest import ComfyExtension, io

class String(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="PrimitiveString",
            display_name="String",
            category="utils/primitive",
            inputs=[
                io.String.Input("value"),
            ],
            outputs=[io.String.Output()],
        )

    @classmethod
    def execute(cls, value: str) -> io.NodeOutput:
        return io.NodeOutput(value)


class PrimitivesExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [String, StringMultiline, Int, Float, Boolean]

async def comfy_entrypoint() -> PrimitivesExtension:
    return PrimitivesExtension()
```

### V3 Schema Options

**From `comfy_api/latest/_io.py` (lines 1314-1361):**
```python
@dataclass
class Schema:
    node_id: str                    # Globally unique ID
    display_name: str = None        # Display name
    category: str = "sd"            # Category in Add Node menu
    inputs: list[Input] = []
    outputs: list[Output] = []
    hidden: list[Hidden] = []
    description: str = ""           # Tooltip on hover
    is_input_list: bool = False     # Equivalent to INPUT_IS_LIST
    is_output_node: bool = False    # Equivalent to OUTPUT_NODE
    is_deprecated: bool = False
    is_experimental: bool = False
    is_api_node: bool = False
    not_idempotent: bool = False    # Don't reuse cached outputs
    enable_expand: bool = False     # Allow node expansion
```

### V3 Input Types

```python
# Basic types
io.String.Input("name", multiline=True, placeholder="Enter text")
io.Int.Input("count", min=1, max=100, default=10)
io.Float.Input("strength", min=0.0, max=1.0, step=0.1)
io.Boolean.Input("enabled", default=True)
io.Combo.Input("method", options=["option1", "option2"])

# Image/Tensor types
io.Image.Input("image")
io.Mask.Input("mask", optional=True)
io.Latent.Input("latent")

# Advanced types
io.AnyType.Input("any_input")  # The "*" type
io.MatchType.Input("matched", template=template)  # Type matching
```

### V3 NodeOutput

**From `comfy_api/latest/_io.py` (lines 1926-1954):**
```python
class NodeOutput(_NodeOutputInternal):
    '''
    Standardized output of a node; can pass in any number of args
    and/or a UIOutput into 'ui' kwarg.
    '''
    def __init__(self, *args: Any, ui: _UIOutput | dict=None,
                 expand: dict=None, block_execution: str=None):
        self.args = args
        self.ui = ui
        self.expand = expand
        self.block_execution = block_execution
```

**Usage:**
```python
# Simple return
return io.NodeOutput(processed_image)

# Multiple outputs
return io.NodeOutput(image, mask)

# With UI output
return io.NodeOutput(result, ui={"images": results})

# Block execution
return io.NodeOutput(block_execution="Condition not met")
```

---

## 10. Output Node Flags

### OUTPUT_NODE

**From `comfy/comfy_types/node_typing.py` (lines 255-267):**
```python
OUTPUT_NODE: bool
"""Flags this node as an output node, causing any inputs it requires to be executed.

If a node is not connected to any output nodes, that node will not be executed.

By default, a node is not considered an output. Set OUTPUT_NODE = True to specify that it is.
"""
```

**Usage:**
```python
class SaveImage:
    OUTPUT_NODE = True  # This node triggers execution
    RETURN_TYPES = ()   # Output nodes typically return nothing
```

### Other Class Flags

```python
EXPERIMENTAL = True    # Show experimental warning
DEPRECATED = True      # Show deprecated warning
API_NODE = True        # API node flag
INPUT_IS_LIST = True   # Receive all inputs as lists
OUTPUT_IS_LIST = (True, False)  # Which outputs are lists
NOT_IDEMPOTENT = True  # Don't cache results
```

---

## 11. Code Patterns from Built-in Nodes

### Basic Node Pattern (V1)

```python
class MyNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "value": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 10.0,
                    "step": 0.1,
                    "tooltip": "Description here"
                }),
            },
            "optional": {
                "mask": ("MASK",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    OUTPUT_TOOLTIPS = ("The processed image.",)
    FUNCTION = "process"
    CATEGORY = "image"
    DESCRIPTION = "Processes an image with the given parameters."

    def process(self, image, value, mask=None):
        # Implementation
        return (result,)
```

### Image Processing Pattern

**From nodes.py ImageInvert:**
```python
class ImageInvert:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"image": ("IMAGE",)}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "invert"
    CATEGORY = "image"

    def invert(self, image):
        s = 1.0 - image
        return (s,)
```

### Loader Node with IS_CHANGED

```python
class LoadImage:
    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        return {"required": {"image": (sorted(files), {"image_upload": True})}}

    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "load_image"
    CATEGORY = "image"

    def load_image(self, image):
        # Load and process
        return (output_image, output_mask)

    @classmethod
    def IS_CHANGED(s, image):
        image_path = folder_paths.get_annotated_filepath(image)
        m = hashlib.sha256()
        with open(image_path, 'rb') as f:
            m.update(f.read())
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(s, image):
        if not folder_paths.exists_annotated_filepath(image):
            return "Invalid image file: {}".format(image)
        return True
```

### Lazy Evaluation Pattern (V3)

**From `nodes_logic.py` SwitchNode:**
```python
class SwitchNode(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        template = io.MatchType.Template("switch")
        return io.Schema(
            node_id="ComfySwitchNode",
            display_name="Switch",
            category="logic",
            is_experimental=True,
            inputs=[
                io.Boolean.Input("switch"),
                io.MatchType.Input("on_false", template=template, lazy=True),
                io.MatchType.Input("on_true", template=template, lazy=True),
            ],
            outputs=[
                io.MatchType.Output(template=template, display_name="output"),
            ],
        )

    @classmethod
    def check_lazy_status(cls, switch, on_false=None, on_true=None):
        if switch and on_true is None:
            return ["on_true"]
        if not switch and on_false is None:
            return ["on_false"]
        return []

    @classmethod
    def execute(cls, switch, on_true, on_false) -> io.NodeOutput:
        return io.NodeOutput(on_true if switch else on_false)
```

### Node Expansion Pattern

**From testing nodes:**
```python
def while_loop_close(self, flow_control, condition, dynprompt=None, unique_id=None, **kwargs):
    if not condition:
        # Done with loop
        return tuple(values)

    # Create subgraph for another iteration
    graph = GraphBuilder()
    for node_id in contained:
        original_node = dynprompt.get_node(node_id)
        node = graph.node(original_node["class_type"], node_id)
        node.set_override_display_id(node_id)

    # Return with expand directive
    return {
        "result": tuple(result),
        "expand": graph.finalize(),
    }
```

---

## Summary: Key Takeaways

1. **Lazy Evaluation** - Use `lazy: True` in input options and implement `check_lazy_status()` to avoid unnecessary computation.

2. **Dynamic Types** - The `"*"` type matches anything but has UX tradeoffs. Union types like `"FLOAT,INT"` are preferred when possible.

3. **forceInput** - Forces widget types to become connection-only slots. `defaultInput` is deprecated.

4. **Hidden Inputs** - `PROMPT`, `EXTRA_PNGINFO`, `UNIQUE_ID`, `DYNPROMPT` provide workflow metadata and node expansion capabilities.

5. **CONDITIONING** - A list of `[tensor, dict]` tuples with pooled_output, controlnet, areas, masks, and scheduling options.

6. **Caching** - `IS_CHANGED`/`fingerprint_inputs` returns a hashable value; same value = skip execution.

7. **Validation** - Return `True` for valid, string for error message.

8. **V3 API** - Modern, class-based approach using `io.Schema`, `io.ComfyNode`, and `io.NodeOutput`. Available and working alongside V1.

9. **Output Nodes** - Set `OUTPUT_NODE = True` to make a node trigger execution.

10. **ExecutionBlocker** - Use sparingly to conditionally prevent downstream execution.
