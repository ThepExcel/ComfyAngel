# ComfyAngel

Parameter Overlay, Visual Widgets & Loop nodes for ComfyUI

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

### Loop Nodes

True loop functionality **without Auto Queue**. Iterate through batches/lists and accumulate results in a single execution.

ComfyAngel provides two versions of Loop nodes:
- **Simple** - For most use cases. Single result slot, easy to use.
- **Advanced** - For complex workflows. 10 value/result slots for multiple accumulations.

---

#### Loop Start 🪽 (Simple)

Start a loop over items. This is the recommended version for most workflows.

**How it works:**
1. Takes a batch of items (images, texts, etc.)
2. On each iteration, outputs the current item
3. Connect `flow` to `Loop End` to complete the loop

| Input | Type | Description |
|-------|------|-------------|
| items | ANY | Batch/list to iterate over. Accepts IMAGE batch tensors, lists of strings, or any iterable. |

| Output | Type | Description |
|--------|------|-------------|
| flow | FLOW_CONTROL | **Must connect to Loop End.** This controls the loop execution. |
| item | ANY | Current item from the batch for this iteration. |
| index | INT | Current iteration index (0-based). First item = 0, second = 1, etc. |
| total | INT | Total number of items in the batch. |
| is_last | BOOLEAN | True only on the final iteration. Useful for conditional logic. |

**Example - Loop through text prompts:**
```
[Text Permutation] outputs: ["cat on chair", "cat on sofa", "dog on chair", "dog on sofa"]
         ↓
[Loop Start] iteration 0: item = "cat on chair", index = 0, total = 4, is_last = False
[Loop Start] iteration 1: item = "cat on sofa",  index = 1, total = 4, is_last = False
[Loop Start] iteration 2: item = "dog on chair", index = 2, total = 4, is_last = False
[Loop Start] iteration 3: item = "dog on sofa",  index = 3, total = 4, is_last = True
```

---

#### Loop End 🪽 (Simple)

End a loop and collect all results into a single output.

**How it works:**
1. Receives `flow` from Loop Start
2. Accumulates `result` from each iteration
3. After all iterations complete, outputs all results as a batch/list

| Input | Type | Description |
|-------|------|-------------|
| flow | FLOW_CONTROL | **Must connect from Loop Start.** |
| result | ANY | Value to collect from each iteration. Can be IMAGE, STRING, or any type. |

| Output | Type | Description |
|--------|------|-------------|
| results | ANY | All accumulated results. IMAGE tensors become a batch (B,H,W,C). Strings become a list. |

**Accumulation behavior:**
- **IMAGE/MASK tensors:** Concatenated into a batch tensor. 4 images → tensor shape (4, H, W, C)
- **Strings:** Collected into a Python list. 4 strings → ["str1", "str2", "str3", "str4"]
- **Other types:** Collected into a Python list.

---

#### Loop Start (Advanced) 🪽

Advanced version with 10 value slots for complex accumulation patterns.

**When to use Advanced:**
- You need to accumulate multiple different values (e.g., both images AND their prompts)
- You need to pass values between iterations (e.g., running totals, state)
- Simple version doesn't meet your needs

| Input | Type | Description |
|-------|------|-------------|
| items | ANY | Batch/list to iterate over. |
| initial_value0 | ANY | Optional. Initial value for slot 0. Passed to first iteration. |
| initial_value1 | ANY | Optional. Initial value for slot 1. |
| ... | ... | ... |
| initial_value9 | ANY | Optional. Initial value for slot 9. |

| Output | Type | Description |
|--------|------|-------------|
| flow | FLOW_CONTROL | Connect to Loop End (Advanced). |
| item | ANY | Current item from the batch. |
| index | INT | Current iteration index (0-based). |
| total | INT | Total number of items. |
| is_last | BOOLEAN | True if this is the last iteration. |
| value0 | ANY | Current value of slot 0 (from initial_value0 or accumulated). |
| value1 | ANY | Current value of slot 1. |
| ... | ... | ... |
| value9 | ANY | Current value of slot 9. |

---

#### Loop End (Advanced) 🪽

Advanced version that accumulates up to 10 separate result streams.

