/**
 * Resolution Picker Widget for ComfyAngel
 *
 * Dynamic resolution dropdown based on selected aspect ratio.
 */

import { app } from "../../scripts/app.js";

// Resolution data (must match Python)
// Includes optimized sizes for: SD 1.5, SDXL, SD3/SD3.5, Flux, DALL-E 3,
// Qwen-Image, Midjourney, Ideogram, Hunyuan, Kolors, Z-Image Turbo
const RESOLUTIONS = {
    "1:1 (Square)": {
        "512x512 (SD1.5)": [512, 512],
        "768x768 (SD1.5 HiRes)": [768, 768],
        "1024x1024 (SDXL/SD3/Flux)": [1024, 1024],
        "1080x1080 (Instagram)": [1080, 1080],
        "1280x1280 (Hunyuan)": [1280, 1280],
        "1328x1328 (Qwen-Image)": [1328, 1328],
        "1440x1440 (2K)": [1440, 1440],
        "2048x2048 (Flux Ultra/Hunyuan)": [2048, 2048],
        "4096x4096 (4K)": [4096, 4096],
    },
    "4:3 (Standard)": {
        "640x480 (VGA/480p)": [640, 480],
        "800x600 (SVGA)": [800, 600],
        "1024x768 (XGA)": [1024, 768],
        "1152x896 (SDXL ~9:7)": [1152, 896],
        "1280x960 (SXGA+)": [1280, 960],
        "1472x1104 (Qwen-Image)": [1472, 1104],
        "1600x1200 (UXGA)": [1600, 1200],
        "2048x1536 (2K)": [2048, 1536],
        "2880x2160 (3K)": [2880, 2160],
        "4096x3072 (4K)": [4096, 3072],
    },
    "3:2 (Photo)": {
        "768x512 (SD1.5)": [768, 512],
        "720x480": [720, 480],
        "1080x720": [1080, 720],
        "1216x832 (SDXL)": [1216, 832],
        "1440x960": [1440, 960],
        "1584x1056 (Qwen-Image)": [1584, 1056],
        "1620x1080": [1620, 1080],
        "2160x1440 (2K)": [2160, 1440],
        "3000x2000 (3K)": [3000, 2000],
        "4320x2880 (4K)": [4320, 2880],
        "6000x4000 (6K)": [6000, 4000],
    },
    "16:9 (Widescreen)": {
        "640x360 (360p)": [640, 360],
        "854x480 (480p)": [854, 480],
        "1280x720 (720p HD)": [1280, 720],
        "1344x768 (SDXL)": [1344, 768],
        "1664x928 (Qwen-Image)": [1664, 928],
        "1792x1024 (DALL-E 3)": [1792, 1024],
        "1920x1080 (1080p FHD)": [1920, 1080],
        "2560x1440 (1440p 2K QHD)": [2560, 1440],
        "2560x1536 (Hunyuan 2.1)": [2560, 1536],
        "3840x2160 (2160p 4K UHD)": [3840, 2160],
        "5120x2880 (5K)": [5120, 2880],
        "7680x4320 (8K)": [7680, 4320],
    },
    "21:9 (Ultrawide)": {
        "1536x640 (SDXL)": [1536, 640],
        "1280x548 (Cinema)": [1280, 548],
        "1720x720 (Cinema HD)": [1720, 720],
        "2560x1080 (UWFHD)": [2560, 1080],
        "3440x1440 (UWQHD)": [3440, 1440],
        "3840x1600 (Wide 4K)": [3840, 1600],
        "5120x2160 (5K UW)": [5120, 2160],
    },
    "9:16 (Portrait Mobile)": {
        "360x640": [360, 640],
        "480x854 (480p)": [480, 854],
        "720x1280 (720p HD)": [720, 1280],
        "768x1344 (SDXL)": [768, 1344],
        "928x1664 (Qwen-Image)": [928, 1664],
        "1024x1792 (DALL-E 3)": [1024, 1792],
        "1080x1920 (1080p FHD)": [1080, 1920],
        "1440x2560 (1440p 2K)": [1440, 2560],
        "2160x3840 (4K)": [2160, 3840],
    },
    "3:4 (Portrait Standard)": {
        "480x640 (VGA)": [480, 640],
        "600x800 (SVGA)": [600, 800],
        "768x1024 (XGA)": [768, 1024],
        "896x1152 (SDXL ~7:9)": [896, 1152],
        "960x1280 (SXGA)": [960, 1280],
        "1104x1472 (Qwen-Image)": [1104, 1472],
        "1200x1600 (UXGA)": [1200, 1600],
        "1536x2048 (2K)": [1536, 2048],
        "3072x4096 (4K)": [3072, 4096],
    },
    "2:3 (Portrait Photo)": {
        "512x768 (SD1.5)": [512, 768],
        "480x720": [480, 720],
        "720x1080": [720, 1080],
        "832x1216 (SDXL)": [832, 1216],
        "960x1440": [960, 1440],
        "1056x1584 (Qwen-Image)": [1056, 1584],
        "1080x1620 (FHD)": [1080, 1620],
        "1440x2160 (2K)": [1440, 2160],
        "2000x3000 (3K)": [2000, 3000],
        "2880x4320 (4K)": [2880, 4320],
    },
};

app.registerExtension({
    name: "ComfyAngel.ResolutionWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_ResolutionPicker") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            const aspectWidget = this.widgets.find(w => w.name === "aspect_ratio");
            const resolutionWidget = this.widgets.find(w => w.name === "resolution");

            if (aspectWidget && resolutionWidget) {
                // Store original callback
                const originalCallback = aspectWidget.callback;

                // Update resolution options when aspect ratio changes
                const updateResolutions = () => {
                    const aspect = aspectWidget.value;
                    const resolutions = RESOLUTIONS[aspect];

                    if (resolutions) {
                        const options = Object.keys(resolutions);
                        resolutionWidget.options.values = options;

                        // If current value not in new options, select first one
                        if (!options.includes(resolutionWidget.value)) {
                            resolutionWidget.value = options[0];
                        }
                    }
                };

                aspectWidget.callback = function () {
                    updateResolutions();
                    if (originalCallback) {
                        originalCallback.apply(this, arguments);
                    }
                    app.graph.setDirtyCanvas(true);
                };

                // Initialize with current aspect ratio
                updateResolutions();
            }

            return result;
        };
    },
});
