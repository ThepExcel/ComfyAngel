# ComfyAngel

Parameter Overlay & Visual Widget nodes for ComfyUI

**Display generation parameters directly on your images** - perfect for sharing, comparing, and archiving your AI art.

## Features

- **Parameter Overlay** - Extract and display metadata (seed, model, sampler, CFG, etc.) from PNG images
- **Smart Composite** - Position images with coordinates (XY) or alignment (center, corners)
- **Visual Widgets** - Color picker, resolution picker, image info, and more

## Installation

### ComfyUI Manager (Recommended)
Search for "ComfyAngel" in ComfyUI Manager and click Install.

### Manual Installation
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ThepExcel/ComfyAngel.git
```

Then restart ComfyUI.

## Nodes

### Overlay Nodes

| Node | Description |
|------|-------------|
| **Load Image + Metadata** | Load image and extract embedded metadata (A1111/ComfyUI format) |
| **Parameter Parser** | Parse raw metadata into individual values (model, seed, steps, etc.) |
| **Parameter Overlay** | Add parameter info as visual overlay on image |
| **Custom Text Overlay** | Add custom text overlay with styling options |

### Composite Nodes

| Node | Description |
|------|-------------|
| **Smart Composite XY** | Composite images using X,Y coordinates + anchor point |
| **Smart Composite Align** | Composite images using alignment (center, corners, edges) + margins |

### Widget Nodes

| Node | Description |
|------|-------------|
| **Resolution Picker** | Pick from common resolutions (SD1.5, SDXL, Flux, DALL-E 3, etc.) |
| **Solid Color** | Generate solid color image |
| **Color Picker** | Pick color with hex output |
| **Smart Crop** | Crop image with coordinates |
| **Image Info** | Get image dimensions |
| **Image Bridge** | Preview or save image pass-through |

## Example Workflow

See `examples/ComfyAngel Example.json` - drag and drop into ComfyUI to load.

## Supported Metadata Formats

- **A1111/Civitai** - Standard PNG parameters format
- **ComfyUI** - JSON workflow embedded in PNG

## License

MIT