| Input | Type | Description |
|-------|------|-------------|
| flow | FLOW_CONTROL | Connect from Loop Start (Advanced). |
| result0 | ANY | Value to accumulate in slot 0. |
| result1 | ANY | Value to accumulate in slot 1. |
| ... | ... | ... |
| result9 | ANY | Value to accumulate in slot 9. |

| Output | Type | Description |
|--------|------|-------------|
| results0 | ANY | All accumulated values from slot 0. |
| results1 | ANY | All accumulated values from slot 1. |
| ... | ... | ... |
| results9 | ANY | All accumulated values from slot 9. |

---

#### Complete Loop Example (Simple)

**Goal:** Generate 4 images from different prompts and collect them all.

```
┌─────────────────────────────────────────────────────────────────┐
│                         WORKFLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Text Permutation]                                              │
│   template: "a {cat,dog} on a {chair,sofa}"                     │
│   ↓ texts (list of 4 strings)                                   │
│                                                                  │
│  [Loop Start]                                                    │
│   items ← texts                                                  │
│   ↓ item (single string per iteration)                          │
│                                                                  │
│  [CLIP Text Encode]                                              │
│   text ← item                                                    │
│   ↓ conditioning                                                 │
│                                                                  │
│  [KSampler] → [VAE Decode]                                       │
│   ↓ image                                                        │
│                                                                  │
│  [Image Bridge] ← image (preview each iteration)                 │
│   ↓ image                                                        │
│                                                                  │
│  [Loop End]                                                      │
│   flow ← Loop Start                                              │
│   result ← image                                                 │
│   ↓ results (batch of 4 images)                                 │
│                                                                  │
│  [Save Image] ← results                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Execution flow:**
1. Text Permutation generates: ["a cat on a chair", "a cat on a sofa", "a dog on a chair", "a dog on a sofa"]
2. Loop Start receives the list, begins iteration 0
3. KSampler generates image for "a cat on a chair"
4. Image Bridge shows preview
5. Loop End collects image, triggers iteration 1
6. Steps 3-5 repeat for remaining prompts
7. After iteration 3 (last), Loop End outputs batch of 4 images
8. Save Image saves all 4 images

**Key points:**
- Use **Image Bridge** inside the loop to see each image as it generates
- **No Auto Queue needed** - runs all iterations in single execution
- Results are automatically batched

---

#### Complete Loop Example (Advanced)

**Goal:** Generate images and keep track of both the images AND their prompts.

```
┌─────────────────────────────────────────────────────────────────┐
│  [Text Permutation] → texts                                      │
│         ↓                                                        │
│  [Loop Start (Advanced)]                                         │
│   items ← texts                                                  │
│   ↓ item, value0, value1...                                     │
│                                                                  │
│  [Generate Image] ← item                                         │
│   ↓ image                                                        │
│                                                                  │
│  [Loop End (Advanced)]                                           │
│   flow ← Loop Start                                              │
│   result0 ← item (the prompt text)                              │
│   result1 ← image (the generated image)                         │
│   ↓                                                              │
│   results0 = ["prompt1", "prompt2", "prompt3", "prompt4"]       │
│   results1 = batch of 4 images                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Loader Nodes

#### Load All Images from Folder 🪽

Load ALL images from a folder as a single batch tensor.

**How it works:**
1. Scans the specified folder for image files
2. Loads all images and resizes them to match the first image's dimensions
3. Stacks them into a batch tensor (B, H, W, C)

| Input | Type | Description |
|-------|------|-------------|
| folder_path | STRING | Absolute or relative path to folder containing images. Example: `C:/images` or `/home/user/photos` |
| sort_by | ENUM | How to order the images: `name` (alphabetical), `modified_date` (newest first), `created_date` |
| max_images | INT | Maximum number of images to load. Set to `0` for unlimited. Default: 0 |
| start_index | INT | Skip the first N images. Useful for pagination. Default: 0 |
| include_subdirs | BOOLEAN | If true, also scans subfolders recursively. Default: false |

| Output | Type | Description |
|--------|------|-------------|
| images | IMAGE | Batch tensor containing all loaded images. Shape: (N, H, W, 3) |
| filenames | STRING | Newline-separated list of loaded filenames (without path). |
| count | INT | Number of images successfully loaded. |

**Supported formats:** PNG, JPG, JPEG, WEBP, BMP, GIF

