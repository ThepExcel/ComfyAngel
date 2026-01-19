/**
 * Smart Composite Widget for ComfyAngel
 *
 * Provides a visual position picker for compositing images.
 */

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "ComfyAngel.CompositeWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Support SmartCompositeXY only
        if (nodeData.name !== "ComfyAngel_SmartCompositeXY") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            // Find widgets
            const widgets = {
                x: this.widgets.find(w => w.name === "x"),
                y: this.widgets.find(w => w.name === "y"),
                quick_position: this.widgets.find(w => w.name === "quick_position"),
                anchor: this.widgets.find(w => w.name === "anchor"),
                scale: this.widgets.find(w => w.name === "scale_percent" || w.name === "scale"),
                blend_mode: this.widgets.find(w => w.name === "blend_mode"),
                opacity: this.widgets.find(w => w.name === "opacity"),
            };

            // Add position picker button
            const pickerWidget = this.addWidget("button", "Open Position Picker", null, () => {
                this.showPositionPicker(widgets);
            });
            pickerWidget.serialize = false;

            return result;
        };

        // Get connected image info (URL + size + color)
        nodeType.prototype.getConnectedImageInfo = function (inputName) {
            const input = this.inputs?.find(i => i.name === inputName);
            if (!input?.link) {
                return { url: null, width: null, height: null, color: null };
            }

            const link = app.graph.links[input.link];
            if (!link) {
                return { url: null, width: null, height: null, color: null };
            }

            const outputNode = app.graph.getNodeById(link.origin_id);
            if (!outputNode) {
                return { url: null, width: null, height: null, color: null };
            }

            return this.getImageInfoFromNode(outputNode);
        };

        nodeType.prototype.getImageInfoFromNode = function (node, visited = new Set()) {
            if (visited.has(node.id)) {
                return { url: null, width: null, height: null, color: null };
            }
            visited.add(node.id);

            // Check if node has preview images FIRST (from previous execution)
            if (node.imgs && node.imgs.length > 0) {
                const img = node.imgs[node.imageIndex || 0];
                if (img?.src) {
                    return { url: img.src, width: null, height: null, color: null };
                }
            }

            // Fallback: Check for width/height widgets (e.g., SolidColor, EmptyImage)
            // Only used when node hasn't been executed yet
            const widthWidget = node.widgets?.find(w => w.name === "width");
            const heightWidget = node.widgets?.find(w => w.name === "height");
            if (widthWidget && heightWidget) {
                const colorWidget = node.widgets?.find(w => w.name === "color");
                return {
                    url: null,
                    width: widthWidget.value,
                    height: heightWidget.value,
                    color: colorWidget?.value || null
                };
            }

            // Check LoadImage node
            if (node.type === "LoadImage" || node.comfyClass === "LoadImage") {
                const imageWidget = node.widgets?.find(w => w.name === "image");
                if (imageWidget?.value) {
                    const url = `/view?filename=${encodeURIComponent(imageWidget.value)}&type=input&subfolder=`;
                    return { url, width: null, height: null, color: null }; // Size will be loaded from image
                }
            }

            // Check PreviewImage node
            if (node.type === "PreviewImage" || node.comfyClass === "PreviewImage") {
                if (node.images && node.images.length > 0) {
                    const img = node.images[0];
                    const url = `/view?filename=${encodeURIComponent(img.filename)}&type=${img.type}&subfolder=${img.subfolder || ""}`;
                    return { url, width: null, height: null, color: null }; // Size will be loaded from image
                }
            }

            // Check ImageBridge node (ComfyAngel)
            if (node.type === "ComfyAngel_ImageBridge" || node.comfyClass === "ComfyAngel_ImageBridge") {
                if (node.images && node.images.length > 0) {
                    const img = node.images[0];
                    const url = `/view?filename=${encodeURIComponent(img.filename)}&type=${img.type}&subfolder=${img.subfolder || ""}`;
                    return { url, width: null, height: null, color: null };
                }
            }

            // Check SaveImage node
            if (node.type === "SaveImage" || node.comfyClass === "SaveImage") {
                if (node.images && node.images.length > 0) {
                    const img = node.images[0];
                    const url = `/view?filename=${encodeURIComponent(img.filename)}&type=${img.type}&subfolder=${img.subfolder || ""}`;
                    return { url, width: null, height: null, color: null };
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
                                const info = this.getImageInfoFromNode(upstreamNode, visited);
                                if (info.url || (info.width && info.height)) {
                                    return info;
                                }
                            }
                        }
                    }
                }
            }

            return { url: null, width: null, height: null, color: null };
        };

        // Add position picker dialog
        nodeType.prototype.showPositionPicker = function (widgets) {
            const canvasInfo = this.getConnectedImageInfo("canvas");
            const overlayInfo = this.getConnectedImageInfo("overlay");

            // Get current values
            const currentX = widgets.x?.value || 0;
            const currentY = widgets.y?.value || 0;
            const currentQuickPosition = widgets.quick_position?.value || "free";
            const currentAnchor = widgets.anchor?.value || "top_left";
            const currentScale = widgets.scale?.value || 100;
            const currentBlendMode = widgets.blend_mode?.value || "normal";
            const currentOpacity = widgets.opacity?.value || 100;

            // Default dimensions (will be updated from info or loaded images)
            let canvasWidth = canvasInfo.width || 512;
            let canvasHeight = canvasInfo.height || 512;
            let overlayWidth = overlayInfo.width || 100;
            let overlayHeight = overlayInfo.height || 100;

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

            // Load images (only if URLs exist, otherwise use sizes from widgets)
            const loadImages = async () => {
                const loadPromises = [];

                // Load canvas image if URL exists (otherwise use width/height from widgets)
                if (canvasInfo.url) {
                    loadPromises.push(new Promise((resolve) => {
                        const canvasImg = new Image();
                        canvasImg.onload = () => {
                            canvasWidth = canvasImg.naturalWidth;
                            canvasHeight = canvasImg.naturalHeight;
                            resolve();
                        };
                        canvasImg.onerror = () => resolve();
                        canvasImg.src = canvasInfo.url;
                    }));
                }

                // Load overlay image if URL exists (otherwise use width/height from widgets)
                if (overlayInfo.url) {
                    loadPromises.push(new Promise((resolve) => {
                        const overlayImg = new Image();
                        overlayImg.onload = () => {
                            overlayWidth = overlayImg.naturalWidth;
                            overlayHeight = overlayImg.naturalHeight;
                            resolve();
                        };
                        overlayImg.onerror = () => resolve();
                        overlayImg.src = overlayInfo.url;
                    }));
                }

                await Promise.all(loadPromises);

                // Now render the picker
                this.renderPositionPicker(
                    dialog, bgOverlay,
                    canvasInfo, overlayInfo,
                    canvasWidth, canvasHeight,
                    overlayWidth, overlayHeight,
                    { currentX, currentY, currentQuickPosition, currentAnchor, currentScale, currentBlendMode, currentOpacity },
                    widgets
                );
            };

            loadImages();
        };

        nodeType.prototype.renderPositionPicker = function (
            dialog, bgOverlay,
            canvasInfo, overlayInfo,
            canvasWidth, canvasHeight,
            overlayWidth, overlayHeight,
            currentValues,
            widgets
        ) {
            // Extract URL and color from info objects
            const canvasUrl = typeof canvasInfo === 'string' ? canvasInfo : canvasInfo.url;
            const canvasColor = typeof canvasInfo === 'object' ? canvasInfo.color : null;
            const overlayUrl = typeof overlayInfo === 'string' ? overlayInfo : overlayInfo.url;
            const { currentX, currentY, currentQuickPosition, currentAnchor, currentScale, currentBlendMode, currentOpacity } = currentValues;

            // Quick position reference points on canvas
            const quickPosMap = {
                "free": [0, 0],
                "top_left": [0, 0],
                "top_center": [Math.floor(canvasWidth / 2), 0],
                "top_right": [canvasWidth, 0],
                "middle_left": [0, Math.floor(canvasHeight / 2)],
                "center": [Math.floor(canvasWidth / 2), Math.floor(canvasHeight / 2)],
                "middle_right": [canvasWidth, Math.floor(canvasHeight / 2)],
                "bottom_left": [0, canvasHeight],
                "bottom_center": [Math.floor(canvasWidth / 2), canvasHeight],
                "bottom_right": [canvasWidth, canvasHeight],
            };

            // Calculate actual position from quick_position + offset
            const calcActualPosition = (offsetX, offsetY, quickPos) => {
                const [refX, refY] = quickPosMap[quickPos] || [0, 0];
                if (quickPos === "free") {
                    return [offsetX, offsetY]; // Free mode: offset is absolute
                }
                return [refX + offsetX, refY + offsetY];
            };

            // Calculate preview scale
            const maxPreviewSize = 400;
            const scale = Math.min(maxPreviewSize / canvasWidth, maxPreviewSize / canvasHeight);
            const previewWidth = Math.floor(canvasWidth * scale);
            const previewHeight = Math.floor(canvasHeight * scale);

            // Calculate scaled overlay size for preview
            const scaledOverlayW = Math.floor(overlayWidth * (currentScale / 100) * scale);
            const scaledOverlayH = Math.floor(overlayHeight * (currentScale / 100) * scale);

            // Calculate initial actual position from quick_position + offset
            const [initialActualX, initialActualY] = calcActualPosition(currentX, currentY, currentQuickPosition);
            // Preview position (scaled to preview size)
            const initialPreviewX = (initialActualX / canvasWidth) * previewWidth;
            const initialPreviewY = (initialActualY / canvasHeight) * previewHeight;

            // Controls HTML
            const controlsHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <label style="color: #aaa;">
                        X (offset):
                        <input type="number" id="position-x" value="${currentX}"
                            style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                    </label>
                    <label style="color: #aaa;">
                        Y (offset):
                        <input type="number" id="position-y" value="${currentY}"
                            style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                    </label>
                </div>

                <label style="color: #aaa; display: block; margin-bottom: 15px;">
                    Anchor Point (overlay):
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

                <div style="margin-bottom: 15px;">
                    <div style="color: #aaa; margin-bottom: 8px;">Quick Position (reference point on canvas):</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
                        <button class="quick-pos" data-pos="top_left" style="padding: 8px; background: ${currentQuickPosition === 'top_left' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'top_left' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'top_left' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">TL</button>
                        <button class="quick-pos" data-pos="top_center" style="padding: 8px; background: ${currentQuickPosition === 'top_center' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'top_center' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'top_center' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">TC</button>
                        <button class="quick-pos" data-pos="top_right" style="padding: 8px; background: ${currentQuickPosition === 'top_right' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'top_right' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'top_right' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">TR</button>
                        <button class="quick-pos" data-pos="middle_left" style="padding: 8px; background: ${currentQuickPosition === 'middle_left' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'middle_left' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'middle_left' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">ML</button>
                        <button class="quick-pos" data-pos="center" style="padding: 8px; background: ${currentQuickPosition === 'center' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'center' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'center' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">C</button>
                        <button class="quick-pos" data-pos="middle_right" style="padding: 8px; background: ${currentQuickPosition === 'middle_right' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'middle_right' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'middle_right' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">MR</button>
                        <button class="quick-pos" data-pos="bottom_left" style="padding: 8px; background: ${currentQuickPosition === 'bottom_left' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'bottom_left' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'bottom_left' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">BL</button>
                        <button class="quick-pos" data-pos="bottom_center" style="padding: 8px; background: ${currentQuickPosition === 'bottom_center' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'bottom_center' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'bottom_center' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">BC</button>
                        <button class="quick-pos" data-pos="bottom_right" style="padding: 8px; background: ${currentQuickPosition === 'bottom_right' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'bottom_right' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'bottom_right' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">BR</button>
                    </div>
                    <button id="freestyle-btn" data-pos="free" style="width: 100%; margin-top: 8px; padding: 8px; background: ${currentQuickPosition === 'free' ? '#0af' : '#444'}; border: none; color: ${currentQuickPosition === 'free' ? '#000' : '#fff'}; font-weight: ${currentQuickPosition === 'free' ? 'bold' : 'normal'}; border-radius: 4px; cursor: pointer;">✦ Free (absolute position from 0,0)</button>
                </div>
            `;

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
                                ${canvasUrl ? `<img src="${canvasUrl}" style="width: 100%; height: 100%; object-fit: fill; position: absolute; top: 0; left: 0;">` :
                                canvasColor ? `<div style="
                                    position: absolute;
                                    top: 0; left: 0; right: 0; bottom: 0;
                                    background-color: ${canvasColor};
                                "></div>` : `
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
                                <div style="
                                    position: absolute;
                                    top: 50%; left: 50%;
                                    transform: translate(-50%, -50%);
                                    text-align: center;
                                    color: #888;
                                    font-size: 11px;
                                    padding: 10px;
                                ">
                                    <div style="font-weight: bold; margin-bottom: 5px;">No Preview</div>
                                    <div>Queue workflow first<br>to see canvas image</div>
                                </div>`}
                                <div id="overlay-preview" style="
                                    position: absolute;
                                    width: ${scaledOverlayW}px;
                                    height: ${scaledOverlayH}px;
                                    border: 2px dashed #0af;
                                    background: ${overlayUrl ? `url(${overlayUrl})` : 'rgba(0, 170, 255, 0.3)'};
                                    background-size: contain;
                                    background-repeat: no-repeat;
                                    pointer-events: none;
                                    left: ${initialPreviewX}px;
                                    top: ${initialPreviewY}px;
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
                                    left: ${initialPreviewX}px;
                                    top: ${initialPreviewY}px;
                                    z-index: 10;
                                "></div>
                            </div>
                            <div style="margin-top: 10px; font-size: 12px; color: #888;">
                                Canvas: ${canvasWidth}x${canvasHeight} | Overlay: ${overlayWidth}x${overlayHeight}
                            </div>
                        </div>
                        <div style="flex: 1; min-width: 200px;">
                            ${controlsHTML}

                            <label style="color: #aaa; display: block; margin-bottom: 15px;">
                                Scale: <span id="scale-value">${currentScale}%</span>
                                <input type="range" id="position-scale" value="${currentScale}" min="1" max="500" step="1"
                                    style="width: 100%; margin-top: 5px;">
                            </label>

                            <label style="color: #aaa; display: block; margin-bottom: 15px;">
                                Blend Mode:
                                <select id="blend-mode-select" style="
                                    width: 100%;
                                    background: #333;
                                    border: 1px solid #555;
                                    color: #fff;
                                    padding: 8px;
                                    border-radius: 4px;
                                    margin-top: 5px;
                                ">
                                    <option value="normal" ${currentBlendMode === "normal" ? "selected" : ""}>Normal</option>
                                    <option value="multiply" ${currentBlendMode === "multiply" ? "selected" : ""}>Multiply</option>
                                    <option value="screen" ${currentBlendMode === "screen" ? "selected" : ""}>Screen</option>
                                    <option value="overlay" ${currentBlendMode === "overlay" ? "selected" : ""}>Overlay</option>
                                    <option value="soft_light" ${currentBlendMode === "soft_light" ? "selected" : ""}>Soft Light</option>
                                    <option value="hard_light" ${currentBlendMode === "hard_light" ? "selected" : ""}>Hard Light</option>
                                    <option value="difference" ${currentBlendMode === "difference" ? "selected" : ""}>Difference</option>
                                    <option value="add" ${currentBlendMode === "add" ? "selected" : ""}>Add</option>
                                    <option value="subtract" ${currentBlendMode === "subtract" ? "selected" : ""}>Subtract</option>
                                    <option value="darken" ${currentBlendMode === "darken" ? "selected" : ""}>Darken</option>
                                    <option value="lighten" ${currentBlendMode === "lighten" ? "selected" : ""}>Lighten</option>
                                </select>
                            </label>

                            <label style="color: #aaa; display: block; margin-bottom: 15px;">
                                Opacity: <span id="opacity-value">${currentOpacity}%</span>
                                <input type="range" id="opacity-slider" value="${currentOpacity}" min="0" max="100" step="1"
                                    style="width: 100%; margin-top: 5px;">
                            </label>
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
            const scaleInput = dialog.querySelector("#position-scale");
            const scaleValue = dialog.querySelector("#scale-value");
            const blendModeSelect = dialog.querySelector("#blend-mode-select");
            const opacitySlider = dialog.querySelector("#opacity-slider");
            const opacityValue = dialog.querySelector("#opacity-value");

            // Get elements
            const xInput = dialog.querySelector("#position-x");
            const yInput = dialog.querySelector("#position-y");
            const anchorSelect = dialog.querySelector("#position-anchor");

            // Track current quick position
            let selectedQuickPos = currentQuickPosition;

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

            // Blend mode CSS mapping
            const blendModeMap = {
                "normal": "normal",
                "multiply": "multiply",
                "screen": "screen",
                "overlay": "overlay",
                "soft_light": "soft-light",
                "hard_light": "hard-light",
                "difference": "difference",
                "darken": "darken",
                "lighten": "lighten",
                "add": "plus-lighter",
                "subtract": "difference",
            };

            // Update preview
            const updatePreview = () => {
                const scalePercent = parseInt(scaleInput.value) || 100;
                const blendMode = blendModeSelect.value;
                const opacity = parseInt(opacitySlider.value) || 100;

                // Update scale display
                scaleValue.textContent = `${scalePercent}%`;
                opacityValue.textContent = `${opacity}%`;

                // Apply blend mode and opacity to overlay preview
                overlayPreview.style.mixBlendMode = blendModeMap[blendMode] || "normal";
                overlayPreview.style.opacity = opacity / 100;

                // Calculate overlay preview size
                const scaledW = Math.floor(overlayWidth * (scalePercent / 100) * scale);
                const scaledH = Math.floor(overlayHeight * (scalePercent / 100) * scale);

                overlayPreview.style.width = `${scaledW}px`;
                overlayPreview.style.height = `${scaledH}px`;

                const offsetX = parseInt(xInput.value) || 0;
                const offsetY = parseInt(yInput.value) || 0;
                const anchor = anchorSelect.value;

                // Calculate actual position from quick_position + offset
                const [actualX, actualY] = calcActualPosition(offsetX, offsetY, selectedQuickPos);

                // Calculate position with anchor offset for preview
                const [anchorOx, anchorOy] = getAnchorOffset(anchor, scaledW, scaledH);
                const previewX = (actualX / canvasWidth) * previewWidth + anchorOx;
                const previewY = (actualY / canvasHeight) * previewHeight + anchorOy;

                overlayPreview.style.left = `${previewX}px`;
                overlayPreview.style.top = `${previewY}px`;

                // Update marker to show actual position (before anchor offset)
                marker.style.left = `${(actualX / canvasWidth) * previewWidth}px`;
                marker.style.top = `${(actualY / canvasHeight) * previewHeight}px`;
            };

            // Freestyle button and style helper
            const freestyleBtn = dialog.querySelector("#freestyle-btn");
            const updateQuickPosStyles = (quickPos) => {
                // Reset all buttons
                dialog.querySelectorAll(".quick-pos").forEach(b => {
                    b.style.background = "#444";
                    b.style.color = "#fff";
                    b.style.fontWeight = "normal";
                });
                freestyleBtn.style.background = "#444";
                freestyleBtn.style.color = "#fff";
                freestyleBtn.style.fontWeight = "normal";

                // Highlight active button
                if (quickPos === "free") {
                    freestyleBtn.style.background = "#0af";
                    freestyleBtn.style.color = "#000";
                    freestyleBtn.style.fontWeight = "bold";
                } else {
                    const activeBtn = dialog.querySelector(`.quick-pos[data-pos="${quickPos}"]`);
                    if (activeBtn) {
                        activeBtn.style.background = "#0af";
                        activeBtn.style.color = "#000";
                        activeBtn.style.fontWeight = "bold";
                    }
                }
            };

            // Handle canvas click - switch to free mode with absolute position
            canvas.addEventListener("click", (e) => {
                // Ignore clicks on overlay (those are for dragging)
                if (e.target === overlayPreview) return;

                const rect = canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;

                // Calculate absolute position
                const x = Math.round((clickX / previewWidth) * canvasWidth);
                const y = Math.round((clickY / previewHeight) * canvasHeight);

                // Switch to free mode - x,y becomes absolute position
                selectedQuickPos = "free";
                xInput.value = x;
                yInput.value = y;
                updateQuickPosStyles("free");
                updatePreview();
            });

            // Handle input changes
            xInput.addEventListener("input", updatePreview);
            yInput.addEventListener("input", updatePreview);
            anchorSelect.addEventListener("change", updatePreview);

            // Handle quick position buttons - set reference point and reset offset to 0
            dialog.querySelectorAll(".quick-pos").forEach(btn => {
                btn.addEventListener("click", () => {
                    const pos = btn.dataset.pos;
                    selectedQuickPos = pos;
                    // Reset offset to 0 when selecting a quick position
                    xInput.value = 0;
                    yInput.value = 0;
                    updateQuickPosStyles(pos);
                    updatePreview();
                });
            });

            // Handle freestyle button - switch to free mode (absolute position from 0,0)
            freestyleBtn.addEventListener("click", () => {
                // When switching to free, convert current actual position to absolute
                const currentOffsetX = parseInt(xInput.value) || 0;
                const currentOffsetY = parseInt(yInput.value) || 0;
                const [actualX, actualY] = calcActualPosition(currentOffsetX, currentOffsetY, selectedQuickPos);

                selectedQuickPos = "free";
                xInput.value = actualX;
                yInput.value = actualY;
                updateQuickPosStyles("free");
                updatePreview();
            });

            // Handle scale input (both modes)
            scaleInput.addEventListener("input", updatePreview);

            // Handle blend mode and opacity inputs (both modes)
            blendModeSelect.addEventListener("change", updatePreview);
            opacitySlider.addEventListener("input", updatePreview);

            // Handle buttons
            let dragEventCleanup = null;
            const closeDialog = () => {
                // Clean up drag event listeners if any
                if (dragEventCleanup) {
                    dragEventCleanup();
                }
                document.body.removeChild(bgOverlay);
                document.body.removeChild(dialog);
            };

            // Drag functionality for overlay preview
            let isDragging = false;
                let startX, startY, startLeft, startTop;

                overlayPreview.style.cursor = "move";
                overlayPreview.style.pointerEvents = "auto";

                overlayPreview.addEventListener("mousedown", (e) => {
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    startLeft = parseFloat(overlayPreview.style.left) || 0;
                    startTop = parseFloat(overlayPreview.style.top) || 0;
                    e.preventDefault();
                    e.stopPropagation();
                });

                const handleMouseMove = (e) => {
                    if (!isDragging) return;

                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;

                    const newLeft = startLeft + dx;
                    const newTop = startTop + dy;

                    overlayPreview.style.left = `${newLeft}px`;
                    overlayPreview.style.top = `${newTop}px`;

                    // Update marker position (marker is at anchor point)
                    const anchor = anchorSelect.value;
                    const scaledW = parseFloat(overlayPreview.style.width) || 0;
                    const scaledH = parseFloat(overlayPreview.style.height) || 0;
                    const [ox, oy] = getAnchorOffset(anchor, scaledW, scaledH);
                    marker.style.left = `${newLeft - ox}px`;
                    marker.style.top = `${newTop - oy}px`;
                };

                const handleMouseUp = () => {
                    if (!isDragging) return;
                    isDragging = false;

                    // Calculate real coordinates from preview position
                    const previewLeft = parseFloat(overlayPreview.style.left) || 0;
                    const previewTop = parseFloat(overlayPreview.style.top) || 0;
                    const anchor = anchorSelect.value;
                    const scaledW = parseFloat(overlayPreview.style.width) || 0;
                    const scaledH = parseFloat(overlayPreview.style.height) || 0;
                    const [anchorOx, anchorOy] = getAnchorOffset(anchor, scaledW, scaledH);

                    // Calculate anchor point position (marker position) = actual position
                    const markerX = previewLeft - anchorOx;
                    const markerY = previewTop - anchorOy;

                    // Convert to real coordinates (actual position on canvas)
                    const actualX = Math.round((markerX / previewWidth) * canvasWidth);
                    const actualY = Math.round((markerY / previewHeight) * canvasHeight);

                    // Calculate offset from current quick position reference
                    if (selectedQuickPos === "free") {
                        // Free mode: offset is absolute
                        xInput.value = actualX;
                        yInput.value = actualY;
                    } else {
                        // Quick position mode: calculate offset from reference
                        const [refX, refY] = quickPosMap[selectedQuickPos] || [0, 0];
                        xInput.value = actualX - refX;
                        yInput.value = actualY - refY;
                    }

                    updatePreview();
                };

                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);

                // Set cleanup function
                dragEventCleanup = () => {
                    document.removeEventListener("mousemove", handleMouseMove);
                    document.removeEventListener("mouseup", handleMouseUp);
                };

            dialog.querySelector("#position-cancel").onclick = closeDialog;
            bgOverlay.onclick = closeDialog;

            dialog.querySelector("#position-apply").onclick = () => {
                if (widgets.x) widgets.x.value = parseInt(xInput.value) || 0;
                if (widgets.y) widgets.y.value = parseInt(yInput.value) || 0;
                if (widgets.quick_position) widgets.quick_position.value = selectedQuickPos;
                if (widgets.anchor) widgets.anchor.value = anchorSelect.value;
                if (widgets.scale) widgets.scale.value = parseInt(scaleInput.value) || 100;
                if (widgets.blend_mode) widgets.blend_mode.value = blendModeSelect.value;
                if (widgets.opacity) widgets.opacity.value = parseInt(opacitySlider.value) || 100;

                closeDialog();
                app.graph.setDirtyCanvas(true);
            };

            // Initial update
            updatePreview();
        };
    },
});
