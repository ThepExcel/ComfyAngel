"""
API routes for ComfyAngel custom nodes.

Provides endpoints for folder validation and other utilities.
"""

import os
from aiohttp import web
from server import PromptServer

# Supported image extensions (must match loader_nodes.py)
SUPPORTED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'}


def validate_folder_path(folder_path: str, include_subdirs: bool = False) -> dict:
    """
    Validate a folder path and count valid images.

    Args:
        folder_path: Path to folder to validate
        include_subdirs: Whether to include subdirectories

    Returns:
        dict with keys: valid, message, count
    """
    if not folder_path or folder_path.strip() == "":
        return {"valid": False, "message": "Path is empty", "count": 0}

    if not os.path.exists(folder_path):
        return {"valid": False, "message": "Path does not exist", "count": 0}

    if not os.path.isdir(folder_path):
        return {"valid": False, "message": "Path is not a directory", "count": 0}

    # Count valid images
    try:
        image_count = 0

        if include_subdirs:
            for root, _, files in os.walk(folder_path):
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in SUPPORTED_EXTENSIONS:
                        image_count += 1
        else:
            for f in os.listdir(folder_path):
                ext = os.path.splitext(f)[1].lower()
                if ext in SUPPORTED_EXTENSIONS:
                    full_path = os.path.join(folder_path, f)
                    if os.path.isfile(full_path):
                        image_count += 1

        if image_count == 0:
            return {
                "valid": False,
                "message": f"No valid images found (supported: {', '.join(SUPPORTED_EXTENSIONS)})",
                "count": 0
            }

        return {
            "valid": True,
            "message": f"Found {image_count} image(s)",
            "count": image_count
        }

    except PermissionError:
        return {"valid": False, "message": "Permission denied", "count": 0}
    except Exception as e:
        return {"valid": False, "message": f"Error: {str(e)}", "count": 0}


# Register routes
routes = PromptServer.instance.routes


@routes.post("/comfyangel/validate_folder")
async def validate_folder_endpoint(request):
    """
    Validate a folder path and count images.

    POST /comfyangel/validate_folder
    Body: {"folder_path": "...", "include_subdirs": false}
    Returns: {"valid": bool, "message": str, "count": int}
    """
    try:
        data = await request.json()
        folder_path = data.get("folder_path", "")
        include_subdirs = data.get("include_subdirs", False)

        result = validate_folder_path(folder_path, include_subdirs)
        return web.json_response(result)

    except Exception as e:
        return web.json_response(
            {"valid": False, "message": f"Server error: {str(e)}", "count": 0},
            status=500
        )


print("[ComfyAngel] API routes registered: /comfyangel/validate_folder")