**Important notes:**
- All images are resized to match the **first image's dimensions** (maintains batch consistency)
- Large folders with many high-resolution images may use significant memory
- Use `max_images` and `start_index` to process in smaller batches if needed

**Use with Loop:**
```
[Load All Images from Folder] → images (batch of N images)
         ↓
[Loop Start] → item (single image per iteration)
         ↓
[Process Image] → processed
         ↓
[Loop End] → results (batch of N processed images)
```

---

#### Split Image Batch 🪽

Extract a single image from a batch by index. Useful for Auto Queue workflows.

**How it works:**
1. Takes a batch of images
2. Returns the image at the specified index
3. With Auto Queue, the index auto-increments each run

| Input | Type | Description |
|-------|------|-------------|
| images | IMAGE | Batch of images to split. |
| index | INT | Which image to extract (0-based). Has `control_after_generate` for auto-increment. |
| loop | BOOLEAN | If true, wraps around when index exceeds batch size. If false, clamps to last image. Default: true |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Single image at the specified index. Shape: (1, H, W, C) |
| index | INT | The actual index used (after looping/clamping). |
| total_count | INT | Total number of images in the input batch. |

**Use case - Auto Queue workflow:**
1. Load batch of 10 images
2. Split Image Batch with index = 0
3. Process the single image
4. Enable Auto Queue
5. Each queue processes next image (index auto-increments: 0, 1, 2...)

**Difference from Loop nodes:**
- **Split Image Batch + Auto Queue:** Each queue run processes ONE image. Good for heavy processing.
- **Loop nodes:** Single queue run processes ALL images. Good for batch operations.

---

### Text Utility Nodes

#### Text Permutation 🪽

Generate all combinations from a template with inline options. Perfect for batch prompt generation.

**How it works:**
1. Parse template for `{option1,option2,...}` patterns
2. Generate all possible combinations
3. Output as a list of strings

| Input | Type | Description |
|-------|------|-------------|
| template | STRING | Template text with `{option1,option2}` syntax for variable parts. |
| separator | STRING | Character that separates options inside braces. Default: `,` |
| trim_options | BOOLEAN | Remove whitespace around each option. Default: true |

| Output | Type | Description |
|--------|------|-------------|
| texts | STRING[] | List of all generated combinations. |
| count | INT | Number of combinations generated. |

**Example 1 - Basic usage:**
```
Template: "a {cat,dog} sitting on a {red,blue} {chair,sofa}"

Output (12 combinations):
- "a cat sitting on a red chair"
- "a cat sitting on a red sofa"
- "a cat sitting on a blue chair"
- "a cat sitting on a blue sofa"
- "a dog sitting on a red chair"
- "a dog sitting on a red sofa"
- "a dog sitting on a blue chair"
- "a dog sitting on a blue sofa"
... (and 4 more)
```

**Example 2 - Quality tags:**
```
Template: "{masterpiece, best quality,}{,extremely detailed} {1girl,1boy}"

Output:
- "masterpiece, best quality, 1girl"
- "masterpiece, best quality, extremely detailed 1girl"
- "masterpiece, best quality, 1boy"
- "masterpiece, best quality, extremely detailed 1boy"
- " 1girl" (empty first option)
- " extremely detailed 1girl"
... etc
```

**Example 3 - Custom separator:**
```
Template: "photo of {beach|mountain|forest}"
Separator: "|"

Output:
- "photo of beach"
- "photo of mountain"
- "photo of forest"
```

**Use with Loop:**
```
[Text Permutation] → texts
         ↓
[Loop Start] items ← texts
         ↓ item (one prompt per iteration)
[KSampler]
```

---

#### Text Combine 🪽

Combine multiple text strings into one with a separator.

| Input | Type | Description |
|-------|------|-------------|
| text1 | STRING | First text (required). |
| text2 | STRING | Second text (optional). |
| text3 | STRING | Third text (optional). |
| text4 | STRING | Fourth text (optional). |
| separator | STRING | String to insert between texts. Default: `\n` (newline) |

| Output | Type | Description |
|--------|------|-------------|
| combined | STRING | All non-empty texts joined with separator. |

