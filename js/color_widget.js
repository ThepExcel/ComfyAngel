/**
 * Color Picker Widget for ComfyAngel
 *
 * Supports RGB, HSL, Hex formats and eyedropper from image.
 */

import { app } from "../../scripts/app.js";
import { showColorPickerDialog, getConnectedImageUrl } from "./color_utils.js";

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
                showColorPickerDialog(colorWidget?.value || "#FFFFFF", (hex) => {
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
                    showColorPickerDialog(colorWidget?.value || "#FFFFFF", (hex) => {
                        if (colorWidget) colorWidget.value = hex;
                    });
                });
                pickerBtn.serialize = false;
            }

            return result;
        };
    },
});
