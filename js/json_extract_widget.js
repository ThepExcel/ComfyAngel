/**
 * JSON Extract Widget for ComfyAngel
 *
 * Provides JSON preview tree with clickable field paths.
 */

import { app } from "../../scripts/app.js";

// Parse JSON safely
function parseJSON(str) {
    try {
        return { data: JSON.parse(str), error: null };
    } catch (e) {
        return { data: null, error: e.message };
    }
}

// Build field path from tree position
function buildPath(parts) {
    return parts.map((p, i) => {
        if (typeof p === "number") {
            return `[${p}]`;
        }
        return i === 0 ? p : `.${p}`;
    }).join("");
}

// Create tree HTML recursively
function createTreeHTML(data, path = [], depth = 0) {
    if (depth > 10) return "<span class='json-truncated'>...</span>";

    const indent = "  ".repeat(depth);
    let html = "";

    if (data === null) {
        return `<span class="json-null" data-path="${buildPath(path)}">null</span>`;
    }

    if (typeof data === "boolean") {
        return `<span class="json-bool" data-path="${buildPath(path)}">${data}</span>`;
    }

    if (typeof data === "number") {
        return `<span class="json-number" data-path="${buildPath(path)}">${data}</span>`;
    }

    if (typeof data === "string") {
        const escaped = data.replace(/"/g, '\\"').substring(0, 100);
        const truncated = data.length > 100 ? "..." : "";
        return `<span class="json-string" data-path="${buildPath(path)}">"${escaped}${truncated}"</span>`;
    }

    if (Array.isArray(data)) {
        if (data.length === 0) return "[]";
        html += "[\n";
        data.forEach((item, i) => {
            const newPath = [...path, i];
            html += `${indent}  <span class="json-index" data-path="${buildPath(newPath)}">[${i}]</span>: `;
            html += createTreeHTML(item, newPath, depth + 1);
            if (i < data.length - 1) html += ",";
            html += "\n";
        });
        html += `${indent}]`;
        return html;
    }

    if (typeof data === "object") {
        const keys = Object.keys(data);
        if (keys.length === 0) return "{}";
        html += "{\n";
        keys.forEach((key, i) => {
            const newPath = [...path, key];
            const pathStr = buildPath(newPath);
            html += `${indent}  <span class="json-key" data-path="${pathStr}">"${key}"</span>: `;
            html += createTreeHTML(data[key], newPath, depth + 1);
            if (i < keys.length - 1) html += ",";
            html += "\n";
        });
        html += `${indent}}`;
        return html;
    }

    return String(data);
}

// Create popup dialog
function showJSONPreview(jsonString, onSelectPath, nodeTitle) {
    // Remove existing popup
    const existing = document.getElementById("comfyangel-json-popup");
    if (existing) existing.remove();

    const { data, error } = parseJSON(jsonString);

    // Create popup
    const popup = document.createElement("div");
    popup.id = "comfyangel-json-popup";
    popup.innerHTML = `
        <style>
            #comfyangel-json-popup {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #1a1a2e;
                border: 2px solid #4a4a6a;
                border-radius: 8px;
                padding: 0;
                z-index: 10000;
                max-width: 80vw;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            }
            #comfyangel-json-popup .popup-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: #2a2a4a;
                border-bottom: 1px solid #4a4a6a;
                border-radius: 6px 6px 0 0;
            }
            #comfyangel-json-popup .popup-title {
                color: #fff;
                font-weight: bold;
                font-size: 14px;
            }
            #comfyangel-json-popup .popup-close {
                background: #e74c3c;
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
                line-height: 1;
            }
            #comfyangel-json-popup .popup-close:hover {
                background: #c0392b;
            }
            #comfyangel-json-popup .popup-hint {
                padding: 8px 16px;
                background: #2a3a2a;
                color: #8f8;
                font-size: 12px;
                border-bottom: 1px solid #4a4a6a;
            }
            #comfyangel-json-popup .popup-content {
                padding: 16px;
                overflow: auto;
                flex: 1;
                min-height: 200px;
                max-height: 60vh;
            }
            #comfyangel-json-popup .json-tree {
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 13px;
                line-height: 1.5;
                white-space: pre;
                color: #ccc;
            }
            #comfyangel-json-popup .json-key {
                color: #9cdcfe;
                cursor: pointer;
                padding: 1px 3px;
                border-radius: 3px;
            }
            #comfyangel-json-popup .json-key:hover {
                background: #4a4a8a;
                color: #fff;
            }
            #comfyangel-json-popup .json-index {
                color: #b5cea8;
                cursor: pointer;
                padding: 1px 3px;
                border-radius: 3px;
            }
            #comfyangel-json-popup .json-index:hover {
                background: #4a6a4a;
                color: #fff;
            }
            #comfyangel-json-popup .json-string {
                color: #ce9178;
            }
            #comfyangel-json-popup .json-number {
                color: #b5cea8;
            }
            #comfyangel-json-popup .json-bool {
                color: #569cd6;
            }
            #comfyangel-json-popup .json-null {
                color: #569cd6;
            }
            #comfyangel-json-popup .json-error {
                color: #f44;
                padding: 20px;
            }
            #comfyangel-json-popup .selected-path {
                padding: 8px 16px;
                background: #1a2a3a;
                color: #4af;
                font-family: monospace;
                font-size: 12px;
                border-top: 1px solid #4a4a6a;
                min-height: 20px;
            }
        </style>
        <div class="popup-header">
            <span class="popup-title">JSON Preview - ${nodeTitle || "JSON Extract"}</span>
            <button class="popup-close">&times;</button>
        </div>
        <div class="popup-hint">Click on a field name or index to add it to the fields list</div>
        <div class="popup-content">
            <div class="json-tree">${error ? `<span class="json-error">Parse Error: ${error}</span>` : createTreeHTML(data)}</div>
        </div>
        <div class="selected-path" id="selected-path-display">Click a field to see its path</div>
    `;

    document.body.appendChild(popup);

    // Close button
    popup.querySelector(".popup-close").addEventListener("click", () => {
        popup.remove();
    });

    // Click outside to close
    popup.addEventListener("click", (e) => {
        if (e.target === popup) popup.remove();
    });

    // ESC to close
    const escHandler = (e) => {
        if (e.key === "Escape") {
            popup.remove();
            document.removeEventListener("keydown", escHandler);
        }
    };
    document.addEventListener("keydown", escHandler);

    // Click on field to add path
    popup.querySelectorAll("[data-path]").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            const path = el.getAttribute("data-path");
            if (path) {
                // Show selected path
                document.getElementById("selected-path-display").textContent = `Added: ${path}`;

                // Call callback to add to fields
                if (onSelectPath) {
                    onSelectPath(path);
                }
            }
        });

        // Hover to show path
        el.addEventListener("mouseenter", () => {
            const path = el.getAttribute("data-path");
            if (path) {
                document.getElementById("selected-path-display").textContent = `Path: ${path}`;
            }
        });
    });
}

