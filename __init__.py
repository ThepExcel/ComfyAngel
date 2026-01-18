"""
ComfyAngel - Parameter Overlay & Visual Widget nodes for ComfyUI

Supports both V1 (Legacy) and V3 (Modern) API.
"""

# Check for V3 API availability
try:
    from comfy_api.latest import ComfyExtension, io
    HAS_V3 = True
except ImportError:
    HAS_V3 = False

# Import overlay nodes
from .nodes.overlay_nodes import (
    LoadImageWithMetadata,
    ParameterParser,
    ParameterOverlay,
    CustomTextOverlay,
    NODE_CLASS_MAPPINGS as OVERLAY_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as OVERLAY_DISPLAY_MAPPINGS,
)

# Import widget nodes
from .nodes.widget_nodes import (
    SmartCrop,
    SolidColor,
    SmartCompositeXY,
    SmartCompositeAlign,
    ColorPicker,
    ImageInfo,
    ResolutionPicker,
    ImageBridge,
    WorkflowMetadata,
    NODE_CLASS_MAPPINGS as WIDGET_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as WIDGET_DISPLAY_MAPPINGS,
)

# Import loader nodes
from .nodes.loader_nodes import (
    LoadImageFromFolder,
    LoadAllImagesFromFolder,
    SplitImageBatch,
    NODE_CLASS_MAPPINGS as LOADER_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as LOADER_DISPLAY_MAPPINGS,
)


# V3 API registration
if HAS_V3:
    class ComfyAngelExtension(ComfyExtension):
        """ComfyAngel extension for V3 API."""

        async def get_node_list(self):
            # Return V3 nodes here when implemented
            return []

    async def comfy_entrypoint():
        return ComfyAngelExtension()


# V1 API registration (always available as fallback)
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# Register overlay nodes
NODE_CLASS_MAPPINGS.update(OVERLAY_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(OVERLAY_DISPLAY_MAPPINGS)

# Register widget nodes
NODE_CLASS_MAPPINGS.update(WIDGET_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(WIDGET_DISPLAY_MAPPINGS)

# Register loader nodes
NODE_CLASS_MAPPINGS.update(LOADER_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(LOADER_DISPLAY_MAPPINGS)

# JS widgets directory
WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
