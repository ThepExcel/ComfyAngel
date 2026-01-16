# AI Image Generation Model Resolutions Research

**Date:** 2025-01-16
**Purpose:** Compile optimal resolutions for all major AI image generation models

---

## Summary Table by Model

| Model | Native Resolution | Supported Range | Megapixels | Notes |
|-------|-------------------|-----------------|------------|-------|
| **SD 1.5** | 512x512 | 512-768 | ~0.26-0.59MP | Fine-tuned versions support 768x768 |
| **SDXL** | 1024x1024 | Multiple ratios ~1MP | 1MP | Best with specific aspect ratios |
| **SD3/SD3.5** | 1024x1024 | 256-1440 | ~1MP | Multiple of 64 recommended |
| **Flux 1.0** | 1024x1024 | 0.1-2.0MP | 1MP | 32px increments |
| **Flux 1.1 Pro Ultra** | 2048x2048 | Up to 4MP | 4MP | Raw mode available |
| **DALL-E 3** | 1024x1024 | 3 sizes only | 1-1.8MP | Limited options |
| **Midjourney v7** | 2048x2048 | 1:2 to 2:1 | ~4MP | Upscaled output |
| **Qwen-Image** | 1328x1328 | 512-3584 | 1.6MP base | Up to 12MP native |
| **Ideogram 3.0** | ~1024x1024 | 512-1536 | ~1MP | 7 aspect ratios |
| **Hunyuan-DiT** | 1024x1024 | Various | 1MP | Multiple ratios |
| **Hunyuan 2.1** | 2048x2048 | 2K only | ~4MP | High-res native |
| **Kolors** | 1024x1024 | Similar to SDXL | 1MP | Same ratios as SDXL |
| **Z-Image Turbo** | 1024x1024 | Up to 4MP | 1-4MP | 8 steps inference |
| **Playground v2.5/v3** | 1024x1024 | Flexible ratios | ~1MP | LLM-integrated |
| **WAN 2.6** | Up to 2048x2048 | Various | ~4MP | Primarily video |

---

## Detailed Findings by Model

### Stable Diffusion 1.5

**Native Training:** 512x512
**Optimal Resolutions:**
- 1:1: 512x512 (native), 768x768 (fine-tuned)
- 3:2: 768x512
- 2:3: 512x768

**Constraints:**
- Never go below 512px on shortest edge
- Going above 768px causes artifacts and distortions
- Dimensions should be divisible by 8

---

### SDXL (Stable Diffusion XL)

**Native Training:** 1024x1024 (~1 megapixel)
**Optimized Aspect Ratios:**

| Aspect Ratio | Resolution |
|--------------|------------|
| 1:1 | 1024x1024 |
| 9:7 (~4:3) | 1152x896 |
| 7:9 (~3:4) | 896x1152 |
| 3:2 | 1216x832 |
| 2:3 | 832x1216 |
| 16:9 | 1344x768 |
| 9:16 | 768x1344 |
| 21:9 | 1536x640 |
| 9:21 | 640x1536 |

**Constraints:**
- Keep total pixels around 1 megapixel
- Dimensions divisible by 64 preferred

---

### SD3 / SD3.5

**Native Training:** 1024x1024
**Supported Range:** 256x256 to 1440x1440
**Optimal:** Around 1 megapixel, height as multiple of 64

**Recommended Settings:**
- CFG: 4.5
- Steps: 28
- K sampler

**Notes:**
- 16-channel VAE for more detail
- SD3.5 Medium (2.6B params) runs on consumer GPUs

---

### Flux Family

**Flux 1.0 (Dev/Pro/Schnell):**
- Native: 1024x1024
- Range: 0.1MP to 2.0MP
- Increments: 32px

**Flux 1.1 Pro Ultra:**
- Maximum: 2048x2048 (4MP)
- Ultra Mode: 4x standard resolution
- Raw Mode: Natural photography look at 4MP
- Speed: ~10 seconds per 4MP image
- Price: $0.06/image

---

### DALL-E 3

**Fixed Resolutions Only:**
| Aspect | Resolution |
|--------|------------|
| 1:1 | 1024x1024 |
| 16:9 (landscape) | 1792x1024 |
| 9:16 (portrait) | 1024x1792 |

