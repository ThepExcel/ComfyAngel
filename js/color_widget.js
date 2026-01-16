/**
 * Color Picker Widget for ComfyAngel
 *
 * Supports RGB, HSL, Hex formats and eyedropper from image.
 */

import { app } from "../../scripts/app.js";

// Helper functions
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return {
        r: parseInt(hex.substr(0, 2), 16) || 0,
        g: parseInt(hex.substr(2, 2), 16) || 0,
        b: parseInt(hex.substr(4, 2), 16) || 0
    };
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = clamp(x, 0, 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

// Color picker dialog with optional image eyedropper
function showColorPickerDialog(colorWidget, onApply, imageUrl = null) {
    const currentColor = colorWidget?.value || "#FFFFFF";
    const rgb = hexToRgb(currentColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    const dialog = document.createElement("div");
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 8px;
        padding: 20px;
        z-index: 10000;
        max-width: 90vw;
        max-height: 90vh;
        overflow: auto;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        font-family: sans-serif;
        color: #fff;
    `;

    const hasImage = !!imageUrl;

    dialog.innerHTML = `
        <h3 style="margin: 0 0 15px 0;">Color Picker</h3>

        <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
            <!-- Left side: Color preview, native picker, and inputs -->
            <div style="flex: 0 0 auto; min-width: 280px;">
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <!-- Color preview and native picker -->
                    <div style="flex-shrink: 0;">
                        <div id="color-preview" style="
                            width: 100px;
                            height: 100px;
                            background: ${currentColor};
                            border: 2px solid #555;
                            border-radius: 8px;
                            margin-bottom: 10px;
                        "></div>
                        <input type="color" id="native-picker" value="${currentColor}" style="
                            width: 100px;
                            height: 30px;
                            border: none;
                            cursor: pointer;
                            background: transparent;
                        ">
                    </div>

                    <!-- Color inputs -->
                    <div style="flex: 1; min-width: 150px;">
                        <!-- HEX -->
                        <div style="margin-bottom: 10px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 3px;">HEX</label>
                            <input type="text" id="hex-input" value="${currentColor}"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 6px; border-radius: 4px; font-family: monospace; box-sizing: border-box; font-size: 13px;">
                        </div>

                        <!-- RGB -->
                        <div style="margin-bottom: 10px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 3px;">RGB</label>
                            <div style="display: flex; gap: 5px;">
                                <input type="number" id="rgb-r" value="${rgb.r}" min="0" max="255"
                                    style="width: 100%; background: #333; border: 1px solid #555; color: #f88; padding: 6px; border-radius: 4px; box-sizing: border-box;">
                                <input type="number" id="rgb-g" value="${rgb.g}" min="0" max="255"
                                    style="width: 100%; background: #333; border: 1px solid #555; color: #8f8; padding: 6px; border-radius: 4px; box-sizing: border-box;">
                                <input type="number" id="rgb-b" value="${rgb.b}" min="0" max="255"
                                    style="width: 100%; background: #333; border: 1px solid #555; color: #88f; padding: 6px; border-radius: 4px; box-sizing: border-box;">
                            </div>
                        </div>

                        <!-- HSL -->
                        <div>
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 3px;">HSL</label>
                            <div style="display: flex; gap: 5px;">
                                <input type="number" id="hsl-h" value="${Math.round(hsl.h)}" min="0" max="360"
                                    style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 6px; border-radius: 4px; box-sizing: border-box;">
                                <input type="number" id="hsl-s" value="${Math.round(hsl.s)}" min="0" max="100"
                                    style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 6px; border-radius: 4px; box-sizing: border-box;">
                                <input type="number" id="hsl-l" value="${Math.round(hsl.l)}" min="0" max="100"
                                    style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 6px; border-radius: 4px; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Preset colors -->
                <div>
                    <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 6px;">Presets</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        ${['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
                           '#FF8800', '#88FF00', '#0088FF', '#FF0088', '#808080', '#C0C0C0'].map(c => `
                            <div class="preset-color" data-color="${c}" style="
                                width: 20px; height: 20px;
                                background: ${c};
                                border: 1px solid #444;
                                border-radius: 3px;
                                cursor: pointer;
                            " title="${c}"></div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Right side: Image eyedropper (if image available) -->
            ${hasImage ? `
            <div style="flex: 1; min-width: 300px;">
                <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 6px;">
                    Pick from Image (click to select color)
                </label>
                <div id="eyedropper-container" style="
                    position: relative;
                    background: #222;
                    border: 1px solid #555;
                    border-radius: 4px;
                    overflow: hidden;
                    cursor: crosshair;
                ">
                    <canvas id="eyedropper-canvas" style="display: block; max-width: 100%;"></canvas>
                    <div id="eyedropper-cursor" style="
                        position: absolute;
                        width: 20px;
                        height: 20px;
                        border: 2px solid white;
                        border-radius: 50%;
                        box-shadow: 0 0 0 1px black, inset 0 0 0 1px black;
                        pointer-events: none;
                        display: none;
                        transform: translate(-50%, -50%);
                    "></div>
                    <div id="eyedropper-zoom" style="
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        width: 80px;
                        height: 80px;
                        border: 2px solid #fff;
                        border-radius: 50%;
                        overflow: hidden;
                        display: none;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
                    ">
                        <canvas id="zoom-canvas" width="80" height="80"></canvas>
                        <div style="
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            width: 10px;
                            height: 10px;
                            border: 1px solid #fff;
                            transform: translate(-50%, -50%);
                            box-shadow: 0 0 0 1px #000;
                        "></div>
                    </div>
                </div>
            </div>
            ` : `
            <div style="flex: 1; min-width: 200px; display: flex; align-items: center; justify-content: center;">
                <div style="text-align: center; color: #666; padding: 40px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">🎨</div>
                    <div>Connect an image to use<br>the eyedropper tool</div>
                </div>
            </div>
            `}
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="color-cancel" style="padding: 8px 16px; background: #444; border: none; border-radius: 4px; color: #fff; cursor: pointer;">Cancel</button>
            <button id="color-apply" style="padding: 8px 16px; background: #0af; border: none; border-radius: 4px; color: #000; cursor: pointer; font-weight: bold;">Apply</button>
        </div>
    `;

    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 9999;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // Elements
    const preview = dialog.querySelector("#color-preview");
    const nativePicker = dialog.querySelector("#native-picker");
    const hexInput = dialog.querySelector("#hex-input");
    const rgbR = dialog.querySelector("#rgb-r");
    const rgbG = dialog.querySelector("#rgb-g");
    const rgbB = dialog.querySelector("#rgb-b");
    const hslH = dialog.querySelector("#hsl-h");
    const hslS = dialog.querySelector("#hsl-s");
    const hslL = dialog.querySelector("#hsl-l");

    let currentHex = currentColor;

    const updateFromHex = (hex, skipInput = null) => {
        hex = hex.toUpperCase();
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (hex.length === 4) {
            hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        if (!/^#[0-9A-F]{6}$/.test(hex)) return;

        currentHex = hex;
        preview.style.background = hex;
        nativePicker.value = hex;

        const rgb = hexToRgb(hex);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

        if (skipInput !== 'hex') hexInput.value = hex;
        if (skipInput !== 'rgb') {
            rgbR.value = rgb.r;
            rgbG.value = rgb.g;
            rgbB.value = rgb.b;
        }
        if (skipInput !== 'hsl') {
            hslH.value = Math.round(hsl.h);
            hslS.value = Math.round(hsl.s);
            hslL.value = Math.round(hsl.l);
        }
    };

    const updateFromRgb = () => {
        const r = clamp(parseInt(rgbR.value) || 0, 0, 255);
        const g = clamp(parseInt(rgbG.value) || 0, 0, 255);
        const b = clamp(parseInt(rgbB.value) || 0, 0, 255);
        updateFromHex(rgbToHex(r, g, b), 'rgb');
    };

    const updateFromHsl = () => {
        const h = clamp(parseInt(hslH.value) || 0, 0, 360);
        const s = clamp(parseInt(hslS.value) || 0, 0, 100);
        const l = clamp(parseInt(hslL.value) || 0, 0, 100);
        const rgb = hslToRgb(h, s, l);
        updateFromHex(rgbToHex(rgb.r, rgb.g, rgb.b), 'hsl');
    };

    // Event listeners
    nativePicker.addEventListener("input", (e) => updateFromHex(e.target.value));
    hexInput.addEventListener("input", (e) => updateFromHex(e.target.value, 'hex'));
    [rgbR, rgbG, rgbB].forEach(input => input.addEventListener("input", updateFromRgb));
    [hslH, hslS, hslL].forEach(input => input.addEventListener("input", updateFromHsl));

    // Preset colors
    dialog.querySelectorAll(".preset-color").forEach(el => {
        el.addEventListener("click", () => updateFromHex(el.dataset.color));
    });

    // Setup eyedropper if image available
    if (hasImage) {
        const canvas = dialog.querySelector("#eyedropper-canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const cursor = dialog.querySelector("#eyedropper-cursor");
        const zoomContainer = dialog.querySelector("#eyedropper-zoom");
        const zoomCanvas = dialog.querySelector("#zoom-canvas");
        const zoomCtx = zoomCanvas.getContext("2d");

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            // Scale image to fit in container (max 400px)
            const maxSize = 400;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const scale = Math.min(maxSize / w, maxSize / h, 1);
            w = Math.round(w * scale);
            h = Math.round(h * scale);

            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
        };
        img.src = imageUrl;

        const container = dialog.querySelector("#eyedropper-container");

        const getColorAt = (x, y) => {
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            return { r: pixel[0], g: pixel[1], b: pixel[2] };
        };

        const updateZoom = (x, y) => {
            const zoomLevel = 8;
            const size = 80;
            const srcSize = size / zoomLevel;

            zoomCtx.imageSmoothingEnabled = false;
            zoomCtx.clearRect(0, 0, size, size);
            zoomCtx.drawImage(
                canvas,
                x - srcSize / 2, y - srcSize / 2, srcSize, srcSize,
                0, 0, size, size
            );
        };

        container.addEventListener("mousemove", (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = Math.round(e.clientX - rect.left);
            const y = Math.round(e.clientY - rect.top);

            if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
                cursor.style.display = "block";
                cursor.style.left = `${x}px`;
                cursor.style.top = `${y}px`;

                const color = getColorAt(x, y);
                cursor.style.backgroundColor = rgbToHex(color.r, color.g, color.b);

                zoomContainer.style.display = "block";
                updateZoom(x, y);
            }
        });

        container.addEventListener("mouseleave", () => {
            cursor.style.display = "none";
            zoomContainer.style.display = "none";
        });

        container.addEventListener("click", (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = Math.round(e.clientX - rect.left);
            const y = Math.round(e.clientY - rect.top);

            if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
                const color = getColorAt(x, y);
                updateFromHex(rgbToHex(color.r, color.g, color.b));
            }
        });
    }

    // Buttons
    const closeDialog = () => {
        document.body.removeChild(overlay);
        document.body.removeChild(dialog);
    };

    dialog.querySelector("#color-cancel").onclick = closeDialog;
    overlay.onclick = closeDialog;

    dialog.querySelector("#color-apply").onclick = () => {
        onApply(currentHex);
        closeDialog();
        app.graph.setDirtyCanvas(true);
    };
}

// Get connected image URL from node (recursively search upstream)
function getConnectedImageUrl(node, visited = new Set()) {
    // Prevent infinite loops
    if (visited.has(node.id)) return null;
    visited.add(node.id);

    // Try to find image input
    const imageInput = node.inputs?.find(i => i.name === "image");
    if (!imageInput?.link) {
        console.log("[ColorPicker] No image link found on", node.type);
        return null;
    }

    const link = app.graph.links[imageInput.link];
    if (!link) {
        console.log("[ColorPicker] Link not found in graph");
        return null;
    }

    const outputNode = app.graph.getNodeById(link.origin_id);
    if (!outputNode) {
        console.log("[ColorPicker] Output node not found");
        return null;
    }

    console.log("[ColorPicker] Checking node:", outputNode.type);

    // Try to get image from this node
    let imageUrl = getImageFromNode(outputNode);

    if (imageUrl) {
        console.log("[ColorPicker] Found image at:", outputNode.type);
        return imageUrl;
    }

    // If no image found, recursively check upstream nodes
    console.log("[ColorPicker] No image on", outputNode.type, "- checking upstream...");
    return getConnectedImageUrl(outputNode, visited);
}

// Extract image URL from a single node
function getImageFromNode(node) {
    // Method 1: Direct imgs array (PreviewImage, SaveImage, etc.)
    if (node.imgs?.[0]?.src) {
        return node.imgs[0].src;
    }

    // Method 2: Check imageIndex for batch
    const imageIndex = node.imageIndex ?? 0;
    if (node.imgs?.[imageIndex]?.src) {
        return node.imgs[imageIndex].src;
    }

    // Method 3: For LoadImage node - construct URL from widget value
    if (node.type === "LoadImage" || node.comfyClass === "LoadImage") {
        const imageWidget = node.widgets?.find(w => w.name === "image");
        if (imageWidget?.value) {
            const imageName = imageWidget.value;
            const url = `/view?filename=${encodeURIComponent(imageName)}&type=input&subfolder=`;
            console.log("[ColorPicker] Constructed LoadImage URL:", url);
            return url;
        }
    }

    // Method 4: imgs array with string or other format
    if (node.imgs && node.imgs.length > 0) {
        const img = node.imgs[0];
        if (typeof img === 'string') return img;
        if (img.src) return img.src;
    }

    return null;
}

// Register extension for ColorPicker node
app.registerExtension({
    name: "ComfyAngel.ColorPickerWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_ColorPicker") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            const node = this;

            const colorWidget = this.widgets.find(w => w.name === "color_hex");

            // Add color picker button
            const pickerBtn = this.addWidget("button", "Open Color Picker", null, () => {
                const imageUrl = getConnectedImageUrl(node);
                showColorPickerDialog(colorWidget, (hex) => {
                    if (colorWidget) colorWidget.value = hex;
                }, imageUrl);
            });
            pickerBtn.serialize = false;

            // Add color preview widget
            this.addCustomWidget({
                name: "color_preview",
                type: "color_preview",
                draw: function(ctx, node, width, y, height) {
                    const color = colorWidget?.value || "#FFFFFF";
                    const margin = 15;
                    const previewWidth = width - margin * 2;
                    const previewHeight = 30;

                    ctx.fillStyle = "#333";
                    ctx.fillRect(margin, y, previewWidth, previewHeight);

                    ctx.fillStyle = color;
                    ctx.fillRect(margin + 2, y + 2, previewWidth - 4, previewHeight - 4);

                    ctx.strokeStyle = "#555";
                    ctx.strokeRect(margin, y, previewWidth, previewHeight);

                    ctx.fillStyle = "#aaa";
                    ctx.font = "11px monospace";
                    ctx.textAlign = "center";
                    ctx.fillText(color, width / 2, y + previewHeight + 14);
                },
                computeSize: function() {
                    return [0, 50];
                },
                serialize: false
            });

            return result;
        };
    },
});

// Register extension for SolidColor node
app.registerExtension({
    name: "ComfyAngel.SolidColorWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_SolidColor") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            const colorWidget = this.widgets.find(w => w.name === "color");

            if (colorWidget) {
                const pickerBtn = this.addWidget("button", "Open Color Picker", null, () => {
                    showColorPickerDialog(colorWidget, (hex) => {
                        if (colorWidget) colorWidget.value = hex;
                    });
                });
                pickerBtn.serialize = false;
            }

            return result;
        };
    },
});
