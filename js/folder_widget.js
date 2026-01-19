/**
 * Folder Path Widget for ComfyAngel
 *
 * Provides folder path validation, image count preview, and path history.
 */

import { app } from "../../scripts/app.js";

const STORAGE_KEY = "comfyangel_folder_history";
const MAX_HISTORY = 10;

// Load folder history from localStorage
function loadFolderHistory() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Failed to load folder history:", e);
        return [];
    }
}

// Save folder to history
function saveFolderToHistory(folderPath) {
    if (!folderPath || folderPath.trim() === "") return;

    try {
        let history = loadFolderHistory();
        // Remove if already exists
        history = history.filter(p => p !== folderPath);
        // Add to front
        history.unshift(folderPath);
        // Limit size
        history = history.slice(0, MAX_HISTORY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
        console.error("Failed to save folder history:", e);
    }
}

// Validate folder and count images
async function validateFolder(folderPath, includeSubdirs = false) {
    if (!folderPath || folderPath.trim() === "") {
        return { valid: false, message: "Path is empty", count: 0 };
    }

    try {
        // Send validation request to backend
        const response = await fetch("/comfyangel/validate_folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                folder_path: folderPath,
                include_subdirs: includeSubdirs
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.valid) {
                return {
                    valid: true,
                    message: `Found ${data.count} image(s)`,
                    count: data.count
                };
            } else {
                return {
                    valid: false,
                    message: data.message || "Invalid folder",
                    count: 0
                };
            }
        } else {
            return {
                valid: false,
                message: "Validation request failed",
                count: 0
            };
        }
    } catch (e) {
        console.error("Folder validation error:", e);
        return {
            valid: false,
            message: "Could not validate folder",
            count: 0
        };
    }
}


app.registerExtension({
    name: "ComfyAngel.FolderWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_LoadAllImagesFromFolder") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            const node = this;

            const folderWidget = this.widgets.find(w => w.name === "folder_path");
            const includeSubdirsWidget = this.widgets.find(w => w.name === "include_subdirs");

            if (!folderWidget) return result;

            // Add validation button
            const validateBtn = this.addWidget("button", "Validate Folder", null, async () => {
                const path = folderWidget.value;
                const includeSubdirs = includeSubdirsWidget?.value || false;
                const result = await validateFolder(path, includeSubdirs);

                // Update validation widget
                if (validationWidget) {
                    validationWidget.validationResult = result;
                    app.graph.setDirtyCanvas(true);
                }

                // Save to history if valid
                if (result.valid) {
                    saveFolderToHistory(path);
                }
            });
            validateBtn.serialize = false;

            // Add validation status display widget
            const validationWidget = this.addCustomWidget({
                name: "folder_validation",
                type: "folder_validation",
                validationResult: null,
                draw: function(ctx, node, width, y, height) {
                    if (!this.validationResult) {
                        ctx.fillStyle = "#666";
                        ctx.font = "11px sans-serif";
                        ctx.fillText("Click 'Validate Folder' to check path", 15, y + 12);
                        return;
                    }

                    const result = this.validationResult;
                    const margin = 15;
                    const boxHeight = 30;
                    const boxWidth = width - margin * 2;

                    // Background
                    ctx.fillStyle = result.valid ? "rgba(0, 170, 0, 0.2)" : "rgba(255, 80, 80, 0.2)";
                    ctx.fillRect(margin, y, boxWidth, boxHeight);

                    // Border
                    ctx.strokeStyle = result.valid ? "#0a0" : "#f50";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(margin, y, boxWidth, boxHeight);

                    // Status icon
                    ctx.font = "bold 14px sans-serif";
                    ctx.fillStyle = result.valid ? "#0f0" : "#f50";
                    ctx.fillText(result.valid ? "✓" : "✗", margin + 8, y + 20);

                    // Message
                    ctx.font = "11px sans-serif";
                    ctx.fillStyle = result.valid ? "#afa" : "#faa";
                    ctx.fillText(result.message, margin + 28, y + 20);
                },
                computeSize: function() {
                    return [0, 35];
                },
                serialize: false
            });

            // Add folder history dropdown widget
            const historyWidget = this.addCustomWidget({
                name: "folder_history",
                type: "folder_history",
                value: "",
                draw: function(ctx, node, width, y, height) {
                    const history = loadFolderHistory();

                    if (history.length === 0) {
                        ctx.fillStyle = "#666";
                        ctx.font = "11px sans-serif";
                        ctx.fillText("No recent folders", 15, y + 12);
                        return;
                    }

                    // Draw dropdown hint
                    ctx.fillStyle = "#888";
                    ctx.font = "11px sans-serif";
                    ctx.fillText("Recent folders (click below to select):", 15, y + 12);

                    // Draw clickable history items
                    let itemY = y + 28;
                    const itemHeight = 20;
                    const maxItems = 3; // Show first 3

                    for (let i = 0; i < Math.min(maxItems, history.length); i++) {
                        const path = history[i];
                        const isHovered = this.hoveredIndex === i;

                        // Background
                        if (isHovered) {
                            ctx.fillStyle = "rgba(0, 170, 255, 0.3)";
                            ctx.fillRect(15, itemY - 14, width - 30, itemHeight);
                        }

                        // Text
                        ctx.fillStyle = isHovered ? "#0af" : "#aaa";
                        ctx.font = "10px monospace";
                        const shortPath = path.length > 50 ? "..." + path.slice(-47) : path;
                        ctx.fillText(shortPath, 20, itemY);

                        itemY += itemHeight;
                    }

                    if (history.length > maxItems) {
                        ctx.fillStyle = "#666";
                        ctx.font = "10px sans-serif";
                        ctx.fillText(`(+${history.length - maxItems} more)`, 20, itemY);
                    }
                },
                mouse: function(event, pos, node) {
                    const history = loadFolderHistory();
                    if (history.length === 0) return;

                    const itemHeight = 20;
                    const startY = 28;
                    const maxItems = 3;

                    // Calculate hovered index
                    if (pos[1] >= startY && pos[1] < startY + itemHeight * Math.min(maxItems, history.length)) {
                        const index = Math.floor((pos[1] - startY) / itemHeight);
                        this.hoveredIndex = index;

                        // On click
                        if (event.type === "pointerdown" && index < history.length) {
                            const selectedPath = history[index];
                            if (folderWidget) {
                                folderWidget.value = selectedPath;
                                // Trigger validation
                                const includeSubdirs = includeSubdirsWidget?.value || false;
                                validateFolder(selectedPath, includeSubdirs).then(result => {
                                    validationWidget.validationResult = result;
                                    app.graph.setDirtyCanvas(true);
                                });
                            }
                        }

                        return true;
                    } else {
                        this.hoveredIndex = -1;
                    }
                    return false;
                },
                hoveredIndex: -1,
                computeSize: function() {
                    const history = loadFolderHistory();
                    if (history.length === 0) return [0, 20];
                    const itemCount = Math.min(3, history.length);
                    const extraHeight = history.length > 3 ? 15 : 0;
                    return [0, 28 + itemCount * 20 + extraHeight];
                },
                serialize: false
            });

            // Auto-validate on load if path is set
            setTimeout(async () => {
                if (folderWidget.value && folderWidget.value.trim() !== "") {
                    const includeSubdirs = includeSubdirsWidget?.value || false;
                    const result = await validateFolder(folderWidget.value, includeSubdirs);
                    validationWidget.validationResult = result;
                    app.graph.setDirtyCanvas(true);
                }
            }, 500);

            return result;
        };
    },
});