**No other resolutions supported**

---

### Midjourney v7

**Output:** 2048x2048 upscaled
**Aspect Ratios:** 1:2 to 2:1 supported
**Flexible with custom ratios via --ar parameter**

---

### Qwen-Image (Alibaba)

**Native Training Resolution (1.6MP base):**
| Aspect | Resolution |
|--------|------------|
| 1:1 | 1328x1328 |
| 16:9 | 1664x928 |
| 9:16 | 928x1664 |
| 4:3 | 1472x1104 |
| 3:4 | 1104x1472 |
| 3:2 | 1584x1056 |
| 2:3 | 1056x1584 |

**Maximum Native:** 3584x3584 (12+ megapixels!)
**Practical Range:** 768x768 to 2048x2048

**Latest Version:** Qwen-Image-2512 (Dec 2025)

---

### Ideogram 3.0

**Native:** ~1K resolution
**Supported Ratios:** 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3
**Range:** 512x1536 to 1536x512

---

### Hunyuan Family (Tencent)

**Hunyuan-DiT:**
- 1024x1024, 1280x1280
- Various aspect ratios

**Hunyuan 2.1:**
- 2K only (2048x2048)
- 16:9: 2560x1536

**Hunyuan 3.0:**
- Range: 512x512 to 2048x2048
- Auto resolution mode

---

### Kolors (Kuaishou)

**Similar to SDXL:**
- 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16
- Native ~1024x1024

---

### Z-Image Turbo (Alibaba Tongyi)

**Native:** 1024x1024
**Maximum:** 4MP
**Optimal:** 1024x1024 with 8-9 inference steps
**Parameters:** 6B
**Architecture:** S3-DiT (Scalable Single-Stream DiT)

**Ranking:** #8 overall on Artificial Analysis leaderboard, #1 open-source

---

### Playground v2.5 / v3

**Base:** 1024x1024
**Aspect Ratios:** Multiple supported via --aspect parameter
**v3 Features:** LLM-integrated (Llama3-8B), longer prompt support

---

### WAN 2.6 (Video/Image)

**Image:** Up to 2048x2048
**Video:** 480P to 720P (1080P with Wan-VAE)
**Primary Focus:** Video generation

---

## Recommendations by Use Case

### For General Use
| Priority | Resolution | Models |
|----------|------------|--------|
| 1st | 1024x1024 | SDXL, SD3, Flux, Qwen, Z-Image |
| 2nd | 512x512 | SD 1.5, Legacy |
| 3rd | 2048x2048 | Flux Ultra, Hunyuan 2.1 |

### For SDXL/SD3 Workflows
Use the optimized aspect ratio resolutions for best quality:
- 1344x768 (16:9)
- 768x1344 (9:16)
- 1216x832 (3:2)
- 832x1216 (2:3)
- 1152x896 (~4:3)
- 896x1152 (~3:4)

### For Qwen-Image Workflows
Use native 1.6MP resolutions for best quality:
- 1328x1328 (1:1)
- 1664x928 (16:9)
- 928x1664 (9:16)

### For Maximum Quality
- Flux 1.1 Pro Ultra: 4MP output
- Qwen-Image: Up to 12MP native
- Midjourney v7: 2048x2048 upscaled

---

## Sources

- [Qwen-Image GitHub](https://github.com/QwenLM/Qwen-Image)
- [Hugging Face - Qwen-Image](https://huggingface.co/Qwen/Qwen-Image)
- [Black Forest Labs - Flux 1.1 Ultra](https://blackforestlabs.ai/flux-1-1-ultra/)
- [Stability AI - SD3.5 Medium](https://huggingface.co/stabilityai/stable-diffusion-3.5-medium)
- [SD 1.5 Model Card](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5)
- [SDXL Resolutions Guide](https://wiki.shakker.ai/en/sdxl-resolutions)
- [Z-Image Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)
- [Playground v3 Technical Report](https://playground.com/pg-v3)
- [WAN 2.6 Guide](https://wavespeed.ai/blog/posts/wan-2-6-complete-guide-2026/)
