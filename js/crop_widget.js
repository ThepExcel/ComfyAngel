/**
 * Crop Area Selector Widget for ComfyAngel
 *
 * Provides a visual crop area selector with drag and resize.
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

            const xWidget = this.widgets.find(w => w.name === "x");
            const yWidget = this.widgets.find(w => w.name === "y");
            const widthWidget = this.widgets.find(w => w.name === "crop_width");
            const heightWidget = this.widgets.find(w => w.name === "crop_height");

            const cropWidget = this.addWidget("button", "Open Crop Editor", null, () => {
                this.showCropDialog(xWidget, yWidget, widthWidget, heightWidget);
            });
            cropWidget.serialize = false;

            return result;
        };

        nodeType.prototype.showCropDialog = function (xWidget, yWidget, widthWidget, heightWidget) {
            // Get connected image
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

            // State
            let imgNaturalWidth = 1024;
            let imgNaturalHeight = 1024;
            let scale = 1;
            let imgOffsetX = 0;
            let imgOffsetY = 0;

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
                min-width: 500px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            `;

            const previewHeight = 400;
            dialog.innerHTML = `
                <div style="color: #fff; font-family: sans-serif;">
                    <h3 style="margin: 0 0 15px 0;">Crop Area Selector</h3>
                    <div id="crop-container" style="
                        width: 100%;
                        height: ${previewHeight}px;
                        background: #222;
                        border: 1px solid #555;
                        position: relative;
                        overflow: hidden;
                        margin-bottom: 15px;
                        user-select: none;
                    ">
                        ${imageUrl ?
                            `<img id="crop-image" src="${imageUrl}" style="position: absolute; pointer-events: none;">` :
                            '<div style="text-align: center; padding-top: 180px; color: #888;">Connect an image to preview</div>'
                        }
                        <div id="crop-rect" style="
                            position: absolute;
                            border: 2px dashed #0af;
                            background: rgba(0, 170, 255, 0.15);
                            cursor: move;
                            box-sizing: border-box;
                        ">
                            <div class="resize-handle" data-dir="nw" style="position:absolute;top:-4px;left:-4px;width:8px;height:8px;background:#0af;cursor:nw-resize;"></div>
                            <div class="resize-handle" data-dir="ne" style="position:absolute;top:-4px;right:-4px;width:8px;height:8px;background:#0af;cursor:ne-resize;"></div>
                            <div class="resize-handle" data-dir="sw" style="position:absolute;bottom:-4px;left:-4px;width:8px;height:8px;background:#0af;cursor:sw-resize;"></div>
                            <div class="resize-handle" data-dir="se" style="position:absolute;bottom:-4px;right:-4px;width:8px;height:8px;background:#0af;cursor:se-resize;"></div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <label style="color: #aaa;">
                            X:
                            <input type="number" id="crop-x" value="${xWidget?.value || 0}" min="0"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                        </label>
                        <label style="color: #aaa;">
                            Y:
                            <input type="number" id="crop-y" value="${yWidget?.value || 0}" min="0"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                        </label>
                        <label style="color: #aaa;">
                            Width:
                            <input type="number" id="crop-w" value="${widthWidget?.value || 512}" min="1"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                        </label>
                        <label style="color: #aaa;">
                            Height:
                            <input type="number" id="crop-h" value="${heightWidget?.value || 512}" min="1"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                        </label>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="crop-cancel" style="padding: 8px 16px; background: #444; border: none; border-radius: 4px; color: #fff; cursor: pointer;">Cancel</button>
                        <button id="crop-apply" style="padding: 8px 16px; background: #0af; border: none; border-radius: 4px; color: #000; cursor: pointer; font-weight: bold;">Apply</button>
                    </div>
                </div>
            `;

            const overlay = document.createElement("div");
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); z-index: 9999;
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(dialog);

            const container = dialog.querySelector("#crop-container");
            const rect = dialog.querySelector("#crop-rect");
            const img = dialog.querySelector("#crop-image");
            const inputX = dialog.querySelector("#crop-x");
            const inputY = dialog.querySelector("#crop-y");
            const inputW = dialog.querySelector("#crop-w");
            const inputH = dialog.querySelector("#crop-h");

            // Update rect position from input values
            const updateRectFromInputs = () => {
                const x = parseInt(inputX.value) || 0;
                const y = parseInt(inputY.value) || 0;
                const w = parseInt(inputW.value) || 100;
                const h = parseInt(inputH.value) || 100;

                rect.style.left = `${imgOffsetX + x * scale}px`;
                rect.style.top = `${imgOffsetY + y * scale}px`;
                rect.style.width = `${w * scale}px`;
                rect.style.height = `${h * scale}px`;
            };

            // Update inputs from rect position
            const updateInputsFromRect = () => {
                const rectLeft = parseFloat(rect.style.left) || 0;
                const rectTop = parseFloat(rect.style.top) || 0;
                const rectWidth = parseFloat(rect.style.width) || 100;
                const rectHeight = parseFloat(rect.style.height) || 100;

                inputX.value = Math.max(0, Math.round((rectLeft - imgOffsetX) / scale));
                inputY.value = Math.max(0, Math.round((rectTop - imgOffsetY) / scale));
                inputW.value = Math.max(1, Math.round(rectWidth / scale));
                inputH.value = Math.max(1, Math.round(rectHeight / scale));
            };

            // Setup image and calculate scale
            if (img) {
                img.onload = () => {
                    imgNaturalWidth = img.naturalWidth;
                    imgNaturalHeight = img.naturalHeight;

                    const containerWidth = container.clientWidth;
                    const containerHeight = container.clientHeight;

                    // Calculate scale to fit image in container
                    const scaleX = containerWidth / imgNaturalWidth;
                    const scaleY = containerHeight / imgNaturalHeight;
                    scale = Math.min(scaleX, scaleY, 1); // Don't scale up

                    const displayWidth = imgNaturalWidth * scale;
                    const displayHeight = imgNaturalHeight * scale;

                    // Center the image
                    imgOffsetX = (containerWidth - displayWidth) / 2;
                    imgOffsetY = (containerHeight - displayHeight) / 2;

                    img.style.left = `${imgOffsetX}px`;
                    img.style.top = `${imgOffsetY}px`;
                    img.style.width = `${displayWidth}px`;
                    img.style.height = `${displayHeight}px`;

                    updateRectFromInputs();
                };

                // Trigger load if already cached
                if (img.complete) {
                    img.onload();
                }
            } else {
                // No image - use default scale
                scale = 0.5;
                updateRectFromInputs();
            }

            // Input event listeners
            [inputX, inputY, inputW, inputH].forEach(input => {
                input.addEventListener("input", updateRectFromInputs);
            });

            // Drag functionality
            let isDragging = false;
            let isResizing = false;
            let resizeDir = null;
            let startX, startY, startLeft, startTop, startWidth, startHeight;

            rect.addEventListener("mousedown", (e) => {
                if (e.target.classList.contains("resize-handle")) {
                    isResizing = true;
                    resizeDir = e.target.dataset.dir;
                } else {
                    isDragging = true;
                }
                startX = e.clientX;
                startY = e.clientY;
                startLeft = parseFloat(rect.style.left) || 0;
                startTop = parseFloat(rect.style.top) || 0;
                startWidth = parseFloat(rect.style.width) || 100;
                startHeight = parseFloat(rect.style.height) || 100;
                e.preventDefault();
            });

            document.addEventListener("mousemove", (e) => {
                if (!isDragging && !isResizing) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                if (isDragging) {
                    // Calculate bounds
                    const displayWidth = imgNaturalWidth * scale;
                    const displayHeight = imgNaturalHeight * scale;
                    const rectW = parseFloat(rect.style.width) || 100;
                    const rectH = parseFloat(rect.style.height) || 100;

                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    // Clamp to image bounds
                    newLeft = Math.max(imgOffsetX, Math.min(newLeft, imgOffsetX + displayWidth - rectW));
                    newTop = Math.max(imgOffsetY, Math.min(newTop, imgOffsetY + displayHeight - rectH));

                    rect.style.left = `${newLeft}px`;
                    rect.style.top = `${newTop}px`;
                } else if (isResizing) {
                    let newLeft = startLeft;
                    let newTop = startTop;
                    let newWidth = startWidth;
                    let newHeight = startHeight;

                    if (resizeDir.includes("e")) newWidth = Math.max(20, startWidth + dx);
                    if (resizeDir.includes("w")) {
                        newWidth = Math.max(20, startWidth - dx);
                        newLeft = startLeft + dx;
                    }
                    if (resizeDir.includes("s")) newHeight = Math.max(20, startHeight + dy);
                    if (resizeDir.includes("n")) {
                        newHeight = Math.max(20, startHeight - dy);
                        newTop = startTop + dy;
                    }

                    rect.style.left = `${newLeft}px`;
                    rect.style.top = `${newTop}px`;
                    rect.style.width = `${newWidth}px`;
                    rect.style.height = `${newHeight}px`;
                }

                updateInputsFromRect();
            });

            document.addEventListener("mouseup", () => {
                isDragging = false;
                isResizing = false;
                resizeDir = null;
            });

            // Button handlers
            const closeDialog = () => {
                document.body.removeChild(overlay);
                document.body.removeChild(dialog);
            };

            dialog.querySelector("#crop-cancel").onclick = closeDialog;
            overlay.onclick = closeDialog;

            dialog.querySelector("#crop-apply").onclick = () => {
                if (xWidget) xWidget.value = parseInt(inputX.value) || 0;
                if (yWidget) yWidget.value = parseInt(inputY.value) || 0;
                if (widthWidget) widthWidget.value = parseInt(inputW.value) || 512;
                if (heightWidget) heightWidget.value = parseInt(inputH.value) || 512;
                closeDialog();
                app.graph.setDirtyCanvas(true);
            };
        };
    },
});