app.registerExtension({
    name: "ComfyAngel.JSONExtractWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_JSONExtract") {
            return;
        }

        // Store last executed JSON for browsing
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            // Cache the JSON from execution result
            if (message?.json_cache?.[0]) {
                this._cachedJson = message.json_cache[0];
            }
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            const node = this;

            const jsonWidget = this.widgets.find(w => w.name === "json_string");
            const fieldsWidget = this.widgets.find(w => w.name === "fields");

            if (!jsonWidget || !fieldsWidget) return result;

            // Add "Browse JSON" button
            const browseBtn = this.addWidget("button", "Browse JSON Fields", null, () => {
                // Try to get JSON from widget value first
                let jsonStr = jsonWidget.value || "";

                // If empty, try cached value from last execution
                if (!jsonStr.trim() && node._cachedJson) {
                    jsonStr = node._cachedJson;
                }

                // If still empty, try to get from connected node's widget
                if (!jsonStr.trim()) {
                    const jsonInput = node.inputs?.find(i => i.name === "json_string");
                    if (jsonInput && jsonInput.link != null) {
                        const linkInfo = app.graph.links[jsonInput.link];
                        if (linkInfo) {
                            const sourceNode = app.graph.getNodeById(linkInfo.origin_id);
                            if (sourceNode) {
                                // Try common widget names for string outputs
                                const widgetNames = ["text", "string", "metadata_raw", "metadata", "json_string", "output"];
                                for (const wname of widgetNames) {
                                    const w = sourceNode.widgets?.find(w => w.name === wname);
                                    if (w && w.value) {
                                        jsonStr = w.value;
                                        break;
                                    }
                                }

                                // Try source node's cached JSON
                                if (!jsonStr && sourceNode._cachedJson) {
                                    jsonStr = sourceNode._cachedJson;
                                }
                            }
                        }
                    }
                }

                if (!jsonStr.trim()) {
                    alert("No JSON data found.\n\nPlease either:\n1. Paste JSON directly into the json_string field, or\n2. Run the workflow once (Queue Prompt) to load data from connected nodes");
                    return;
                }

                showJSONPreview(jsonStr, (path) => {
                    // Add path to fields widget
                    const currentFields = fieldsWidget.value || "";
                    const delimiter = "\n"; // Default to newline

                    if (currentFields.trim()) {
                        // Check if path already exists
                        const existing = currentFields.split(delimiter).map(f => f.trim());
                        if (!existing.includes(path)) {
                            fieldsWidget.value = currentFields + delimiter + path;
                        }
                    } else {
                        fieldsWidget.value = path;
                    }

                    // Trigger update
                    if (fieldsWidget.callback) {
                        fieldsWidget.callback(fieldsWidget.value);
                    }
                    app.graph.setDirtyCanvas(true);
                }, node.title);
            });
            browseBtn.serialize = false;

            return result;
        };
    },
});
