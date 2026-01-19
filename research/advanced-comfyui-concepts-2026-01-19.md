# Advanced ComfyUI Concepts for Custom Node Development

**Research Date:** 2026-01-19
**Tier:** Quick (10 sources)
**Focus:** Custom node development patterns

---

## 1. Latent Space Operations

### Latent Tensor Format

**Structure:** Dictionary with `samples` key
```python
LATENT = {
    "samples": torch.Tensor  # Shape: [B, C, H, W]
}
```

**Key Properties:**
- **Shape:** `[B, C, H, W]` - Batch, Channels, Height, Width (channel-first)
- **Standard Channels:** C=4 for SD 1.5/SDXL, C=12 for Mochi video, C=16 for some newer models
- **Spatial Compression:** Typically 8x compressed from pixel space
- **Value Range:** Unbounded floating point (not 0-1 like images)

**Contrast with IMAGE format:**
| Type | Shape | Order |
|------|-------|-------|
| LATENT | [B,C,H,W] | Channel-first |
| IMAGE | [B,H,W,C] | Channel-last |

### Common Latent Manipulations

```python
# Access latent tensor
latent_tensor = latent_dict["samples"]  # Shape: [B, C, H, W]

# Clone before modification (critical!)
result = latent_tensor.clone()

# Flip operations
flipped_h = torch.flip(result, dims=[3])  # Horizontal flip (W dimension)
flipped_v = torch.flip(result, dims=[2])  # Vertical flip (H dimension)

# Shift operations (roll with wrap-around)
shift_x = int(result.shape[3] * normalized_x)  # Convert -1 to 1 range to pixels
shift_y = int(result.shape[2] * normalized_y)
shifted = torch.roll(result, shifts=(shift_y, shift_x), dims=(2, 3))

# Interpolation between two latents
mixed = latent1 * (1 - ratio) + latent2 * ratio

# Scale/multiply
scaled = result * scale_factor
```

### Latent Composition Patterns

**From ComfyUI-Advanced-Latent-Control:**
```python
# Combine original and flipped for symmetric effects
combined = (original + flipped) / 2.0

# Latent normalization (fixes artifacts from extreme operations)
# Decode to image, re-encode to latent - resets distribution
```

