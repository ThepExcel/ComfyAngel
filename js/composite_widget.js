/**
 * Smart Composite Widget for ComfyAngel
 *
 * Provides a visual position picker for compositing images.
 */

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "ComfyAngel.CompositeWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_SmartComposite") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            // Find position widgets
            const xWidget = this.widgets.find(w => w.name === "x");
            const yWidget = this.widgets.find(w => w.name === "y");
            const anchorWidget = this.widgets.find(w => w.name === "anchor");
            const scaleWidget = this.widgets.find(w => w.name === "scale");

            // Add position picker button
            const pickerWidget = this.addWidget("button", "Open Position Picker", null, () => {
                this.showPositionPicker(xWidget, yWidget, anchorWidget, scaleWidget);
            });
            pickerWidget.serialize = false;

            return result;
        };

        // Get connected image URL
        nodeType.prototype.getConnectedImageUrl = function (inputName) {
            const input = this.inputs?.find(i => i.name === inputName);
            if (!input?.link) return null;

            const link = app.graph.links[input.link];
            if (!link) return null;

            const outputNode = app.graph.getNodeById(link.origin_id);
            if (!outputNode) return null;

            return this.getImageFromNode(outputNode);
        };

        nodeType.prototype.getImageFromNode = function (node, visited = new Set()) {
            if (visited.has(node.id)) return null;
            visited.add(node.id);

            // Check if node has images
            if (node.imgs && node.imgs.length > 0) {
                const img = node.imgs[node.imageIndex || 0];
                if (img?.src) return img.src;
            }

            // Check LoadImage node
            if (node.type === "LoadImage" || node.comfyClass === "LoadImage") {
                const imageWidget = node.widgets?.find(w => w.name === "image");
                if (imageWidget?.value) {
                    return `/view?filename=${encodeURIComponent(imageWidget.value)}&type=input&subfolder=`;
                }
            }

            // Check PreviewImage node
            if (node.type === "PreviewImage" || node.comfyClass === "PreviewImage") {
                if (node.images && node.images.length > 0) {
                    const img = node.images[0];
                    return `/view?filename=${encodeURIComponent(img.filename)}&type=${img.type}&subfolder=${img.subfolder || ""}`;
                }
            }

            // Recursively check upstream nodes
            if (node.inputs) {
                for (const input of node.inputs) {
                    if (input.link) {
                        const link = app.graph.links[input.link];
                        if (link) {
                            const upstreamNode = app.graph.getNodeById(link.origin_id);
                            if (upstreamNode) {
                                const url = this.getImageFromNode(upstreamNode, visited);
                                if (url) return url;
                            }
                        }
                    }
                }
            }

            return null;
        };

        // Add position picker dialog
        nodeType.prototype.showPositionPicker = function (xWidget, yWidget, anchorWidget, scaleWidget) {
            const canvasUrl = this.getConnectedImageUrl("canvas");
            const overlayUrl = this.getConnectedImageUrl("overlay");

            const currentX = xWidget?.value || 0;
            const currentY = yWidget?.value || 0;
            const currentAnchor = anchorWidget?.value || "top_left";
            const currentScale = scaleWidget?.value || 100;

            // Default dimensions
            let canvasWidth = 512;
            let canvasHeight = 512;
            let overlayWidth = 100;
            let overlayHeight = 100;

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
                min-width: 550px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            `;

            // Add overlay
            const bgOverlay = document.createElement("div");
            bgOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            `;

            document.body.appendChild(bgOverlay);
            document.body.appendChild(dialog);

            // Initial loading state
            dialog.innerHTML = `
                <div style="color: #fff; font-family: sans-serif; text-align: center; padding: 40px;">
                    <div>Loading images...</div>
                </div>
            `;

            // Load images and then show picker
            const loadImages = async () => {
                const canvasImg = new Image();
                const overlayImg = new Image();

                const loadPromises = [];

                if (canvasUrl) {
                    loadPromises.push(new Promise((resolve) => {
                        canvasImg.onload = () => {
                            canvasWidth = canvasImg.naturalWidth;
                            canvasHeight = canvasImg.naturalHeight;
                            resolve();
                        };
                        canvasImg.onerror = () => resolve();
                        canvasImg.src = canvasUrl;
                    }));
                }

                if (overlayUrl) {
                    loadPromises.push(new Promise((resolve) => {
                        overlayImg.onload = () => {
                            overlayWidth = overlayImg.naturalWidth;
                            overlayHeight = overlayImg.naturalHeight;
                            resolve();
                        };
                        overlayImg.onerror = () => resolve();
                        overlayImg.src = overlayUrl;
                    }));
                }

                await Promise.all(loadPromises);

                // Now render the picker
                this.renderPositionPicker(
                    dialog, bgOverlay,
                    canvasUrl, overlayUrl,
                    canvasWidth, canvasHeight,
                    overlayWidth, overlayHeight,
                    currentX, currentY, currentAnchor, currentScale,
                    xWidget, yWidget, anchorWidget, scaleWidget
                );
            };

            loadImages();
        };

        nodeType.prototype.renderPositionPicker = function (
            dialog, bgOverlay,
            canvasUrl, overlayUrl,
            canvasWidth, canvasHeight,
            overlayWidth, overlayHeight,
            currentX, currentY, currentAnchor, currentScale,
            xWidget, yWidget, anchorWidget, scaleWidget
        ) {
            // Calculate preview scale
            const maxPreviewSize = 400;
            const scale = Math.min(maxPreviewSize / canvasWidth, maxPreviewSize / canvasHeight);
            const previewWidth = Math.floor(canvasWidth * scale);
            const previewHeight = Math.floor(canvasHeight * scale);

            // Calculate scaled overlay size for preview
            const scaledOverlayW = Math.floor(overlayWidth * (currentScale / 100) * scale);
            const scaledOverlayH = Math.floor(overlayHeight * (currentScale / 100) * scale);

            dialog.innerHTML = `
                <div style="color: #fff; font-family: sans-serif;">
                    <h3 style="margin: 0 0 15px 0;">Smart Composite - Position Picker</h3>
                    <div style="display: flex; gap: 20px;">
                        <div>
                            <div id="composite-canvas" style="
                                width: ${previewWidth}px;
                                height: ${previewHeight}px;
                                background: #333;
                                border: 1px solid #555;
                                position: relative;
                                cursor: crosshair;
                                overflow: hidden;
                            ">
                                ${canvasUrl ? `<img src="${canvasUrl}" style="width: 100%; height: 100%; object-fit: fill; position: absolute; top: 0; left: 0;">` : `
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
                                "></div>`}
                                <div id="overlay-preview" style="
                                    position: absolute;
                                    width: ${scaledOverlayW}px;
                                    height: ${scaledOverlayH}px;
                                    border: 2px dashed #0af;
                                    background: ${overlayUrl ? `url(${overlayUrl})` : 'rgba(0, 170, 255, 0.3)'};
                                    background-size: contain;
                                    background-repeat: no-repeat;
                                    pointer-events: none;
                                    left: ${(currentX / canvasWidth) * previewWidth}px;
                                    top: ${(currentY / canvasHeight) * previewHeight}px;
                                "></div>
                                <div id="position-marker" style="
                                    position: absolute;
                                    width: 12px;
                                    height: 12px;
                                    border: 2px solid #f00;
                                    border-radius: 50%;
                                    background: rgba(255, 0, 0, 0.5);
                                    transform: translate(-50%, -50%);
                                    pointer-events: none;
                                    left: ${(currentX / canvasWidth) * previewWidth}px;
                                    top: ${(currentY / canvasHeight) * previewHeight}px;
                                    z-index: 10;
                                "></div>
                            </div>
                            <div style="margin-top: 10px; font-size: 12px; color: #888;">
                                Canvas: ${canvasWidth}x${canvasHeight} | Overlay: ${overlayWidth}x${overlayHeight}
                            </div>
                        </div>
                        <div style="flex: 1; min-width: 200px;">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                                <label style="color: #aaa;">
                                    X:
                                    <input type="number" id="position-x" value="${currentX}"
                                        style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                                </label>
                                <label style="color: #aaa;">
                                    Y:
                                    <input type="number" id="position-y" value="${currentY}"
                                        style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                                </label>
                            </div>

                            <label style="color: #aaa; display: block; margin-bottom: 15px;">
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

                            <label style="color: #aaa; display: block; margin-bottom: 15px;">
                                Scale: <span id="scale-value">${currentScale}%</span>
                                <input type="range" id="position-scale" value="${currentScale}" min="1" max="500" step="1"
                                    style="width: 100%; margin-top: 5px;">
                            </label>

                            <div style="margin-bottom: 15px;">
                                <div style="color: #aaa; margin-bottom: 8px;">Quick Positions:</div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
                                    <button class="quick-pos" data-x="0" data-y="0" data-anchor="top_left" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TL</button>
                                    <button class="quick-pos" data-x="${Math.floor(canvasWidth/2)}" data-y="0" data-anchor="top_center" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TC</button>
                                    <button class="quick-pos" data-x="${canvasWidth}" data-y="0" data-anchor="top_right" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TR</button>
                                    <button class="quick-pos" data-x="0" data-y="${Math.floor(canvasHeight/2)}" data-anchor="middle_left" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">ML</button>
                                    <button class="quick-pos" data-x="${Math.floor(canvasWidth/2)}" data-y="${Math.floor(canvasHeight/2)}" data-anchor="center" style="padding: 8px; background: #0af; border: none; color: #000; border-radius: 4px; cursor: pointer; font-weight: bold;">C</button>
                                    <button class="quick-pos" data-x="${canvasWidth}" data-y="${Math.floor(canvasHeight/2)}" data-anchor="middle_right" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">MR</button>
                                    <button class="quick-pos" data-x="0" data-y="${canvasHeight}" data-anchor="bottom_left" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BL</button>
                                    <button class="quick-pos" data-x="${Math.floor(canvasWidth/2)}" data-y="${canvasHeight}" data-anchor="bottom_center" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BC</button>
                                    <button class="quick-pos" data-x="${canvasWidth}" data-y="${canvasHeight}" data-anchor="bottom_right" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BR</button>
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

            // Get elements
            const canvas = dialog.querySelector("#composite-canvas");
            const marker = dialog.querySelector("#position-marker");
            const overlayPreview = dialog.querySelector("#overlay-preview");
            const xInput = dialog.querySelector("#position-x");
            const yInput = dialog.querySelector("#position-y");
            const anchorSelect = dialog.querySelector("#position-anchor");
            const scaleInput = dialog.querySelector("#position-scale");
            const scaleValue = dialog.querySelector("#scale-value");

            // Calculate anchor offset for overlay preview
            const getAnchorOffset = (anchor, w, h) => {
                const offsets = {
                    "top_left": [0, 0],
                    "top_center": [-w / 2, 0],
                    "top_right": [-w, 0],
                    "middle_left": [0, -h / 2],
                    "center": [-w / 2, -h / 2],
                    "middle_right": [-w, -h / 2],
                    "bottom_left": [0, -h],
                    "bottom_center": [-w / 2, -h],
                    "bottom_right": [-w, -h],
                };
                return offsets[anchor] || [0, 0];
            };

            // Update preview
            const updatePreview = () => {
                const x = parseInt(xInput.value) || 0;
                const y = parseInt(yInput.value) || 0;
                const anchor = anchorSelect.value;
                const scalePercent = parseInt(scaleInput.value) || 100;

                // Update scale display
                scaleValue.textContent = `${scalePercent}%`;

                // Calculate overlay preview size
                const scaledW = Math.floor(overlayWidth * (scalePercent / 100) * scale);
                const scaledH = Math.floor(overlayHeight * (scalePercent / 100) * scale);

                overlayPreview.style.width = `${scaledW}px`;
                overlayPreview.style.height = `${scaledH}px`;

                // Calculate position with anchor offset
                const [ox, oy] = getAnchorOffset(anchor, scaledW, scaledH);
                const previewX = (x / canvasWidth) * previewWidth + ox;
                const previewY = (y / canvasHeight) * previewHeight + oy;

                overlayPreview.style.left = `${previewX}px`;
                overlayPreview.style.top = `${previewY}px`;

                // Update marker
                marker.style.left = `${(x / canvasWidth) * previewWidth}px`;
                marker.style.top = `${(y / canvasHeight) * previewHeight}px`;
            };

            // Handle canvas click
            canvas.addEventListener("click", (e) => {
                const rect = canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;

                const x = Math.round((clickX / previewWidth) * canvasWidth);
                const y = Math.round((clickY / previewHeight) * canvasHeight);

                xInput.value = x;
                yInput.value = y;
                updatePreview();
            });

            // Handle input changes
            xInput.addEventListener("input", updatePreview);
            yInput.addEventListener("input", updatePreview);
            anchorSelect.addEventListener("change", updatePreview);
            scaleInput.addEventListener("input", updatePreview);

            // Handle quick position buttons
            dialog.querySelectorAll(".quick-pos").forEach(btn => {
                btn.addEventListener("click", () => {
                    xInput.value = btn.dataset.x;
                    yInput.value = btn.dataset.y;
                    anchorSelect.value = btn.dataset.anchor;
                    updatePreview();
                });
            });

            // Handle buttons
            const closeDialog = () => {
                document.body.removeChild(bgOverlay);
                document.body.removeChild(dialog);
            };

            dialog.querySelector("#position-cancel").onclick = closeDialog;
            bgOverlay.onclick = closeDialog;

            dialog.querySelector("#position-apply").onclick = () => {
                if (xWidget) xWidget.value = parseInt(xInput.value) || 0;
                if (yWidget) yWidget.value = parseInt(yInput.value) || 0;
                if (anchorWidget) anchorWidget.value = anchorSelect.value;
                if (scaleWidget) scaleWidget.value = parseInt(scaleInput.value) || 100;

                closeDialog();
                app.graph.setDirtyCanvas(true);
            };

            // Initial update
            updatePreview();
        };
    },
});
