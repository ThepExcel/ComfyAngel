# ComfyAngel

Parameter Overlay & Visual Widget nodes for ComfyUI

**Display generation parameters directly on your images** - perfect for sharing, comparing, and archiving your AI art.

## Screenshots

### Example Workflow
![Example Workflow](assets/flow-example.png)

[Download Example Workflow (JSON)](examples/ComfyAngel%20Example.json)

### Color Picker with Eyedropper
![Color Picker](assets/colorpicker.png)

### Smart Crop Editor
![Smart Crop](assets/smart-crop.png)

---

## Installation

### ComfyUI Registry (Recommended)
```bash
comfy node install comfyangel
```

### ComfyUI Manager
Search for "ComfyAngel" in ComfyUI Manager and click Install.

### Manual Installation
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ThepExcel/ComfyAngel.git
```

Then restart ComfyUI.

---

## Nodes

### Overlay Nodes

#### Load Image + Metadata 🪽

Load image and extract embedded metadata from PNG files.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE_UPLOAD | Select image file to load |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | The loaded image |
| mask | MASK | Alpha channel as mask (if exists) |
| metadata_raw | STRING | Raw metadata string (JSON or A1111 format) |
| metadata_formatted | STRING | Human-readable formatted metadata |

**Supported formats:** A1111/Civitai PNG parameters, ComfyUI embedded workflow

---

#### Parameter Parser 🪽

Parse raw metadata string and extract individual generation parameters.

| Input | Type | Description |
|-------|------|-------------|
| metadata | STRING | Raw metadata (from Load Image + Metadata or paste manually) |
| show_prompt | BOOLEAN | Include prompt in formatted output (default: true) |
| max_prompt_length | INT | Maximum characters for prompt (default: 100) |

| Output | Type | Description |
|--------|------|-------------|
| formatted | STRING | Human-readable summary |
| model | STRING | Model/checkpoint name |
| sampler | STRING | Sampler name with scheduler |
| seed | INT | Generation seed |
| steps | INT | Number of steps |
| cfg | FLOAT | CFG scale value |
| positive_prompt | STRING | Positive prompt text |
| negative_prompt | STRING | Negative prompt text |

---

#### Parameter Overlay 🪽

Add generation parameters as visual overlay on image.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to add overlay to |
| image_path | STRING | Path to image with metadata (optional) |
| metadata_text | STRING | Raw metadata text (optional) |
| position | ENUM | `bottom_extend`, `bottom_inside`, `top_inside` |
| font_size | INT | Font size 8-32 (default: 14) |
| bg_opacity | FLOAT | Background opacity 0.0-1.0 (default: 0.7) |
| show_prompt | BOOLEAN | Show prompt in overlay (default: false) |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Image with parameter overlay |

---

#### Custom Text Overlay 🪽

Add custom text overlay with full styling control.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to add overlay to |
| text | STRING | Text to display (multiline supported) |
| position | ENUM | `bottom_extend`, `bottom_inside`, `top_inside` |
| font_size | INT | Font size 8-48 (default: 14) |
| bg_opacity | FLOAT | Background opacity 0.0-1.0 (default: 0.7) |
| text_color | STRING | Text color in hex (default: #FFFFFF) |
| bg_color | STRING | Background color in hex (default: #000000) |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Image with text overlay |

---

### Composite Nodes

#### Smart Composite XY 🪽

Composite overlay image onto canvas using X,Y coordinates.

| Input | Type | Description |
|-------|------|-------------|
| canvas | IMAGE | Background image |
| overlay | IMAGE | Image to place on top |
| x | INT | X position (-8192 to 8192) |
| y | INT | Y position (-8192 to 8192) |
| anchor | ENUM | Anchor point of overlay: `top_left`, `top_center`, `top_right`, `middle_left`, `center`, `middle_right`, `bottom_left`, `bottom_center`, `bottom_right` |
| scale | FLOAT | Scale percentage 1-500% (default: 100) |
| blend_mode | ENUM | `normal`, `multiply`, `screen`, `overlay`, `soft_light`, `hard_light`, `difference`, `add`, `subtract`, `darken`, `lighten` |
| opacity | FLOAT | Opacity 0-100% (default: 100) |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Composited image |

**Use case:** When you need precise pixel-level positioning.

---

#### Smart Composite Align 🪽

Composite overlay image onto canvas using alignment presets.

| Input | Type | Description |
|-------|------|-------------|
| canvas | IMAGE | Background image |
| overlay | IMAGE | Image to place on top |
| alignment | ENUM | Position on canvas: `top_left`, `top_center`, `top_right`, `middle_left`, `center`, `middle_right`, `bottom_left`, `bottom_center`, `bottom_right` |
| margin_x | INT | Horizontal margin from edge (-8192 to 8192) |
| margin_y | INT | Vertical margin from edge (-8192 to 8192) |
| scale | FLOAT | Scale percentage 1-500% (default: 100) |
| blend_mode | ENUM | Same as Smart Composite XY |
| opacity | FLOAT | Opacity 0-100% (default: 100) |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Composited image |

**Use case:** When you want to place images at corners, edges, or center without calculating coordinates.

---

### Widget Nodes

#### Resolution Picker 🪽

Pick from common image resolutions organized by aspect ratio.

| Input | Type | Description |
|-------|------|-------------|
| aspect_ratio | ENUM | `1:1 (Square)`, `4:3 (Standard)`, `3:2 (Photo)`, `16:9 (Widescreen)`, `21:9 (Ultrawide)`, `9:16 (Portrait Mobile)`, `3:4 (Portrait Standard)`, `2:3 (Portrait Photo)` |
| resolution | ENUM | Resolution options for selected aspect ratio |

| Output | Type | Description |
|--------|------|-------------|
| width | INT | Width in pixels |
| height | INT | Height in pixels |
| aspect_ratio | STRING | Aspect ratio string |

**Included presets:** SD 1.5, SDXL, SD3, Flux, DALL-E 3, Qwen-Image, Midjourney, Hunyuan, Kolors, and standard resolutions (720p, 1080p, 4K, etc.)

---

#### Solid Color 🪽

Generate a solid color image.

| Input | Type | Description |
|-------|------|-------------|
| color | STRING | Color in hex format (default: #FFFFFF) |
| width | INT | Image width (default: 512) |
| height | INT | Image height (default: 512) |
| batch_size | INT | Number of images to generate (default: 1) |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Solid color image |

---

#### Color Picker 🪽

Pick a color and output as hex string.

| Input | Type | Description |
|-------|------|-------------|
| color_hex | STRING | Color in hex format |
| image | IMAGE | Optional image for eyedropper picking |

| Output | Type | Description |
|--------|------|-------------|
| color | STRING | Normalized hex color (e.g., #FF0000) |

**Features:**
- HEX, RGB, HSL input modes
- Color presets for quick selection
- **Eyedropper** - Click on connected image to pick color directly

---

#### Smart Crop 🪽

Crop image using coordinates.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to crop |
| x | INT | Left position (0 to 8192) |
| y | INT | Top position (0 to 8192) |
| crop_width | INT | Width of crop area |
| crop_height | INT | Height of crop area |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Cropped image |

---

#### Image Info 🪽

Get image dimensions and batch information.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to analyze |

| Output | Type | Description |
|--------|------|-------------|
| width | INT | Image width |
| height | INT | Image height |
| channels | INT | Number of channels (3 for RGB) |
| batch_size | INT | Number of images in batch |

---

#### Image Bridge 🪽

Pass-through node with preview or save functionality.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to preview/save |
| mode | ENUM | `preview` (show in UI) or `save` (save to output folder) |
| filename_prefix | STRING | Prefix for saved files (default: ComfyAngel) |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Same image (pass-through) |

**Use case:** Insert between nodes to preview intermediate results while continuing the workflow.

---

## Example Workflow

See `examples/ComfyAngel Example.json` - drag and drop into ComfyUI to load.

---

## Supported Metadata Formats

| Format | Source | Example |
|--------|--------|---------|
| A1111 | Automatic1111, Civitai | `prompt\nNegative: ...\nSteps: 30, CFG: 7, Seed: 12345` |
| ComfyUI | ComfyUI native | JSON workflow embedded in PNG |

---

## Links

- **GitHub:** https://github.com/ThepExcel/ComfyAngel
- **Registry:** https://registry.comfy.org/thepexcel/comfyangel

---

## License

MIT
