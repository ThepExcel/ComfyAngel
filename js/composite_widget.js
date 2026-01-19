/**
 * Smart Composite Widget for ComfyAngel
 *
 * Provides a visual position picker for compositing images.
 */

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "ComfyAngel.CompositeWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Support both SmartCompositeXY and SmartCompositeAlign
        const supportedNodes = [
            "ComfyAngel_SmartCompositeXY",
            "ComfyAngel_SmartCompositeAlign"
        ];

        if (!supportedNodes.includes(nodeData.name)) {
            return;
        }

        const isAlignMode = nodeData.name === "ComfyAngel_SmartCompositeAlign";

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            // Store mode on node instance
            this.compositeMode = isAlignMode ? "align" : "xy";

            // Find appropriate widgets based on mode
            let widgets = {};
            if (isAlignMode) {
                widgets = {
                    alignment: this.widgets.find(w => w.name === "alignment"),
                    margin_x: this.widgets.find(w => w.name === "margin_x"),
                    margin_y: this.widgets.find(w => w.name === "margin_y"),
                    scale: this.widgets.find(w => w.name === "scale_percent" || w.name === "scale"),
                    blend_mode: this.widgets.find(w => w.name === "blend_mode"),
                    opacity: this.widgets.find(w => w.name === "opacity"),
                };
            } else {
                widgets = {
                    x: this.widgets.find(w => w.name === "x"),
                    y: this.widgets.find(w => w.name === "y"),
                    anchor: this.widgets.find(w => w.name === "anchor"),
                    scale: this.widgets.find(w => w.name === "scale_percent" || w.name === "scale"),
                    blend_mode: this.widgets.find(w => w.name === "blend_mode"),
                    opacity: this.widgets.find(w => w.name === "opacity"),
                };
            }

            // Add position picker button
            const pickerWidget = this.addWidget("button", "Open Position Picker", null, () => {
                this.showPositionPicker(widgets);
            });
            pickerWidget.serialize = false;

            return result;
        };

        // Helper to calculate alignment position
        nodeType.prototype.calcAlignmentPosition = function (alignment, canvasW, canvasH, overlayW, overlayH, marginX, marginY) {
            const positions = {
                "top_left": [marginX, marginY],
                "top_center": [(canvasW - overlayW) / 2 + marginX, marginY],
                "top_right": [canvasW - overlayW - marginX, marginY],
                "middle_left": [marginX, (canvasH - overlayH) / 2 + marginY],
                "center": [(canvasW - overlayW) / 2 + marginX, (canvasH - overlayH) / 2 + marginY],
                "middle_right": [canvasW - overlayW - marginX, (canvasH - overlayH) / 2 + marginY],
                "bottom_left": [marginX, canvasH - overlayH - marginY],
                "bottom_center": [(canvasW - overlayW) / 2 + marginX, canvasH - overlayH - marginY],
                "bottom_right": [canvasW - overlayW - marginX, canvasH - overlayH - marginY],
            };
            return positions[alignment] || [0, 0];
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
            const mode = this.compositeMode;

            // Get current values based on mode
            let currentX, currentY, currentAnchor, currentMarginX, currentMarginY, currentAlignment;
            const currentScale = widgets.scale?.value || 100;
            const currentBlendMode = widgets.blend_mode?.value || "normal";
            const currentOpacity = widgets.opacity?.value || 100;

            if (mode === "align") {
                currentAlignment = widgets.alignment?.value || "center";
                currentMarginX = widgets.margin_x?.value || 0;
                currentMarginY = widgets.margin_y?.value || 0;
            } else {
                currentX = widgets.x?.value || 0;
                currentY = widgets.y?.value || 0;
                currentAnchor = widgets.anchor?.value || "top_left";
            }

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
                    mode,
                    { currentX, currentY, currentAnchor, currentMarginX, currentMarginY, currentAlignment, currentScale, currentBlendMode, currentOpacity },
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
            mode,
            currentValues,
            widgets
        ) {
            // Extract URL and color from info objects
            const canvasUrl = typeof canvasInfo === 'string' ? canvasInfo : canvasInfo.url;
            const canvasColor = typeof canvasInfo === 'object' ? canvasInfo.color : null;
            const overlayUrl = typeof overlayInfo === 'string' ? overlayInfo : overlayInfo.url;
            const { currentX, currentY, currentAnchor, currentMarginX, currentMarginY, currentAlignment, currentScale, currentBlendMode, currentOpacity } = currentValues;

            // Calculate preview scale
            const maxPreviewSize = 400;
            const scale = Math.min(maxPreviewSize / canvasWidth, maxPreviewSize / canvasHeight);
            const previewWidth = Math.floor(canvasWidth * scale);
            const previewHeight = Math.floor(canvasHeight * scale);

            // Calculate scaled overlay size for preview
            const scaledOverlayW = Math.floor(overlayWidth * (currentScale / 100) * scale);
            const scaledOverlayH = Math.floor(overlayHeight * (currentScale / 100) * scale);

            // Calculate initial position based on mode
            let initialX, initialY;
            if (mode === "align") {
                // Calculate position from alignment
                const pos = this.calcAlignmentPosition(
                    currentAlignment, canvasWidth, canvasHeight,
                    overlayWidth * (currentScale / 100), overlayHeight * (currentScale / 100),
                    currentMarginX, currentMarginY
                );
                initialX = pos[0];
                initialY = pos[1];
            } else {
                initialX = currentX;
                initialY = currentY;
            }

            // Generate controls HTML based on mode
            const controlsHTML = mode === "align" ? `
                <div style="margin-bottom: 15px;">
                    <div style="color: #aaa; margin-bottom: 8px;">Alignment:</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
                        <button class="align-btn" data-align="top_left" style="padding: 8px; background: ${currentAlignment === "top_left" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "top_left" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "top_left" ? "bold" : "normal"};">TL</button>
                        <button class="align-btn" data-align="top_center" style="padding: 8px; background: ${currentAlignment === "top_center" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "top_center" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "top_center" ? "bold" : "normal"};">TC</button>
                        <button class="align-btn" data-align="top_right" style="padding: 8px; background: ${currentAlignment === "top_right" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "top_right" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "top_right" ? "bold" : "normal"};">TR</button>
                        <button class="align-btn" data-align="middle_left" style="padding: 8px; background: ${currentAlignment === "middle_left" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "middle_left" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "middle_left" ? "bold" : "normal"};">ML</button>
                        <button class="align-btn" data-align="center" style="padding: 8px; background: ${currentAlignment === "center" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "center" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "center" ? "bold" : "normal"};">C</button>
                        <button class="align-btn" data-align="middle_right" style="padding: 8px; background: ${currentAlignment === "middle_right" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "middle_right" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "middle_right" ? "bold" : "normal"};">MR</button>
                        <button class="align-btn" data-align="bottom_left" style="padding: 8px; background: ${currentAlignment === "bottom_left" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "bottom_left" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "bottom_left" ? "bold" : "normal"};">BL</button>
                        <button class="align-btn" data-align="bottom_center" style="padding: 8px; background: ${currentAlignment === "bottom_center" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "bottom_center" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "bottom_center" ? "bold" : "normal"};">BC</button>
                        <button class="align-btn" data-align="bottom_right" style="padding: 8px; background: ${currentAlignment === "bottom_right" ? "#0af" : "#444"}; border: none; color: ${currentAlignment === "bottom_right" ? "#000" : "#fff"}; border-radius: 4px; cursor: pointer; font-weight: ${currentAlignment === "bottom_right" ? "bold" : "normal"};">BR</button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <label style="color: #aaa;">
                        Margin X:
                        <input type="number" id="position-margin-x" value="${currentMarginX}"
                            style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                    </label>
                    <label style="color: #aaa;">
                        Margin Y:
                        <input type="number" id="position-margin-y" value="${currentMarginY}"
                            style="width: 100%; background: #333; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box;">
                    </label>
                </div>
            ` : `
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

                <div style="margin-bottom: 15px;">
                    <div style="color: #aaa; margin-bottom: 8px;">Quick Positions:</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
                        <button class="quick-pos" data-x="0" data-y="0" data-anchor="top_left" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TL</button>
                        <button class="quick-pos" data-x="${Math.floor(canvasWidth/2)}" data-y="0" data-anchor="top_center" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TC</button>
                        <button class="quick-pos" data-x="${canvasWidth}" data-y="0" data-anchor="top_right" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">TR</button>
                        <button class="quick-pos" data-x="0" data-y="${Math.floor(canvasHeight/2)}" data-anchor="middle_left" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">ML</button>
                        <button class="quick-pos" data-x="${Math.floor(canvasWidth/2)}" data-y="${Math.floor(canvasHeight/2)}" data-anchor="center" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">C</button>
                        <button class="quick-pos" data-x="${canvasWidth}" data-y="${Math.floor(canvasHeight/2)}" data-anchor="middle_right" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">MR</button>
                        <button class="quick-pos" data-x="0" data-y="${canvasHeight}" data-anchor="bottom_left" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BL</button>
                        <button class="quick-pos" data-x="${Math.floor(canvasWidth/2)}" data-y="${canvasHeight}" data-anchor="bottom_center" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BC</button>
                        <button class="quick-pos" data-x="${canvasWidth}" data-y="${canvasHeight}" data-anchor="bottom_right" style="padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">BR</button>
                    </div>
                    <button id="freestyle-btn" style="width: 100%; margin-top: 8px; padding: 8px; background: #0af; border: none; color: #000; border-radius: 4px; cursor: pointer; font-weight: bold;">✦ Freestyle (drag to position)</button>
                </div>
            `;

            dialog.innerHTML = `
                <div style="color: #fff; font-family: sans-serif;">
                    <h3 style="margin: 0 0 15px 0;">Smart Composite - ${mode === "align" ? "Alignment" : "Position"} Picker</h3>
                    <div style="display: flex; gap: 20px;">
                        <div>
                            <div id="composite-canvas" style="
                                width: ${previewWidth}px;
                                height: ${previewHeight}px;
                                background: #333;
                                border: 1px solid #555;
                                position: relative;
                                cursor: ${mode === "xy" ? "crosshair" : "default"};
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
                                    left: ${(initialX / canvasWidth) * previewWidth}px;
                                    top: ${(initialY / canvasHeight) * previewHeight}px;
                                "></div>
                                ${mode === "xy" ? `
                                <div id="position-marker" style="
                                    position: absolute;
                                    width: 12px;
                                    height: 12px;
                                    border: 2px solid #f00;
                                    border-radius: 50%;
                                    background: rgba(255, 0, 0, 0.5);
                                    transform: translate(-50%, -50%);
                                    pointer-events: none;
                                    left: ${(initialX / canvasWidth) * previewWidth}px;
                                    top: ${(initialY / canvasHeight) * previewHeight}px;
                                    z-index: 10;
                                "></div>
                                ` : ""}
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

            // Get mode-specific elements
            let xInput, yInput, anchorSelect, marginXInput, marginYInput, currentAlignmentValue;
            if (mode === "align") {
                marginXInput = dialog.querySelector("#position-margin-x");
                marginYInput = dialog.querySelector("#position-margin-y");
                currentAlignmentValue = currentAlignment;
            } else {
                xInput = dialog.querySelector("#position-x");
                yInput = dialog.querySelector("#position-y");
                anchorSelect = dialog.querySelector("#position-anchor");
            }

            // Calculate anchor offset for overlay preview (XY mode)
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

            // Calculate position from alignment (Align mode)
            const calcAlignmentPosition = (alignment, canvasW, canvasH, overlayW, overlayH, marginX, marginY) => {
                const positions = {
                    "top_left": [marginX, marginY],
                    "top_center": [(canvasW - overlayW) / 2 + marginX, marginY],
                    "top_right": [canvasW - overlayW - marginX, marginY],
                    "middle_left": [marginX, (canvasH - overlayH) / 2 + marginY],
                    "center": [(canvasW - overlayW) / 2 + marginX, (canvasH - overlayH) / 2 + marginY],
                    "middle_right": [canvasW - overlayW - marginX, (canvasH - overlayH) / 2 + marginY],
                    "bottom_left": [marginX, canvasH - overlayH - marginY],
                    "bottom_center": [(canvasW - overlayW) / 2 + marginX, canvasH - overlayH - marginY],
                    "bottom_right": [canvasW - overlayW - marginX, canvasH - overlayH - marginY],
                };
                return positions[alignment] || [0, 0];
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

                let x, y;

                if (mode === "align") {
                    // Calculate position from alignment
                    const marginX = parseInt(marginXInput.value) || 0;
                    const marginY = parseInt(marginYInput.value) || 0;
                    const actualOverlayW = overlayWidth * (scalePercent / 100);
                    const actualOverlayH = overlayHeight * (scalePercent / 100);
                    [x, y] = calcAlignmentPosition(
                        currentAlignmentValue,
                        canvasWidth, canvasHeight,
                        actualOverlayW, actualOverlayH,
                        marginX, marginY
                    );

                    // Position overlay (top-left corner)
                    const previewX = (x / canvasWidth) * previewWidth;
                    const previewY = (y / canvasHeight) * previewHeight;
                    overlayPreview.style.left = `${previewX}px`;
                    overlayPreview.style.top = `${previewY}px`;
                } else {
                    // XY mode
                    x = parseInt(xInput.value) || 0;
                    y = parseInt(yInput.value) || 0;
                    const anchor = anchorSelect.value;

                    // Calculate position with anchor offset
                    const [ox, oy] = getAnchorOffset(anchor, scaledW, scaledH);
                    const previewX = (x / canvasWidth) * previewWidth + ox;
                    const previewY = (y / canvasHeight) * previewHeight + oy;

                    overlayPreview.style.left = `${previewX}px`;
                    overlayPreview.style.top = `${previewY}px`;

                    // Update marker
                    marker.style.left = `${(x / canvasWidth) * previewWidth}px`;
                    marker.style.top = `${(y / canvasHeight) * previewHeight}px`;
                }
            };

            // Freestyle button and style helper (XY mode only, but declared outside for scope)
            const freestyleBtn = mode === "xy" ? dialog.querySelector("#freestyle-btn") : null;
            const updateQuickPosStyles = (activeBtn) => {
                if (mode !== "xy" || !freestyleBtn) return;
                dialog.querySelectorAll(".quick-pos").forEach(b => {
                    b.style.background = "#444";
                    b.style.color = "#fff";
                    b.style.fontWeight = "normal";
                });
                if (activeBtn) {
                    activeBtn.style.background = "#0af";
                    activeBtn.style.color = "#000";
                    activeBtn.style.fontWeight = "bold";
                    freestyleBtn.style.background = "#444";
                    freestyleBtn.style.color = "#fff";
                    freestyleBtn.style.fontWeight = "normal";
                } else {
                    // Freestyle mode
                    freestyleBtn.style.background = "#0af";
                    freestyleBtn.style.color = "#000";
                    freestyleBtn.style.fontWeight = "bold";
                }
            };

            // Handle canvas click (XY mode only)
            if (mode === "xy") {
                canvas.addEventListener("click", (e) => {
                    // Ignore clicks on overlay (those are for dragging)
                    if (e.target === overlayPreview) return;

                    const rect = canvas.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const clickY = e.clientY - rect.top;

                    const x = Math.round((clickX / previewWidth) * canvasWidth);
                    const y = Math.round((clickY / previewHeight) * canvasHeight);

                    xInput.value = x;
                    yInput.value = y;
                    updateQuickPosStyles(null); // Switch to freestyle
                    updatePreview();
                });

                // Handle input changes (XY mode)
                xInput.addEventListener("input", updatePreview);
                yInput.addEventListener("input", updatePreview);
                anchorSelect.addEventListener("change", updatePreview);

                // Handle quick position buttons (XY mode)
                dialog.querySelectorAll(".quick-pos").forEach(btn => {
                    btn.addEventListener("click", () => {
                        xInput.value = btn.dataset.x;
                        yInput.value = btn.dataset.y;
                        anchorSelect.value = btn.dataset.anchor;
                        updateQuickPosStyles(btn);
                        updatePreview();
                    });
                });

                // Handle freestyle button
                freestyleBtn.addEventListener("click", () => {
                    updateQuickPosStyles(null); // Switch to freestyle mode
                });
            } else {
                // Handle alignment buttons (Align mode)
                dialog.querySelectorAll(".align-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        // Update button styles
                        dialog.querySelectorAll(".align-btn").forEach(b => {
                            b.style.background = "#444";
                            b.style.color = "#fff";
                            b.style.fontWeight = "normal";
                        });
                        btn.style.background = "#0af";
                        btn.style.color = "#000";
                        btn.style.fontWeight = "bold";

                        // Update alignment value
                        currentAlignmentValue = btn.dataset.align;
                        updatePreview();
                    });
                });

                // Handle margin inputs (Align mode)
                marginXInput.addEventListener("input", updatePreview);
                marginYInput.addEventListener("input", updatePreview);
            }

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

            // Drag functionality for overlay preview (XY mode only)
            if (mode === "xy") {
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
                    const [ox, oy] = getAnchorOffset(anchor, scaledW, scaledH);

                    // Calculate anchor point position (marker position)
                    const markerX = previewLeft - ox;
                    const markerY = previewTop - oy;

                    // Convert to real coordinates
                    const realX = Math.round((markerX / previewWidth) * canvasWidth);
                    const realY = Math.round((markerY / previewHeight) * canvasHeight);

                    xInput.value = realX;
                    yInput.value = realY;

                    // Switch to freestyle mode after dragging
                    updateQuickPosStyles(null);
                };

                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);

                // Set cleanup function
                dragEventCleanup = () => {
                    document.removeEventListener("mousemove", handleMouseMove);
                    document.removeEventListener("mouseup", handleMouseUp);
                };
            }

            dialog.querySelector("#position-cancel").onclick = closeDialog;
            bgOverlay.onclick = closeDialog;

            dialog.querySelector("#position-apply").onclick = () => {
                if (mode === "align") {
                    if (widgets.alignment) widgets.alignment.value = currentAlignmentValue;
                    if (widgets.margin_x) widgets.margin_x.value = parseInt(marginXInput.value) || 0;
                    if (widgets.margin_y) widgets.margin_y.value = parseInt(marginYInput.value) || 0;
                    if (widgets.scale) widgets.scale.value = parseInt(scaleInput.value) || 100;
                } else {
                    if (widgets.x) widgets.x.value = parseInt(xInput.value) || 0;
                    if (widgets.y) widgets.y.value = parseInt(yInput.value) || 0;
                    if (widgets.anchor) widgets.anchor.value = anchorSelect.value;
                    if (widgets.scale) widgets.scale.value = parseInt(scaleInput.value) || 100;
                }

                // Apply blend mode and opacity (both modes)
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
