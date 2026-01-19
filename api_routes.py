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


def combine_text(
    inputs: dict,
    delimiter: str = "newline",
    custom_delimiter: str = " | ",
    skip_empty: bool = True,
    trim_whitespace: bool = True
) -> dict:
    """
    Combine multiple text inputs into one string.

    Args:
        inputs: Dict of input values (input_1, input_2, etc.)
        delimiter: Delimiter preset name
        custom_delimiter: Custom delimiter string (if delimiter is "custom")
        skip_empty: Skip empty inputs
        trim_whitespace: Trim whitespace from inputs

    Returns:
        dict with keys: text, count
    """
    # Get delimiter string
    delim_map = {
        "newline": "\n",
        "space": " ",
        "comma": ",",
        "comma_space": ", ",
        "pipe": " | ",
        "tab": "\t",
        "none": "",
        "custom": custom_delimiter,
    }
    delim = delim_map.get(delimiter, "\n")

    # Collect and process inputs
    parts = []
    for i in range(1, 11):
        key = f"input_{i}"
        if key in inputs:
            value = inputs[key]
            if value is None:
                continue

            # Convert to string
            text = str(value)

            # Trim whitespace
            if trim_whitespace:
                text = text.strip()

            # Skip empty
            if skip_empty and not text:
                continue

            parts.append(text)

    combined = delim.join(parts)
    return {"text": combined, "count": len(parts)}


@routes.post("/comfyangel/preview_text_combine")
async def preview_text_combine_endpoint(request):
    """
    Preview combined text without executing workflow.

    POST /comfyangel/preview_text_combine
    Body: {
        "inputs": {"input_1": "...", "input_2": "..."},
        "delimiter": "newline",
        "custom_delimiter": " | ",
        "skip_empty": true,
        "trim_whitespace": true
    }
    Returns: {"text": str, "count": int}
    """
    try:
        data = await request.json()
        inputs = data.get("inputs", {})
        delimiter = data.get("delimiter", "newline")
        custom_delimiter = data.get("custom_delimiter", " | ")
        skip_empty = data.get("skip_empty", True)
        trim_whitespace = data.get("trim_whitespace", True)

        result = combine_text(inputs, delimiter, custom_delimiter, skip_empty, trim_whitespace)
        return web.json_response(result)

    except Exception as e:
        return web.json_response(
            {"text": f"Error: {str(e)}", "count": 0},
            status=500
        )


def list_folder_contents(folder_path: str) -> dict:
    """
    List contents of a folder for folder browser.

    Args:
        folder_path: Path to folder to list (empty string = list drives/root)

    Returns:
        dict with keys: path, parent, folders, has_images
    """
    import platform

    # Handle empty path - list drives on Windows, root on Unix
    if not folder_path or folder_path.strip() == "":
        if platform.system() == "Windows":
            # List available drives
            import string
            drives = []
            for letter in string.ascii_uppercase:
                drive = f"{letter}:\\"
                if os.path.exists(drive):
                    drives.append({"name": f"{letter}:", "path": drive})
            return {
                "path": "",
                "parent": None,
                "folders": drives,
                "has_images": False
            }
        else:
            folder_path = "/"

    # Normalize path
    folder_path = os.path.normpath(folder_path)

    if not os.path.exists(folder_path):
        return {"error": "Path does not exist", "path": folder_path}

    if not os.path.isdir(folder_path):
        return {"error": "Path is not a directory", "path": folder_path}

    try:
        folders = []
        has_images = False

        for item in sorted(os.listdir(folder_path)):
            item_path = os.path.join(folder_path, item)

            # Skip hidden files/folders
            if item.startswith('.'):
                continue

            if os.path.isdir(item_path):
                folders.append({"name": item, "path": item_path})
            elif not has_images:
                # Check if there are any images in this folder
                ext = os.path.splitext(item)[1].lower()
                if ext in SUPPORTED_EXTENSIONS:
                    has_images = True

        # Get parent folder
        parent = os.path.dirname(folder_path)
        if parent == folder_path:  # Root folder
            parent = None

        return {
            "path": folder_path,
            "parent": parent,
            "folders": folders,
            "has_images": has_images
        }

    except PermissionError:
        return {"error": "Permission denied", "path": folder_path}
    except Exception as e:
        return {"error": str(e), "path": folder_path}