**References:**
- [ComfyUI-Advanced-Latent-Control](https://github.com/kuschanow/ComfyUI-Advanced-Latent-Control)
- [ComfyUI-LatentWalk](https://github.com/rnbwdsh/ComfyUI-LatentWalk)
- [Latent Space Principles](https://www.oreateai.com/blog/comfyui-core-node-analysis-six-major-application-scenarios-and-technical-principles-of-latent-space/)

---

## 2. ControlNet Integration

### ControlNet Data Flow

```
[Load Image] → [Preprocessor] → [ControlNet Apply] → [KSampler]
                    ↓                    ↑
              Hint Image           ControlNet Model
              (canny, depth, etc)
```

### Preprocessor Node Pattern

**comfyui_controlnet_aux categories:**
- Line Extractors (Canny, HED, Scribble, PiDiNet)
- Normal/Depth Estimators (MiDaS, BAE, DSINE, Depth Anything)
- Faces and Poses (OpenPose, DWPose, MediaPipe)
- Semantic Segmentation (OneFormer, SAM)
- Optical Flow (RAFT)

**AIO Preprocessor:** Single node that auto-selects preprocessor type

### Multi-ControlNet Handling

**From ComfyUI-Advanced-ControlNet:**
```python
# Chain multiple ControlNets
controlnet1_output → controlnet2_input → ... → final_conditioning

# Timestep scheduling
TimestepKeyframe(
    start_percent=0.0,
    strength=1.0
)

# Per-frame strength control for video
strength_schedule = [1.0, 0.9, 0.8, ...]  # Per batch frame
```

**Key Features:**
- Sliding context support for AnimateDiff compatibility
- Timestep keyframing for varying ControlNet influence
- Mask-based regional control

**References:**
- [Official ControlNet Guide](https://docs.comfy.org/tutorials/controlnet/controlnet)
- [ComfyUI-Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet)
- [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux)

---

## 3. Video Processing

### Frame-by-Frame Processing

**Video as IMAGE batch:**
```python
# Video frames are batched along dimension 0
video_frames: torch.Tensor  # Shape: [num_frames, H, W, C]

# Process each frame
for i in range(video_frames.shape[0]):
    frame = video_frames[i]  # Shape: [H, W, C]
    processed = process_frame(frame)
    results.append(processed)

output = torch.stack(results)  # Shape: [num_frames, H, W, C]
```

### Temporal Consistency (AnimateDiff)

**Sliding Context Windows:**
```python
# Process video in overlapping windows to maintain consistency
context_length = 16  # frames per context
context_overlap = 4  # frames overlapping between contexts

# Window 1: frames 0-15
# Window 2: frames 12-27 (overlaps 12-15)
# Window 3: frames 24-39 (overlaps 24-27)
```

**Key AnimateDiff Concepts:**
- **Context Options:** Control sliding window across entire UNet
- **View Options:** Control sliding window within motion module
- **ContextRef:** Custom cross-context consistency method
- **NaiveReuse:** Alternative temporal continuity approach

### AnimateDiff Integration Pattern

**From ComfyUI-AnimateDiff-Evolved:**
```python
# Load motion model
motion_model = load_motion_module("mm_sd_v15.safetensors")

# Apply to model
animated_model = apply_animatediff(
    model=base_model,
    motion_model=motion_model,
    context_options=ContextOptions(
        context_length=16,
        context_overlap=4,
        fuse_method="flat"
    )
)

# Sample with temporal awareness
samples = sample(animated_model, latents)  # Shape: [num_frames, C, H, W]
```

**References:**
- [ComfyUI-AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
- [comfyui-dream-video-batches](https://github.com/alt-key-project/comfyui-dream-video-batches)

---

## 4. Audio Handling

### Audio Tensor Format

**Structure:** Dictionary with `waveform` and `sample_rate`
```python
AUDIO = {
    "waveform": torch.Tensor,  # Shape: [B, C, T]
    "sample_rate": int         # e.g., 44100, 48000
}
```

**Shape Details:**
- **B:** Batch size (number of audio clips)
- **C:** Channels (1=mono, 2=stereo)
- **T:** Time steps (num_samples = duration_seconds * sample_rate)

### Common Audio Patterns

```python
# Create AUDIO dict
audio = {
    "waveform": waveform_tensor,  # [B, C, T]
    "sample_rate": 44100
}

# Access waveform
waveform = audio["waveform"]
sample_rate = audio["sample_rate"]

# Calculate duration
duration_seconds = waveform.shape[2] / sample_rate

# Resample (if needed)
resampled = torchaudio.transforms.Resample(
    orig_freq=original_sr,
    new_freq=target_sr
)(waveform)

# Channel conversion
mono = waveform.mean(dim=1, keepdim=True)  # Stereo to mono
stereo = waveform.repeat(1, 2, 1)  # Mono to stereo (simple duplication)
```

### Audio-Video Synchronization

**Frame-Audio Alignment:**
```python
video_fps = 24
audio_sample_rate = 44100
num_video_frames = 100

# Samples per video frame
samples_per_frame = audio_sample_rate / video_fps  # 1837.5

# Extract audio for specific frame
frame_idx = 50
start_sample = int(frame_idx * samples_per_frame)
end_sample = int((frame_idx + 1) * samples_per_frame)
frame_audio = waveform[:, :, start_sample:end_sample]
```

**Audio Reactivity Pattern (ComfyUI_Yvann-Nodes):**
- Analyze audio amplitude/frequency per frame
- Generate weight schedules from audio features
- Apply weights to other parameters (IPAdapter, ControlNet strength)

**References:**
- [ComfyUI Datatypes](https://docs.comfy.org/custom-nodes/backend/datatypes)
- [comfyui-audio-processing](https://github.com/rhdunn/comfyui-audio-processing)
- [ComfyUI-AudioBatch](https://github.com/set-soft/ComfyUI-AudioBatch)
- [ComfyUI_Yvann-Nodes](https://github.com/yvann-ba/ComfyUI_Yvann-Nodes)

---

## 5. 3D Rendering Basics

### Depth Map Handling

**Depth Map Properties:**
- Single-channel grayscale image
- Values represent distance (darker=closer or inverted)
- Shape: `[B, H, W]` as MASK or `[B, H, W, 1]` as IMAGE

**Common Operations:**
```python
# Normalize depth to 0-1 range
depth_normalized = (depth - depth.min()) / (depth.max() - depth.min())

# Invert depth (swap near/far)
depth_inverted = 1.0 - depth_normalized

# Apply depth-based effects
effect_strength = depth_normalized * max_strength
```

### Normal Map Processing

**Normal Map Format:**
- RGB image encoding surface orientation
- R = X direction, G = Y direction, B = Z direction
- Values centered at 0.5 (128 in 8-bit), ranging 0-1
- Shape: `[B, H, W, 3]`

**Depth to Normal Conversion (DepthToNormalMap):**
```python
# Sobel-like gradient calculation
dx = depth[:, :, 2:] - depth[:, :, :-2]  # X gradient
dy = depth[:, 2:, :] - depth[:, :-2, :]  # Y gradient

# Construct normal vectors
normal_x = -dx * intensity
normal_y = -dy * intensity
normal_z = torch.ones_like(dx)

# Normalize and convert to 0-1 range
normal = torch.stack([normal_x, normal_y, normal_z], dim=-1)
normal = F.normalize(normal, dim=-1)
normal = (normal + 1) / 2  # Map from [-1,1] to [0,1]
```

### Camera/Pose Integration

**Depth ControlNet Usage:**
- Depth maps guide spatial layout in generation
- Works with MiDaS, Depth Anything, ZoeDepth estimators

**Pose Estimation:**
- OpenPose: Body keypoints (COCO format)
- DWPose: Improved body + hands + face
- MediaPipe: Face mesh, hand landmarks

**References:**
- [DepthToNormalMap Node](https://comfyai.run/documentation/DepthToNormalMap)
- [Depth ControlNet Guide](https://docs.comfy.org/tutorials/controlnet/depth-controlnet)
- [ComfyUI-Image-Filters](https://github.com/spacepxl/ComfyUI-Image-Filters)

---

## 6. Advanced Node Patterns

### Lazy Evaluation (Conditional Execution)

**Purpose:** Skip processing of unused inputs to save computation

**Implementation Pattern:**
```python
class LazyMixImages:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image1": ("IMAGE", {"lazy": True}),  # Mark as lazy
                "image2": ("IMAGE", {"lazy": True}),
                "mask": ("MASK",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "mix"
    CATEGORY = "Examples"

    def check_lazy_status(self, mask, image1, image2):
        """Called before execution. Return list of needed lazy inputs."""
        mask_min = mask.min()
        mask_max = mask.max()
        needed = []

        # Only request image1 if mask isn't fully white
        if image1 is None and (mask_min != 1.0 or mask_max != 1.0):
            needed.append("image1")

        # Only request image2 if mask isn't fully black
        if image2 is None and (mask_min != 0.0 or mask_max != 0.0):
            needed.append("image2")

        return needed  # Return empty list when all needed inputs available

    def mix(self, mask, image1, image2):
        # Execution only happens when check_lazy_status returns []
        mask_min = mask.min()
        mask_max = mask.max()

        if mask_min == 0.0 and mask_max == 0.0:
            return (image1,)
        elif mask_min == 1.0 and mask_max == 1.0:
            return (image2,)

        result = image1 * (1.0 - mask) + image2 * mask
        return (result,)
```

### ExecutionBlocker Pattern

**For blocking output nodes:**
```python
from comfy_execution.graph import ExecutionBlocker

def conditional_passthrough(self, value, should_block):
    if should_block:
        return (ExecutionBlocker(None),)  # Silent block
    return (value,)

def load_with_fallback(self, model_name):
    model = try_load_model(model_name)
    if model is None:
        return (ExecutionBlocker(f"Failed to load {model_name}"),)
    return (model,)
```

### Dynamic Inputs Pattern

**Python side:**
```python
class DynamicInputNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input_1": ("*",),  # "*" = ANY type
            },
        }

    RETURN_TYPES = ("*",)
    FUNCTION = "execute"

    def execute(self, **kwargs):
        """Accept variable number of inputs via kwargs"""
        inputs = []
        for key, value in kwargs.items():
            if key.startswith("input_"):
                inputs.append(value)

        # Process all inputs...
        return (result,)
```

**JavaScript side (for auto-expanding inputs):**
```javascript
// In web/js/dynamic_inputs.js
app.registerExtension({
    name: "MyDynamicNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DynamicInputNode") {
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                // Add new input when last one is connected
                if (type === LiteGraph.INPUT && connected) {
                    const lastInput = this.inputs[this.inputs.length - 1];
                    if (lastInput && lastInput.link !== null) {
                        const nextNum = this.inputs.length + 1;
                        this.addInput(`input_${nextNum}`, "*");
                    }
                }
                return onConnectionsChange?.apply(this, arguments);
            };
        }
    }
});
```

### Context System Pattern

**Sharing state across nodes:**
```python
# Context object pattern
class MyContext:
    def __init__(self):
        self.settings = {}
        self.cache = {}

# Create context node
class CreateContext:
    RETURN_TYPES = ("MY_CONTEXT",)

    def create(self, setting1, setting2):
        ctx = MyContext()
        ctx.settings = {"setting1": setting1, "setting2": setting2}
        return (ctx,)

# Use context node
class UseContext:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "context": ("MY_CONTEXT",),
                "image": ("IMAGE",),
            },
        }

    def process(self, context, image):
        # Access shared settings
        setting1 = context.settings["setting1"]
        # Process with settings...
        return (result,)
```

**References:**
- [Official Lazy Evaluation Docs](https://docs.comfy.org/custom-nodes/backend/lazy_evaluation)
- [cozy_ex_dynamic](https://github.com/cozy-comfyui/cozy_ex_dynamic)
- [ComfyUI-Logic](https://github.com/theUpsider/ComfyUI-Logic)
- [ComfyUI Node Docs](https://docs.comfy.org/development/core-concepts/nodes)

---

## Integration Considerations

### Memory Management

```python
# Always use torch.no_grad() for inference
with torch.no_grad():
    result = process(input_tensor)

# Clone tensors before modification
modified = input_tensor.clone()

# Move to appropriate device
tensor = tensor.to(model.device)

# Clear GPU memory when done with large tensors
del large_tensor
torch.cuda.empty_cache()
```

### Batch Handling

```python
# Handle variable batch sizes
def process(self, images):
    batch_size = images.shape[0]
    results = []

    for i in range(batch_size):
        single = images[i:i+1]  # Keep batch dim: [1, H, W, C]
        processed = self.process_single(single)
        results.append(processed)

    return (torch.cat(results, dim=0),)
```

### Error Handling

```python
def process(self, image, optional_input=None):
    # Check optional inputs with 'is not None' (not truthiness)
    if optional_input is not None:
        # Use optional input
        pass

    # Validate tensor shapes
    if image.dim() == 3:
        image = image.unsqueeze(0)  # Add batch dimension

    # Check for expected shape
    assert image.dim() == 4, f"Expected 4D tensor, got {image.dim()}D"

    return (result,)
```

---

## Sources

1. [ComfyUI Official Docs - Custom Nodes](https://docs.comfy.org/development/core-concepts/custom-nodes)
2. [ComfyUI Official Docs - Lazy Evaluation](https://docs.comfy.org/custom-nodes/backend/lazy_evaluation)
3. [ComfyUI Official Docs - Images and Masks](https://docs.comfy.org/custom-nodes/backend/images_and_masks)
4. [ComfyUI Official Docs - Datatypes](https://docs.comfy.org/custom-nodes/backend/datatypes)
5. [ComfyUI-Advanced-Latent-Control](https://github.com/kuschanow/ComfyUI-Advanced-Latent-Control)
6. [ComfyUI-AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
7. [ComfyUI-Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet)
8. [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux)
9. [comfyui-audio-processing](https://github.com/rhdunn/comfyui-audio-processing)
10. [cozy_ex_dynamic](https://github.com/cozy-comfyui/cozy_ex_dynamic)
