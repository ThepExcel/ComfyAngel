/**
 * Text Preview Widget for ComfyAngel
 *
 * Shows combined text preview in TextCombine node after execution.
 * Based on pythongosssss's ShowText implementation.
 */

import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

app.registerExtension({
    name: "ComfyAngel.TextPreviewWidget",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyAngel_TextCombine") {
            return;
        }

        // Function to populate text widgets
        function populate(text) {
            // Remove existing preview widgets (keep original widgets)
            if (this.widgets) {
                // Find index where preview widgets start
                const previewStart = this.widgets.findIndex(w => w.name?.startsWith("preview_"));
                if (previewStart !== -1) {
                    // Remove preview widgets
                    for (let i = previewStart; i < this.widgets.length; i++) {
                        this.widgets[i].onRemove?.();
                    }
                    this.widgets.length = previewStart;
                }
            }

            // Handle text input
            let textArray = text;
            if (!Array.isArray(textArray)) {
                textArray = [textArray];
            }

            // Create widgets for each text item
            for (const t of textArray) {
                if (t === null || t === undefined) continue;

                const textValue = String(t);

                // Create a STRING widget for display
                const w = ComfyWidgets["STRING"](
                    this,
                    "preview_" + (this.widgets?.length ?? 0),
                    ["STRING", { multiline: true }],
                    app
                ).widget;

                // Make it read-only and styled as preview
                w.inputEl.readOnly = true;
                w.inputEl.style.opacity = "0.8";
                w.inputEl.style.backgroundColor = "#1a2a1a";
                w.inputEl.style.borderColor = "#4a4";
                w.inputEl.style.color = "#fff";
                w.value = textValue;

                // Auto-resize based on content
                const lines = textValue.split("\n").length;
                const minHeight = Math.min(Math.max(lines * 20, 60), 200);
                w.inputEl.style.height = minHeight + "px";
            }

            // Resize node to fit
            requestAnimationFrame(() => {
                const sz = this.computeSize();
                if (sz[0] < this.size[0]) {
                    sz[0] = this.size[0];
                }
                if (sz[1] < this.size[1]) {
                    sz[1] = this.size[1];
                }
                this.onResize?.(sz);
                app.graph.setDirtyCanvas(true, false);
            });
        }

        // Handle execution result
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);

            if (message?.text) {
                populate.call(this, message.text);
            }
        };

        // Handle node configuration (restore preview on load)
        const VALUES = Symbol();
        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function () {
            this[VALUES] = arguments[0]?.widgets_values;
            return configure?.apply(this, arguments);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            const widgets_values = this[VALUES];
            if (widgets_values?.length) {
                // Check if there's preview text saved
                const previewValues = widgets_values.filter(v =>
                    typeof v === "string" && v.length > 0
                );
                if (previewValues.length > 0) {
                    requestAnimationFrame(() => {
                        // Don't restore old preview - let user re-run to see results
                    });
                }
            }
        };
    },
});