@routes.post("/comfyangel/browse_folder")
async def browse_folder_endpoint(request):
    """
    List folder contents for folder browser.

    POST /comfyangel/browse_folder
    Body: {"folder_path": "..."}
    Returns: {"path": str, "parent": str|null, "folders": [...], "has_images": bool}
    """
    try:
        data = await request.json()
        folder_path = data.get("folder_path", "")

        result = list_folder_contents(folder_path)
        return web.json_response(result)

    except Exception as e:
        return web.json_response(
            {"error": f"Server error: {str(e)}"},
            status=500
        )


def resolve_folder_path(folder_name: str, sample_files: list) -> dict:
    """
    Try to resolve full folder path from folder name and sample files.

    Searches common locations and recent folders.
    """
    import platform

    if not folder_name:
        return {"path": None, "error": "No folder name provided"}

    # Common base paths to search
    search_paths = []

    if platform.system() == "Windows":
        # Windows common paths
        user_home = os.path.expanduser("~")
        search_paths = [
            os.path.join(user_home, "Desktop"),
            os.path.join(user_home, "Documents"),
            os.path.join(user_home, "Downloads"),
            os.path.join(user_home, "Pictures"),
            user_home,
            "C:\\",
            "D:\\",
            "E:\\",
        ]
    else:
        # Unix common paths
        user_home = os.path.expanduser("~")
        search_paths = [
            os.path.join(user_home, "Desktop"),
            os.path.join(user_home, "Documents"),
            os.path.join(user_home, "Downloads"),
            os.path.join(user_home, "Pictures"),
            user_home,
            "/",
            "/tmp",
        ]

    # Search for the folder
    for base_path in search_paths:
        if not os.path.exists(base_path):
            continue

        candidate = os.path.join(base_path, folder_name)
        if os.path.isdir(candidate):
            # Verify with sample files if provided
            if sample_files:
                match_count = 0
                for sample in sample_files[:3]:
                    if os.path.exists(os.path.join(candidate, sample)):
                        match_count += 1
                if match_count > 0:
                    return {"path": candidate}
            else:
                return {"path": candidate}

    # Deep search in common paths (one level)
    for base_path in search_paths[:5]:  # Only first few to avoid slow search
        if not os.path.exists(base_path):
            continue

        try:
            for item in os.listdir(base_path):
                item_path = os.path.join(base_path, item)
                if os.path.isdir(item_path):
                    candidate = os.path.join(item_path, folder_name)
                    if os.path.isdir(candidate):
                        if sample_files:
                            for sample in sample_files[:2]:
                                if os.path.exists(os.path.join(candidate, sample)):
                                    return {"path": candidate}
                        else:
                            return {"path": candidate}
        except PermissionError:
            continue

    return {"path": None, "error": "Could not find folder"}


@routes.post("/comfyangel/resolve_folder")
async def resolve_folder_endpoint(request):
    """
    Resolve full folder path from folder name and sample files.

    POST /comfyangel/resolve_folder
    Body: {"folder_name": "...", "sample_files": [...]}
    Returns: {"path": str|null}
    """
    try:
        data = await request.json()
        folder_name = data.get("folder_name", "")
        sample_files = data.get("sample_files", [])

        result = resolve_folder_path(folder_name, sample_files)
        return web.json_response(result)

    except Exception as e:
        return web.json_response(
            {"path": None, "error": f"Server error: {str(e)}"},
            status=500
        )


print("[ComfyAngel] API routes registered: /comfyangel/validate_folder, /comfyangel/browse_folder, /comfyangel/resolve_folder, /comfyangel/preview_text_combine")
