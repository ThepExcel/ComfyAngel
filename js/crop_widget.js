/**
 * Crop Area Selector Widget for ComfyAngel
 *
 * Provides a visual crop area selector with drag and resize.
 * - Ratio buttons: set crop area to specific aspect ratio
 * - Corner resize: maintains aspect ratio from before drag
 * - Side resize: free resize (ignores ratio)
 * - Supports cropping beyond image bounds with background color
 */

import { app } from "../../scripts/app.js";
import { showColorPickerDialog, getConnectedImageUrl, hexToRgb } from "./color_utils.js";

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
            const bgColorWidget = this.widgets.find(w => w.name === "bg_color");

            const cropWidget = this.addWidget("button", "Open Crop Editor", null, () => {
                this.showCropDialog(xWidget, yWidget, widthWidget, heightWidget, bgColorWidget);
            });
            cropWidget.serialize = false;

            // Add inline color preview for bg_color
            if (bgColorWidget) {
                const colorPreviewWidget = this.addCustomWidget({
                    name: "bg_color_preview",
                    type: "bg_color_preview",
                    draw: function(ctx, node, width, y, height) {
                        const color = bgColorWidget?.value || "#000000";
                        const margin = 15;
                        const swatchSize = 24;
                        const label = "Background Color:";

                        // Draw label
                        ctx.fillStyle = "#aaa";
                        ctx.font = "12px sans-serif";
                        ctx.fillText(label, margin, y + 16);

                        // Draw color swatch
                        const swatchX = margin + ctx.measureText(label).width + 10;
                        ctx.fillStyle = color;
                        ctx.fillRect(swatchX, y + 2, swatchSize, swatchSize);

                        // Draw border
                        ctx.strokeStyle = "#555";
                        ctx.lineWidth = 1;
                        ctx.strokeRect(swatchX, y + 2, swatchSize, swatchSize);

                        // Draw color value text
                        ctx.fillStyle = "#fff";
                        ctx.fillText(color, swatchX + swatchSize + 10, y + 16);
                    },
                    computeSize: function(width) {
                        return [width, 30];
                    },
                    serialize: false
                });
            }

            return result;
        };

        nodeType.prototype.showCropDialog = function (xWidget, yWidget, widthWidget, heightWidget, bgColorWidget) {
            const node = this;

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
            let currentRatio = "free";
            let currentBgColor = bgColorWidget?.value || "#000000";

            // Ratio presets
            const ratioPresets = [
                { label: "Free", value: "free" },
                { label: "1:1", value: 1 },
                { label: "4:3", value: 4/3 },
                { label: "3:4", value: 3/4 },
                { label: "16:9", value: 16/9 },
                { label: "9:16", value: 9/16 },
                { label: "3:2", value: 3/2 },
                { label: "2:3", value: 2/3 },
            ];

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

            // Generate ratio buttons HTML
            const ratioButtonsHtml = ratioPresets.map(r =>
                `<button class="ratio-btn" data-ratio="${r.value}" style="
                    padding: 6px 12px;
                    background: ${r.value === "free" ? "#0af" : "#333"};
                    border: 1px solid #555;
                    border-radius: 4px;
                    color: ${r.value === "free" ? "#000" : "#fff"};
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: ${r.value === "free" ? "bold" : "normal"};
                ">${r.label}</button>`
            ).join("");

            dialog.innerHTML = `
                <div style="color: #fff; font-family: sans-serif;">
                    <h3 style="margin: 0 0 15px 0;">Crop Area Selector</h3>

                    <!-- Ratio buttons and BG color -->
                    <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap; align-items: center;">
                        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                            <span style="color: #888;">Ratio:</span>
                            ${ratioButtonsHtml}
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; margin-left: auto;">
                            <span style="color: #888;">BG:</span>
                            <div id="bg-color-preview" style="
                                width: 30px;
                                height: 24px;
                                background: ${currentBgColor};
                                border: 1px solid #555;
                                border-radius: 4px;
                                cursor: pointer;
                            " title="Click to change background color"></div>
                            <input type="text" id="bg-color-input" value="${currentBgColor}" style="
                                width: 80px;
                                background: #333;
                                border: 1px solid #555;
                                color: #fff;
                                padding: 4px 8px;
                                border-radius: 4px;
                                font-family: monospace;
                                font-size: 12px;
                            ">
                        </div>
                    </div>

                    <!-- Zoom controls -->
                    <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                        <span style="color: #888;">Zoom:</span>
                        <button id="zoom-out" style="width: 28px; height: 28px; background: #333; border: 1px solid #555; border-radius: 4px; color: #fff; cursor: pointer; font-size: 16px;">−</button>
                        <input type="range" id="zoom-slider" min="10" max="200" value="100" style="flex: 1; max-width: 150px; accent-color: #0af;">
                        <button id="zoom-in" style="width: 28px; height: 28px; background: #333; border: 1px solid #555; border-radius: 4px; color: #fff; cursor: pointer; font-size: 16px;">+</button>
                        <span id="zoom-label" style="color: #aaa; font-size: 12px; min-width: 45px;">100%</span>
                        <button id="zoom-fit" style="padding: 4px 10px; background: #333; border: 1px solid #555; border-radius: 4px; color: #fff; cursor: pointer; font-size: 12px;">Fit</button>
                    </div>

                    <div id="crop-container" style="
                        width: 100%;
                        height: ${previewHeight}px;
                        background: ${currentBgColor};
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
                            <!-- Corner handles (maintain ratio) -->
                            <div class="resize-handle corner" data-dir="nw" style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;background:#0af;cursor:nw-resize;border-radius:2px;"></div>
                            <div class="resize-handle corner" data-dir="ne" style="position:absolute;top:-5px;right:-5px;width:10px;height:10px;background:#0af;cursor:ne-resize;border-radius:2px;"></div>
                            <div class="resize-handle corner" data-dir="sw" style="position:absolute;bottom:-5px;left:-5px;width:10px;height:10px;background:#0af;cursor:sw-resize;border-radius:2px;"></div>
                            <div class="resize-handle corner" data-dir="se" style="position:absolute;bottom:-5px;right:-5px;width:10px;height:10px;background:#0af;cursor:se-resize;border-radius:2px;"></div>

                            <!-- Side handles (free resize) -->
                            <div class="resize-handle side" data-dir="n" style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);width:30px;height:8px;background:#f80;cursor:n-resize;border-radius:2px;"></div>
                            <div class="resize-handle side" data-dir="s" style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:30px;height:8px;background:#f80;cursor:s-resize;border-radius:2px;"></div>
                            <div class="resize-handle side" data-dir="e" style="position:absolute;right:-4px;top:50%;transform:translateY(-50%);width:8px;height:30px;background:#f80;cursor:e-resize;border-radius:2px;"></div>
                            <div class="resize-handle side" data-dir="w" style="position:absolute;left:-4px;top:50%;transform:translateY(-50%);width:8px;height:30px;background:#f80;cursor:w-resize;border-radius:2px;"></div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <label style="color: #aaa;">
                            X:
                            <input type="number" id="crop-x" value="${xWidget?.value || 0}"
                                style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                        </label>
                        <label style="color: #aaa;">
                            Y:
                            <input type="number" id="crop-y" value="${yWidget?.value || 0}"
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
            const ratioButtons = dialog.querySelectorAll(".ratio-btn");
            const bgColorPreview = dialog.querySelector("#bg-color-preview");
            const bgColorInput = dialog.querySelector("#bg-color-input");
            const zoomSlider = dialog.querySelector("#zoom-slider");
            const zoomLabel = dialog.querySelector("#zoom-label");
            const zoomInBtn = dialog.querySelector("#zoom-in");
            const zoomOutBtn = dialog.querySelector("#zoom-out");
            const zoomFitBtn = dialog.querySelector("#zoom-fit");

            let zoomLevel = 100; // percentage
            let baseScale = 1; // scale to fit image in container with padding

            // Update ratio button styles
            const updateRatioButtons = () => {
                ratioButtons.forEach(btn => {
                    const isActive = btn.dataset.ratio === String(currentRatio);
                    btn.style.background = isActive ? "#0af" : "#333";
                    btn.style.color = isActive ? "#000" : "#fff";
                    btn.style.fontWeight = isActive ? "bold" : "normal";
                });
            };

            // Update background color display
            const updateBgColor = (color) => {
                currentBgColor = color;
                bgColorPreview.style.background = color;
                bgColorInput.value = color;
                container.style.background = color;
            };

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

                inputX.value = Math.round((rectLeft - imgOffsetX) / scale);
                inputY.value = Math.round((rectTop - imgOffsetY) / scale);
                inputW.value = Math.max(1, Math.round(rectWidth / scale));
                inputH.value = Math.max(1, Math.round(rectHeight / scale));
            };

            // Apply ratio to current crop area (keep shortest side, adjust longer side)
            const applyRatio = (ratio) => {
                if (ratio === "free") return;

                const currentW = parseInt(inputW.value) || 512;
                const currentH = parseInt(inputH.value) || 512;
                const currentX = parseInt(inputX.value) || 0;
                const currentY = parseInt(inputY.value) || 0;

                // Calculate center
                const centerX = currentX + currentW / 2;
                const centerY = currentY + currentH / 2;

                // Keep shortest side, adjust longer side based on ratio
                let newW, newH;
                if (currentW <= currentH) {
                    // Width is shorter or equal - keep width, adjust height
                    newW = currentW;
                    newH = Math.round(newW / ratio);
                } else {
                    // Height is shorter - keep height, adjust width
                    newH = currentH;
                    newW = Math.round(newH * ratio);
                }

                // Calculate new position (keep center)
                let newX = Math.round(centerX - newW / 2);
                let newY = Math.round(centerY - newH / 2);

                inputX.value = newX;
                inputY.value = newY;
                inputW.value = newW;
                inputH.value = newH;

                updateRectFromInputs();
            };

            // Ratio button click handlers
            ratioButtons.forEach(btn => {
                btn.addEventListener("click", () => {
                    const ratioValue = btn.dataset.ratio;
                    currentRatio = ratioValue === "free" ? "free" : parseFloat(ratioValue);
                    updateRatioButtons();
                    applyRatio(currentRatio);
                });
            });

            // BG color handlers
            bgColorPreview.addEventListener("click", () => {
                showColorPickerDialog(currentBgColor, (hex) => {
                    updateBgColor(hex);
                }, imageUrl);
            });

            bgColorInput.addEventListener("input", (e) => {
                const val = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^#[0-9A-Fa-f]{3}$/.test(val)) {
                    updateBgColor(val.toUpperCase());
                }
            });

            bgColorInput.addEventListener("blur", (e) => {
                let val = e.target.value;
                if (!val.startsWith('#')) val = '#' + val;
                if (/^#[0-9A-Fa-f]{3}$/.test(val)) {
                    val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                }
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    updateBgColor(val.toUpperCase());
                } else {
                    bgColorInput.value = currentBgColor;
                }
            });

            // Update image display based on zoom
            const updateImageDisplay = () => {
                if (!img) return;

                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;

                scale = baseScale * (zoomLevel / 100);

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

            // Zoom controls
            const setZoom = (level) => {
                zoomLevel = Math.max(10, Math.min(200, level));
                zoomSlider.value = zoomLevel;
                zoomLabel.textContent = `${zoomLevel}%`;
                updateImageDisplay();
            };

            zoomSlider.addEventListener("input", (e) => setZoom(parseInt(e.target.value)));
            zoomInBtn.addEventListener("click", () => setZoom(zoomLevel + 10));
            zoomOutBtn.addEventListener("click", () => setZoom(zoomLevel - 10));
            zoomFitBtn.addEventListener("click", () => setZoom(100));

            // Setup image and calculate scale
            if (img) {
                img.onload = () => {
                    imgNaturalWidth = img.naturalWidth;
                    imgNaturalHeight = img.naturalHeight;

                    const containerWidth = container.clientWidth;
                    const containerHeight = container.clientHeight;

                    // Calculate base scale to fit image with padding (80% of container)
                    const padding = 0.8;
                    const scaleX = (containerWidth * padding) / imgNaturalWidth;
                    const scaleY = (containerHeight * padding) / imgNaturalHeight;
                    baseScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1

                    // Apply initial zoom
                    setZoom(100);
                };

                // Trigger load if already cached
                if (img.complete) {
                    img.onload();
                }
            } else {
                // No image - use default scale
                baseScale = 0.5;
                scale = baseScale;
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
            let isCornerResize = false;
            let startX, startY, startLeft, startTop, startWidth, startHeight;
            let dragStartRatio = 1;

            rect.addEventListener("mousedown", (e) => {
                if (e.target.classList.contains("resize-handle")) {
                    isResizing = true;
                    resizeDir = e.target.dataset.dir;
                    isCornerResize = e.target.classList.contains("corner");

                    // If side handle, set ratio to free
                    if (!isCornerResize) {
                        currentRatio = "free";
                        updateRatioButtons();
                    }

                    // Calculate ratio at drag start for corner resize
                    const currentWidth = parseFloat(rect.style.width) || 100;
                    const currentHeight = parseFloat(rect.style.height) || 100;
                    dragStartRatio = currentWidth / currentHeight;
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
                    // No bounds clamping - allow moving beyond image
                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    rect.style.left = `${newLeft}px`;
                    rect.style.top = `${newTop}px`;
                } else if (isResizing) {
                    let newLeft = startLeft;
                    let newTop = startTop;
                    let newWidth = startWidth;
                    let newHeight = startHeight;

                    if (isCornerResize) {
                        // Corner resize - maintain aspect ratio from drag start
                        if (resizeDir === "se") {
                            newWidth = Math.max(20, startWidth + dx);
                            newHeight = newWidth / dragStartRatio;
                        } else if (resizeDir === "sw") {
                            newWidth = Math.max(20, startWidth - dx);
                            newHeight = newWidth / dragStartRatio;
                            newLeft = startLeft - (newWidth - startWidth);
                        } else if (resizeDir === "ne") {
                            newWidth = Math.max(20, startWidth + dx);
                            newHeight = newWidth / dragStartRatio;
                            newTop = startTop - (newHeight - startHeight);
                        } else if (resizeDir === "nw") {
                            newWidth = Math.max(20, startWidth - dx);
                            newHeight = newWidth / dragStartRatio;
                            newLeft = startLeft - (newWidth - startWidth);
                            newTop = startTop - (newHeight - startHeight);
                        }
                    } else {
                        // Side resize - free, no ratio constraint
                        if (resizeDir === "e") {
                            newWidth = Math.max(20, startWidth + dx);
                        } else if (resizeDir === "w") {
                            newWidth = Math.max(20, startWidth - dx);
                            newLeft = startLeft + dx;
                        } else if (resizeDir === "s") {
                            newHeight = Math.max(20, startHeight + dy);
                        } else if (resizeDir === "n") {
                            newHeight = Math.max(20, startHeight - dy);
                            newTop = startTop + dy;
                        }
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
                isCornerResize = false;
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
                if (bgColorWidget) bgColorWidget.value = currentBgColor;
                closeDialog();
                app.graph.setDirtyCanvas(true);
            };
        };
    },
});
