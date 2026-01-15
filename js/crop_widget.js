/**
 * Crop Area Selector Widget for ComfyAngel
 *
 * Provides a visual crop area selector with drag handles.
 */

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "ComfyAngel.CropWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_SmartCrop") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            // Find the crop inputs
            const xWidget = this.widgets.find(w => w.name === "x");
            const yWidget = this.widgets.find(w => w.name === "y");
            const widthWidget = this.widgets.find(w => w.name === "crop_width");
            const heightWidget = this.widgets.find(w => w.name === "crop_height");

            // Add crop preview widget
            const cropWidget = this.addWidget("button", "Open Crop Editor", null, () => {
                this.showCropDialog(xWidget, yWidget, widthWidget, heightWidget);
            });
            cropWidget.serialize = false;

            return result;
        };

        // Add crop dialog method
        nodeType.prototype.showCropDialog = function (xWidget, yWidget, widthWidget, heightWidget) {
            // Get connected image if available
            const imageInput = this.inputs?.find(i => i.name === "image");
            let imageUrl = null;

            if (imageInput?.link) {
                const link = app.graph.links[imageInput.link];
                if (link) {
                    const outputNode = app.graph.getNodeById(link.origin_id);
                    if (outputNode?.imgs?.[0]) {
                        imageUrl = outputNode.imgs[0].src;
                    }
                }
            }

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
                min-width: 400px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            `;

            dialog.innerHTML = `
                <div style="color: #fff; font-family: sans-serif;">
                    <h3 style="margin: 0 0 15px 0;">Crop Area Selector</h3>
                    <div id="crop-preview" style="
                        width: 100%;
                        height: 300px;
                        background: #333;
                        border: 1px solid #555;
                        position: relative;
                        overflow: hidden;
                        margin-bottom: 15px;
                    ">
                        ${imageUrl ?
                            `<img src="${imageUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;">` :
                            '<div style="text-align: center; padding-top: 130px; color: #888;">Connect an image to preview</div>'
                        }
                        <div id="crop-rect" style="
                            position: absolute;
                            border: 2px dashed #0af;
                            background: rgba(0, 170, 255, 0.1);
                            cursor: move;
                        "></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <label style="color: #aaa;">
                            X:
                            <input type="number" id="crop-x" value="${xWidget?.value || 0}"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 5px; border-radius: 4px;">
                        </label>
                        <label style="color: #aaa;">
                            Y:
                            <input type="number" id="crop-y" value="${yWidget?.value || 0}"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 5px; border-radius: 4px;">
                        </label>
                        <label style="color: #aaa;">
                            Width:
                            <input type="number" id="crop-w" value="${widthWidget?.value || 512}"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 5px; border-radius: 4px;">
                        </label>
                        <label style="color: #aaa;">
                            Height:
                            <input type="number" id="crop-h" value="${heightWidget?.value || 512}"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 5px; border-radius: 4px;">
                        </label>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="crop-cancel" style="
                            padding: 8px 16px;
                            background: #444;
                            border: none;
                            border-radius: 4px;
                            color: #fff;
                            cursor: pointer;
                        ">Cancel</button>
                        <button id="crop-apply" style="
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

            // Handle input changes
            const updateCropRect = () => {
                const rect = dialog.querySelector("#crop-rect");
                const preview = dialog.querySelector("#crop-preview");
                const x = parseInt(dialog.querySelector("#crop-x").value) || 0;
                const y = parseInt(dialog.querySelector("#crop-y").value) || 0;
                const w = parseInt(dialog.querySelector("#crop-w").value) || 100;
                const h = parseInt(dialog.querySelector("#crop-h").value) || 100;

                // Scale to preview size (simplified)
                const scale = 0.5;
                rect.style.left = `${x * scale}px`;
                rect.style.top = `${y * scale}px`;
                rect.style.width = `${w * scale}px`;
                rect.style.height = `${h * scale}px`;
            };

            dialog.querySelectorAll("input").forEach(input => {
                input.addEventListener("input", updateCropRect);
            });

            updateCropRect();

            // Handle buttons
            dialog.querySelector("#crop-cancel").onclick = () => {
                document.body.removeChild(overlay);
                document.body.removeChild(dialog);
            };

            dialog.querySelector("#crop-apply").onclick = () => {
                if (xWidget) xWidget.value = parseInt(dialog.querySelector("#crop-x").value) || 0;
                if (yWidget) yWidget.value = parseInt(dialog.querySelector("#crop-y").value) || 0;
                if (widthWidget) widthWidget.value = parseInt(dialog.querySelector("#crop-w").value) || 512;
                if (heightWidget) heightWidget.value = parseInt(dialog.querySelector("#crop-h").value) || 512;

                document.body.removeChild(overlay);
                document.body.removeChild(dialog);
            };

            overlay.onclick = () => {
                document.body.removeChild(overlay);
                document.body.removeChild(dialog);
            };
        };
    },
});