**Example:**
```
text1: "masterpiece, best quality"
text2: "1girl, blonde hair"
text3: "" (empty)
text4: "detailed background"
separator: ", "

Output: "masterpiece, best quality, 1girl, blonde hair, detailed background"
```

**Note:** Empty inputs are skipped (no double separators).

---

### Overlay Nodes

#### Load Image + Metadata 🪽

Load an image file and extract any embedded generation metadata.

**How it works:**
1. Loads the image file
2. Reads PNG metadata chunks or EXIF data
3. Parses A1111 or ComfyUI format parameters
4. Returns both the image and extracted metadata

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE_UPLOAD | Select image file from ComfyUI input folder. |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | The loaded image as tensor. |
| mask | MASK | Alpha channel as mask (white = opaque). If no alpha, returns white mask. |
| metadata_raw | STRING | Raw metadata string exactly as stored in file. |
| metadata_formatted | STRING | Human-readable formatted version of parameters. |

**Supported metadata formats:**
- **A1111/Civitai:** `parameters` PNG chunk with format `prompt\nNegative: ...\nSteps: 30, CFG: 7...`
- **ComfyUI:** `prompt` PNG chunk containing JSON workflow

**Use case:** Load images from Civitai or other sources to see their generation parameters.

---

#### Parameter Parser 🪽

Parse a metadata string and extract individual generation parameters.

| Input | Type | Description |
|-------|------|-------------|
| metadata | STRING | Raw metadata string (from Load Image + Metadata or pasted manually). |
| show_prompt | BOOLEAN | Include prompt in formatted output. Default: true |
| max_prompt_length | INT | Truncate prompt to this length in formatted output. Default: 100 |

| Output | Type | Description |
|--------|------|-------------|
| formatted | STRING | Human-readable summary of all parameters. |
| model | STRING | Checkpoint/model name. |
| sampler | STRING | Sampler name (e.g., "euler", "dpmpp_2m"). |
| seed | INT | Generation seed. Returns 0 if not found. |
| steps | INT | Number of sampling steps. Returns 0 if not found. |
| cfg | FLOAT | CFG scale value. Returns 0.0 if not found. |
| positive_prompt | STRING | Positive prompt text. |
| negative_prompt | STRING | Negative prompt text. |

---

#### Parameter Overlay 🪽

Add generation parameters as a visual overlay on an image.

**How it works:**
1. Reads metadata from provided source (image path or text)
2. Formats parameters into readable text
3. Renders text overlay on the image

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to add overlay to. |
| image_path | STRING | Optional. Path to image file to read metadata from. |
| metadata_text | STRING | Optional. Raw metadata text to display. |
| position | ENUM | Where to place overlay: `bottom_extend` (adds bar below), `bottom_inside` (overlays bottom), `top_inside` (overlays top) |
| font_size | INT | Text size in pixels. Range: 8-100. Default: 25 |
| bg_opacity | FLOAT | Background transparency. 0.0 = transparent, 1.0 = solid. Default: 0.7 |
| show_prompt | BOOLEAN | Include prompt text in overlay. Default: false |
| max_prompt_length | INT | Truncate prompt to this length. 0 = no limit. Default: 200 |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Image with parameter overlay added. |

**Position options:**
- `bottom_extend`: Adds a bar below the image (increases image height)
- `bottom_inside`: Overlays text on bottom of image (no size change)
- `top_inside`: Overlays text on top of image (no size change)

**Example output:**
```
┌─────────────────────────────────────────────┐
│                                             │
│              [Your Image]                   │
│                                             │
├─────────────────────────────────────────────┤
│ SDXL Base | Sampler: euler | Steps: 30      │
│ Seed: 12345 | CFG: 7.0                       │
└─────────────────────────────────────────────┘
```

---

#### Custom Text Overlay 🪽

Add custom text overlay with full styling control.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to add overlay to. |
| text | STRING | Text to display. Supports multiple lines with `\n`. |
| position | ENUM | `bottom_extend`, `bottom_inside`, `top_inside` |
| font_size | INT | Text size 8-100. Default: 25 |
| bg_opacity | FLOAT | Background opacity 0.0-1.0. Default: 0.7 |
| text_color | STRING | Text color in hex format. Default: `#FFFFFF` (white) |
| bg_color | STRING | Background color in hex format. Default: `#000000` (black) |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Image with text overlay. |

