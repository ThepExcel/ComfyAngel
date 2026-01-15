/**
 * Position Picker Widget for ComfyAngel
 *
 * Provides a visual position picker with anchor points.
 */

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "ComfyAngel.PositionWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_SmartPosition") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            // Find position widgets
            const xWidget = this.widgets.find(w => w.name === "x");
            const yWidget = this.widgets.find(w => w.name === "y");
            const anchorWidget = this.widgets.find(w => w.name === "anchor");

            // Add position picker button
            const pickerWidget = this.addWidget("button", "Open Position Picker", null, () => {
                this.showPositionPicker(xWidget, yWidget, anchorWidget);
            });
            pickerWidget.serialize = false;

            return result;
        };

        // Add position picker dialog
        nodeType.prototype.showPositionPicker = function (xWidget, yWidget, anchorWidget) {
            // Get connected image dimensions if available
            let imageWidth = 512;
            let imageHeight = 512;

            const widthInput = this.inputs?.find(i => i.name === "width");
            const heightInput = this.inputs?.find(i => i.name === "height");

            const widthWidget = this.widgets?.find(w => w.name === "canvas_width");
            const heightWidget = this.widgets?.find(w => w.name === "canvas_height");

            if (widthWidget) imageWidth = widthWidget.value;
            if (heightWidget) imageHeight = heightWidget.value;

            const currentX = xWidget?.value || 0;
            const currentY = yWidget?.value || 0;
            const currentAnchor = anchorWidget?.value || "top_left";

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
                min-width: 450px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            `;

            // Calculate preview scale
            const maxPreviewSize = 300;
            const scale = Math.min(maxPreviewSize / imageWidth, maxPreviewSize / imageHeight);
            const previewWidth = Math.floor(imageWidth * scale);
            const previewHeight = Math.floor(imageHeight * scale);

            dialog.innerHTML = `
                <div style="color: #fff; font-family: sans-serif;">
                    <h3 style="margin: 0 0 15px 0;">Position Picker</h3>
                    <div style="display: flex; gap: 20px;">
                        <div>
                            <div id="position-canvas" style="
                                width: ${previewWidth}px;
                                height: ${previewHeight}px;
                                background: #333;
                                border: 1px solid #555;
                                position: relative;
                                cursor: crosshair;
                            ">
                                <div style="
                                    position: absolute;
                                    top: 0; left: 0; right: 0; bottom: 0;
                                    background-image:
                                        linear-gradient(45deg, #444 25%, transparent 25%),
                                        linear-gradient(-45deg, #444 25%, transparent 25%),
                                        linear-gradient(45deg, transparent 75%, #444 75%),
                                        linear-gradient(-45deg, transparent 75%, #444 75%);
                                    background-size: 20px 20px;
                                    background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
                                    opacity: 0.3;
                                "></div>
                                <div id="position-marker" style="
                                    position: absolute;
                                    width: 20px;
                                    height: 20px;
                                    border: 2px solid #0af;
                                    border-radius: 50%;
                                    background: rgba(0, 170, 255, 0.3);
                                    transform: translate(-50%, -50%);
                                    pointer-events: none;
                                    left: ${(currentX / imageWidth) * previewWidth}px;
                                    top: ${(currentY / imageHeight) * previewHeight}px;
                                ">
                                    <div style="
                                        position: absolute;
                                        top: 50%;
                                        left: 50%;
                                        width: 6px;
                                        height: 6px;
                                        background: #0af;
                                        border-radius: 50%;
                                        transform: translate(-50%, -50%);
                                    "></div>
                                </div>
                            </div>
                            <div style="margin-top: 10px; font-size: 12px; color: #888;">
                                Click to set position
                            </div>
                        </div>
                        <div style="flex: 1;">
                            <label style="color: #aaa; display: block; margin-bottom: 10px;">
                                Anchor Point:
                                <select id="position-anchor" style="
                                    width: 100%;
                                    background: #333;
                                    border: 1px solid #555;
                                    color: #fff;
                                    padding: 8px;
                                    border-radius: 4px;
                                    margin-top: 5px;
                                ">
                                    <option value="top_left" ${currentAnchor === "top_left" ? "selected" : ""}>Top Left</option>
                                    <option value="top_center" ${currentAnchor === "top_center" ? "selected" : ""}>Top Center</option>
                                    <option value="top_right" ${currentAnchor === "top_right" ? "selected" : ""}>Top Right</option>
                                    <option value="middle_left" ${currentAnchor === "middle_left" ? "selected" : ""}>Middle Left</option>
                                    <option value="center" ${currentAnchor === "center" ? "selected" : ""}>Center</option>
                                    <option value="middle_right" ${currentAnchor === "middle_right" ? "selected" : ""}>Middle Right</option>
                                    <option value="bottom_left" ${currentAnchor === "bottom_left" ? "selected" : ""}>Bottom Left</option>
                                    <option value="bottom_center" ${currentAnchor === "bottom_center" ? "selected" : ""}>Bottom Center</option>
                                    <option value="bottom_right" ${currentAnchor === "bottom_right" ? "selected" : ""}>Bottom Right</option>
                                </select>
                            </label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                                <label style="color: #aaa;">
                                    X:
                                    <input type="number" id="position-x" value="${currentX}" min="0" max="${imageWidth}"
                                        style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px;">
                                </label>
                                <label style="color: #aaa;">
                                    Y:
                                    <input type="number" id="position-y" value="${currentY}" min="0" max="${imageHeight}"
                                        style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px;">
                                </label>
                            </div>

                            <div style="margin-bottom: 15px;">
                                <div style="color: #aaa; margin-bottom: 8px;">Quick Positions:</div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
                                    <button class="quick-pos" data-x="0" data-y="0" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TL</button>
                                    <button class="quick-pos" data-x="${Math.floor(imageWidth/2)}" data-y="0" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TC</button>
                                    <button class="quick-pos" data-x="${imageWidth}" data-y="0" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TR</button>
                                    <button class="quick-pos" data-x="0" data-y="${Math.floor(imageHeight/2)}" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">ML</button>
                                    <button class="quick-pos" data-x="${Math.floor(imageWidth/2)}" data-y="${Math.floor(imageHeight/2)}" style="padding: 8px; background: #0af; border: none; color: #000; border-radius: 4px; cursor: pointer; font-weight: bold;">C</button>
                                    <button class="quick-pos" data-x="${imageWidth}" data-y="${Math.floor(imageHeight/2)}" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">MR</button>
                                    <button class="quick-pos" data-x="0" data-y="${imageHeight}" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BL</button>
                                    <button class="quick-pos" data-x="${Math.floor(imageWidth/2)}" data-y="${imageHeight}" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BC</button>
                                    <button class="quick-pos" data-x="${imageWidth}" data-y="${imageHeight}" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BR</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
                        <button id="position-cancel" style="
                            padding: 8px 16px;
                            background: #444;
                            border: none;
                            border-radius: 4px;
                            color: #fff;
                            cursor: pointer;
                        ">Cancel</button>
                        <button id="position-apply" style="
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

            // Get elements
            const canvas = dialog.querySelector("#position-canvas");
            const marker = dialog.querySelector("#position-marker");
            const xInput = dialog.querySelector("#position-x");
            const yInput = dialog.querySelector("#position-y");

            // Update marker position
            const updateMarker = () => {
                const x = parseInt(xInput.value) || 0;
                const y = parseInt(yInput.value) || 0;
                marker.style.left = `${(x / imageWidth) * previewWidth}px`;
                marker.style.top = `${(y / imageHeight) * previewHeight}px`;
            };

            // Handle canvas click
            canvas.addEventListener("click", (e) => {
                const rect = canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;

                const x = Math.round((clickX / previewWidth) * imageWidth);
                const y = Math.round((clickY / previewHeight) * imageHeight);

                xInput.value = Math.max(0, Math.min(imageWidth, x));
                yInput.value = Math.max(0, Math.min(imageHeight, y));
                updateMarker();
            });

            // Handle input changes
            xInput.addEventListener("input", updateMarker);
            yInput.addEventListener("input", updateMarker);

            // Handle quick position buttons
            dialog.querySelectorAll(".quick-pos").forEach(btn => {
                btn.addEventListener("click", () => {
                    xInput.value = btn.dataset.x;
                    yInput.value = btn.dataset.y;
                    updateMarker();
                });
            });

            // Handle buttons
            dialog.querySelector("#position-cancel").onclick = () => {
                document.body.removeChild(overlay);
                document.body.removeChild(dialog);
            };

            dialog.querySelector("#position-apply").onclick = () => {
                if (xWidget) xWidget.value = parseInt(xInput.value) || 0;
                if (yWidget) yWidget.value = parseInt(yInput.value) || 0;
                if (anchorWidget) anchorWidget.value = dialog.querySelector("#position-anchor").value;

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
