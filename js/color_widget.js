/**
 * Color Picker Widget for ComfyAngel
 *
 * Provides a visual color picker with preview.
 */

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "ComfyAngel.ColorWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_SolidColor") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            // Find the color widget
            const colorWidget = this.widgets.find(w => w.name === "color");

            if (colorWidget) {
                // Store original callback
                const originalCallback = colorWidget.callback;

                // Add color preview
                const previewWidget = this.addWidget("button", "Color Preview", null, () => {
                    this.showColorPicker(colorWidget);
                });
                previewWidget.serialize = false;

                // Override draw to show color
                const originalDraw = previewWidget.draw;
                previewWidget.draw = function (ctx, node, width, y, height) {
                    // Draw button background
                    if (originalDraw) {
                        originalDraw.call(this, ctx, node, width, y, height);
                    }

                    // Draw color preview square
                    const color = colorWidget.value || "#FFFFFF";
                    const previewSize = height - 8;
                    const previewX = width - previewSize - 10;
                    const previewY = y + 4;

                    ctx.fillStyle = color;
                    ctx.fillRect(previewX, previewY, previewSize, previewSize);
                    ctx.strokeStyle = "#888";
                    ctx.strokeRect(previewX, previewY, previewSize, previewSize);
                };
            }

            return result;
        };

        // Add color picker dialog method
        nodeType.prototype.showColorPicker = function (colorWidget) {
            const currentColor = colorWidget.value || "#FFFFFF";

            // Create dialog
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
                min-width: 300px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            `;

            dialog.innerHTML = `
                <div style="color: #fff; font-family: sans-serif;">
                    <h3 style="margin: 0 0 15px 0;">Color Picker</h3>
                    <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                        <div>
                            <input type="color" id="color-picker" value="${currentColor}"
                                style="width: 150px; height: 150px; border: none; cursor: pointer; background: transparent;">
                        </div>
                        <div style="flex: 1;">
                            <div id="color-preview" style="
                                width: 100%;
                                height: 60px;
                                background: ${currentColor};
                                border: 1px solid #555;
                                border-radius: 4px;
                                margin-bottom: 15px;
                            "></div>
                            <label style="color: #aaa; display: block; margin-bottom: 10px;">
                                HEX:
                                <input type="text" id="color-hex" value="${currentColor}"
                                    style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; font-family: monospace;">
                            </label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
                                <label style="color: #aaa; font-size: 12px;">
                                    R:
                                    <input type="number" id="color-r" min="0" max="255"
                                        style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 5px; border-radius: 4px;">
                                </label>
                                <label style="color: #aaa; font-size: 12px;">
                                    G:
                                    <input type="number" id="color-g" min="0" max="255"
                                        style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 5px; border-radius: 4px;">
                                </label>
                                <label style="color: #aaa; font-size: 12px;">
                                    B:
                                    <input type="number" id="color-b" min="0" max="255"
                                        style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 5px; border-radius: 4px;">
                                </label>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="color-cancel" style="
                            padding: 8px 16px;
                            background: #444;
                            border: none;
                            border-radius: 4px;
                            color: #fff;
                            cursor: pointer;
                        ">Cancel</button>
                        <button id="color-apply" style="
                            padding: 8px 16px;
                            background: #0af;
                            border: none;
                            border-radius: 4px;
                            color: #000;
                            cursor: pointer;
                            font-weight: bold;
                        ">Apply</button>
                    </div>
                </div>
            `;

            // Add overlay
            const overlay = document.createElement("div");
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(dialog);

            // Helper functions
            const hexToRgb = (hex) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                } : { r: 255, g: 255, b: 255 };
            };

            const rgbToHex = (r, g, b) => {
                return "#" + [r, g, b].map(x => {
                    const hex = Math.max(0, Math.min(255, x)).toString(16);
                    return hex.length === 1 ? "0" + hex : hex;
                }).join("");
            };

            // Initialize RGB values
            const rgb = hexToRgb(currentColor);
            dialog.querySelector("#color-r").value = rgb.r;
            dialog.querySelector("#color-g").value = rgb.g;
            dialog.querySelector("#color-b").value = rgb.b;

            // Sync color picker with inputs
            const colorPicker = dialog.querySelector("#color-picker");
            const hexInput = dialog.querySelector("#color-hex");
            const preview = dialog.querySelector("#color-preview");
            const rInput = dialog.querySelector("#color-r");
            const gInput = dialog.querySelector("#color-g");
            const bInput = dialog.querySelector("#color-b");

            const updateFromHex = (hex) => {
                preview.style.background = hex;
                colorPicker.value = hex;
                const rgb = hexToRgb(hex);
                rInput.value = rgb.r;
                gInput.value = rgb.g;
                bInput.value = rgb.b;
            };

            const updateFromRgb = () => {
                const r = parseInt(rInput.value) || 0;
                const g = parseInt(gInput.value) || 0;
                const b = parseInt(bInput.value) || 0;
                const hex = rgbToHex(r, g, b);
                hexInput.value = hex;
                preview.style.background = hex;
                colorPicker.value = hex;
            };

            colorPicker.addEventListener("input", (e) => {
                hexInput.value = e.target.value;
                updateFromHex(e.target.value);
            });

            hexInput.addEventListener("input", (e) => {
                let hex = e.target.value;
                if (!hex.startsWith("#")) hex = "#" + hex;
                if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                    updateFromHex(hex);
                }
            });

            [rInput, gInput, bInput].forEach(input => {
                input.addEventListener("input", updateFromRgb);
            });

            // Handle buttons
            dialog.querySelector("#color-cancel").onclick = () => {
                document.body.removeChild(overlay);
                document.body.removeChild(dialog);
            };

            dialog.querySelector("#color-apply").onclick = () => {
                colorWidget.value = hexInput.value;
                document.body.removeChild(overlay);
                document.body.removeChild(dialog);
                app.graph.setDirtyCanvas(true);
            };

            overlay.onclick = () => {
                document.body.removeChild(overlay);
                document.body.removeChild(dialog);
            };
        };
    },
});