**Features:**
- Auto word-wrap for long text
- Supports Thai, Japanese, Chinese and other Unicode characters
- Uses system fonts with fallback

---

### Utility Nodes

#### Image Bridge 🪽

Pass-through node that can preview or save images without breaking the workflow chain.

**How it works:**
1. Receives an image
2. Optionally shows preview in UI or saves to disk
3. Passes the same image to output (unchanged)

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to preview/save. Can be single image or batch. |
| mode | ENUM | `preview` = show in ComfyUI, `save` = save to output folder |
| filename_prefix | STRING | Prefix for saved files. Default: "ComfyAngel" |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Same image passed through (no modifications). |

**Essential for loops:** Place Image Bridge inside your loop to see each iteration's result:
```
[Loop Start] → [KSampler] → [Image Bridge] → [Loop End]
                                  ↓
                         (shows preview each iteration)
```

---

#### Workflow Metadata 🪽

Output the current workflow structure as JSON strings.

| Input | Type | Description |
|-------|------|-------------|
| (none) | - | Uses ComfyUI's hidden prompt/workflow inputs. |

| Output | Type | Description |
|--------|------|-------------|
| prompt_json | STRING | Current prompt (nodes and their inputs) as JSON. |
| workflow_json | STRING | Full workflow (including UI positions) as JSON. |

**Use cases:**
- Debug complex workflows
- Embed workflow info in images
- Log workflow configurations
- Analyze node connections programmatically

---

#### Image Info 🪽

Get dimensions and batch information from an image tensor.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image tensor to analyze. |

| Output | Type | Description |
|--------|------|-------------|
| width | INT | Image width in pixels. |
| height | INT | Image height in pixels. |
| channels | INT | Number of color channels (typically 3 for RGB). |
| batch_size | INT | Number of images in the batch (first dimension of tensor). |

---

### Composite Nodes

#### Smart Composite XY 🪽

Composite (layer) an overlay image onto a canvas at specific X,Y coordinates.

| Input | Type | Description |
|-------|------|-------------|
| canvas | IMAGE | Background image. |
| overlay | IMAGE | Image to place on top. Can have transparency. |
| x | INT | Horizontal position. Range: -8192 to 8192 |
| y | INT | Vertical position. Range: -8192 to 8192 |
| anchor | ENUM | Which point of overlay aligns to X,Y: `top_left`, `top_center`, `top_right`, `center_left`, `center`, `center_right`, `bottom_left`, `bottom_center`, `bottom_right` |
| scale | FLOAT | Resize overlay. 100 = original size, 50 = half, 200 = double. Range: 1-500% |
| blend_mode | ENUM | How to blend: `normal`, `multiply`, `screen`, `overlay`, `soft_light`, `hard_light`, `difference`, `add`, `subtract` |
| opacity | FLOAT | Overlay transparency. 0 = invisible, 100 = fully visible. |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Composited result. |

**Anchor examples:**
- `anchor: top_left, x: 10, y: 10` → Overlay's top-left corner at (10, 10)
- `anchor: center, x: 256, y: 256` → Overlay centered at (256, 256)
- `anchor: bottom_right, x: 500, y: 500` → Overlay's bottom-right corner at (500, 500)

---

#### Smart Composite Align 🪽

Composite an overlay image using alignment presets instead of coordinates.

| Input | Type | Description |
|-------|------|-------------|
| canvas | IMAGE | Background image. |
| overlay | IMAGE | Image to place on top. |
| alignment | ENUM | Position preset: `top_left`, `top_center`, `top_right`, `center_left`, `center`, `center_right`, `bottom_left`, `bottom_center`, `bottom_right` |
| margin_x | INT | Horizontal offset from alignment position. Positive = right, negative = left. |
| margin_y | INT | Vertical offset from alignment position. Positive = down, negative = up. |
| scale | FLOAT | Resize overlay 1-500%. |
| blend_mode | ENUM | Blend mode (same options as Smart Composite XY). |
| opacity | FLOAT | Overlay opacity 0-100%. |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Composited result. |

**Example - Watermark in bottom-right:**
```
alignment: bottom_right
margin_x: -20  (20px from right edge)
margin_y: -20  (20px from bottom edge)
```

---

### Widget Nodes

#### Resolution Picker 🪽

Quickly select from common image resolutions organized by aspect ratio.

| Input | Type | Description |
|-------|------|-------------|
| aspect_ratio | ENUM | Aspect ratio category: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, `3:2`, `2:3` |
| resolution | ENUM | Specific resolution within the selected ratio. Options change based on aspect_ratio. |

| Output | Type | Description |
|--------|------|-------------|
| width | INT | Selected width in pixels. |
| height | INT | Selected height in pixels. |
| aspect_ratio | STRING | The aspect ratio string (e.g., "16:9"). |

**Included presets by model:**
- **SD 1.5:** 512x512, 512x768, 768x512, etc.
- **SDXL:** 1024x1024, 896x1152, 1152x896, etc.
- **SD3/Flux:** 1024x1024, 1536x1024, etc.
- **DALL-E 3:** 1024x1024, 1792x1024, 1024x1792
- **Midjourney:** Various AR options
- **Standard:** 1920x1080 (FHD), 3840x2160 (4K), etc.

---

#### Solid Color 🪽

Generate a solid color image.

| Input | Type | Description |
|-------|------|-------------|
| color | STRING | Color in hex format (e.g., `#FF0000` for red). Default: `#FFFFFF` |
| width | INT | Image width. Default: 512 |
| height | INT | Image height. Default: 512 |
| batch_size | INT | Number of identical images to generate. Default: 1 |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Solid color image tensor. |

**Use cases:**
- Create colored backgrounds
- Generate masks
- Test color combinations
- Create placeholder images

---

#### Color Picker 🪽

Interactive color picker with eyedropper functionality.

| Input | Type | Description |
|-------|------|-------------|
| color_hex | STRING | Color in hex format. Click the widget to open color picker UI. |
| image | IMAGE | Optional. Connect an image to enable eyedropper (pick color from image). |

| Output | Type | Description |
|--------|------|-------------|
| color | STRING | Normalized hex color (always uppercase with #). |

**Widget features:**
- Visual color picker popup
- HEX input (e.g., `#FF5500`)
- RGB input (e.g., `rgb(255, 85, 0)`)
- HSL input (e.g., `hsl(20, 100%, 50%)`)
- Color presets palette
- Eyedropper tool (when image connected)

---

#### Smart Crop 🪽

Crop an image with visual crop area selector.

| Input | Type | Description |
|-------|------|-------------|
| image | IMAGE | Image to crop. |
| x | INT | Left edge of crop area (0 = left edge of image). |
| y | INT | Top edge of crop area (0 = top edge of image). |
| crop_width | INT | Width of crop area. Default: 512 |
| crop_height | INT | Height of crop area. Default: 512 |

| Output | Type | Description |
|--------|------|-------------|
| image | IMAGE | Cropped image. |

**Visual editor:** Click the node's button to open a visual editor where you can drag to select the crop area. The x, y, width, height values update automatically.

---

## Supported Metadata Formats

| Format | Source | Example |
|--------|--------|---------|
| A1111 | Automatic1111, Civitai, many others | `prompt\nNegative: neg\nSteps: 30, Sampler: Euler, CFG: 7, Seed: 12345, Model: sdxl` |
| ComfyUI | ComfyUI native workflow embedding | JSON in PNG `prompt` chunk |

---

## Tips & Best Practices

### Loop Performance
- **Image Bridge is essential** - Without it, you won't see intermediate results
- **Memory usage** - Each iteration accumulates results in memory. For very large batches, consider using Split Image Batch with Auto Queue instead
- **Preview vs Save** - Use `preview` mode in Image Bridge during testing, `save` mode for production runs

### Metadata Workflow
```
[Load Image + Metadata] → metadata_raw
         ↓
[Parameter Parser] → formatted, model, seed, etc.
         ↓
[Parameter Overlay] ← original image + formatted text
         ↓
[Save Image] (image now has visible parameters)
```

### Resolution Consistency
When using Load All Images from Folder with Loop, all images are resized to match the first image. For best results:
- Ensure source images have similar aspect ratios
- Or pre-process images to consistent sizes before loading

---

## Links

- **GitHub:** https://github.com/ThepExcel/ComfyAngel
- **Registry:** https://registry.comfy.org/thepexcel/comfyangel

---

## License

MIT
