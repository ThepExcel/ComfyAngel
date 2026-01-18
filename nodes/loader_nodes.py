"""
Loader Nodes for ComfyAngel.

Nodes for loading images from folders for batch/loop processing.
"""

import os
import torch
import numpy as np
from PIL import Image, ImageOps


class LoadImageFromFolder:
    """
    Load images from a folder one at a time for loop processing.

    Use with ComfyUI's Auto Queue feature to process all images in a folder.
    The index increments automatically with each execution.

    Outputs:
    - image: Current image tensor
    - filename: Current filename (without extension)
    - filename_ext: Current filename (with extension)
    - index: Current image index (0-based)
    - total_count: Total number of images in folder
    """

    SUPPORTED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'}
    SORT_OPTIONS = ["name", "modified_date", "created_date"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder_path": ("STRING", {
                    "default": "",
                    "placeholder": "Path to folder containing images"
                }),
                "index": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 999999,
                    "step": 1,
                    "control_after_generate": True,
                }),
                "sort_by": (cls.SORT_OPTIONS, {"default": "name"}),
            },
            "optional": {
                "loop": ("BOOLEAN", {"default": True}),
                "include_subdirs": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING", "STRING", "INT", "INT")
    RETURN_NAMES = ("image", "mask", "filename", "filename_ext", "metadata_raw", "index", "total_count")
    FUNCTION = "load_image"
    CATEGORY = "ComfyAngel/Loader"

    def load_image(
        self,
        folder_path: str,
        index: int,
        sort_by: str,
        loop: bool = True,
        include_subdirs: bool = False,
    ):
        # Validate folder path
        if not folder_path or not os.path.isdir(folder_path):
            raise ValueError(f"Invalid folder path: {folder_path}")

        # Get list of image files
        image_files = self._get_image_files(folder_path, include_subdirs)

        if not image_files:
            raise ValueError(f"No valid images found in: {folder_path}")

        # Sort files
        image_files = self._sort_files(image_files, sort_by)

        total_count = len(image_files)

        # Handle index
        if loop:
            index = index % total_count
        else:
            index = min(index, total_count - 1)

        # Get current file
        current_file = image_files[index]
        filename_ext = os.path.basename(current_file)
        filename = os.path.splitext(filename_ext)[0]

        # Load image
        img = Image.open(current_file)
        img = ImageOps.exif_transpose(img)

        # Read raw metadata from file
        metadata_raw = ""
        if "parameters" in img.info:
            metadata_raw = img.info["parameters"]
        elif "prompt" in img.info:
            metadata_raw = img.info["prompt"]

        # Convert to RGB
        if img.mode == "I":
            img = img.point(lambda i: i * (1 / 255))
        image_rgb = img.convert("RGB")

        # Convert to tensor (BHWC format)
        image_np = np.array(image_rgb).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np).unsqueeze(0)

        # Handle mask (alpha channel)
        if "A" in img.getbands():
            mask_np = np.array(img.getchannel("A")).astype(np.float32) / 255.0
            mask_tensor = 1.0 - torch.from_numpy(mask_np).unsqueeze(0)
        else:
            mask_tensor = torch.zeros(
                (1, image_np.shape[0], image_np.shape[1]),
                dtype=torch.float32
            )

        return (image_tensor, mask_tensor, filename, filename_ext, metadata_raw, index, total_count)

    def _get_image_files(self, folder_path: str, include_subdirs: bool) -> list[str]:
        """Get list of valid image files from folder."""
        image_files = []

        if include_subdirs:
            for root, _, files in os.walk(folder_path):
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in self.SUPPORTED_EXTENSIONS:
                        image_files.append(os.path.join(root, f))
        else:
            for f in os.listdir(folder_path):
                ext = os.path.splitext(f)[1].lower()
                if ext in self.SUPPORTED_EXTENSIONS:
                    full_path = os.path.join(folder_path, f)
                    if os.path.isfile(full_path):
                        image_files.append(full_path)

        return image_files

    def _sort_files(self, files: list[str], sort_by: str) -> list[str]:
        """Sort files by specified criteria."""
        if sort_by == "name":
            return sorted(files, key=lambda x: os.path.basename(x).lower())
        elif sort_by == "modified_date":
            return sorted(files, key=lambda x: os.path.getmtime(x))
        elif sort_by == "created_date":
            return sorted(files, key=lambda x: os.path.getctime(x))
        return files

    @classmethod
    def IS_CHANGED(cls, folder_path, index, sort_by, loop=True, include_subdirs=False):
        """Force re-execution when index changes."""
        return f"{folder_path}_{index}_{sort_by}_{loop}_{include_subdirs}"


class LoadAllImagesFromFolder:
    """
    Load ALL images from a folder as a batch.

    Unlike LoadImageFromFolder which loads one at a time,
    this loads all images at once for batch processing.

    Note: All images will be resized to match the first image's dimensions.
    """

    SUPPORTED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'}
    SORT_OPTIONS = ["name", "modified_date", "created_date"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder_path": ("STRING", {
                    "default": "",
                    "placeholder": "Path to folder containing images"
                }),
                "sort_by": (cls.SORT_OPTIONS, {"default": "name"}),
            },
            "optional": {
                "max_images": ("INT", {"default": 0, "min": 0, "max": 1000, "step": 1}),
                "start_index": ("INT", {"default": 0, "min": 0, "max": 999999, "step": 1}),
                "include_subdirs": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING", "INT")
    RETURN_NAMES = ("images", "filenames", "count")
    FUNCTION = "load_images"
    CATEGORY = "ComfyAngel/Loader"

    def load_images(
        self,
        folder_path: str,
        sort_by: str,
        max_images: int = 0,
        start_index: int = 0,
        include_subdirs: bool = False,
    ):
        # Validate folder path
        if not folder_path or not os.path.isdir(folder_path):
            raise ValueError(f"Invalid folder path: {folder_path}")

        # Get list of image files
        image_files = self._get_image_files(folder_path, include_subdirs)

        if not image_files:
            raise ValueError(f"No valid images found in: {folder_path}")

        # Sort files
        image_files = self._sort_files(image_files, sort_by)

        # Apply start_index and max_images
        image_files = image_files[start_index:]
        if max_images > 0:
            image_files = image_files[:max_images]

        if not image_files:
            raise ValueError(f"No images after applying start_index={start_index}")

        # Load first image to get dimensions
        first_img = Image.open(image_files[0])
        first_img = ImageOps.exif_transpose(first_img)
        target_size = first_img.size  # (width, height)

        # Load all images
        tensors = []
        filenames = []

        for file_path in image_files:
            img = Image.open(file_path)
            img = ImageOps.exif_transpose(img)

            # Resize to match first image
            if img.size != target_size:
                img = img.resize(target_size, Image.LANCZOS)

            # Convert to RGB
            if img.mode == "I":
                img = img.point(lambda i: i * (1 / 255))
            img = img.convert("RGB")

            # Convert to tensor
            img_np = np.array(img).astype(np.float32) / 255.0
            tensors.append(torch.from_numpy(img_np))

            # Store filename
            filenames.append(os.path.basename(file_path))

        # Stack into batch tensor (B, H, W, C)
        batch_tensor = torch.stack(tensors, dim=0)
        filenames_str = "\n".join(filenames)

        return (batch_tensor, filenames_str, len(filenames))

    def _get_image_files(self, folder_path: str, include_subdirs: bool) -> list[str]:
        """Get list of valid image files from folder."""
        image_files = []

        if include_subdirs:
            for root, _, files in os.walk(folder_path):
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in self.SUPPORTED_EXTENSIONS:
                        image_files.append(os.path.join(root, f))
        else:
            for f in os.listdir(folder_path):
                ext = os.path.splitext(f)[1].lower()
                if ext in self.SUPPORTED_EXTENSIONS:
                    full_path = os.path.join(folder_path, f)
                    if os.path.isfile(full_path):
                        image_files.append(full_path)

        return image_files

    def _sort_files(self, files: list[str], sort_by: str) -> list[str]:
        """Sort files by specified criteria."""
        if sort_by == "name":
            return sorted(files, key=lambda x: os.path.basename(x).lower())
        elif sort_by == "modified_date":
            return sorted(files, key=lambda x: os.path.getmtime(x))
        elif sort_by == "created_date":
            return sorted(files, key=lambda x: os.path.getctime(x))
        return files


class SplitImageBatch:
    """
    Split a batch of images and output one image at a time.

    Use with Auto Queue + increment index to process each image in the batch.

    Outputs:
    - image: Single image at the specified index
    - index: Current index
    - total_count: Total images in batch
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "index": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 999999,
                    "step": 1,
                    "control_after_generate": True,
                }),
            },
            "optional": {
                "loop": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("image", "index", "total_count")
    FUNCTION = "split"
    CATEGORY = "ComfyAngel/Loader"

    def split(self, images, index: int, loop: bool = True):
        # Get batch size
        total_count = images.shape[0]

        # Handle index
        if loop:
            index = index % total_count
        else:
            index = min(index, total_count - 1)

        # Extract single image (keep batch dimension)
        single_image = images[index:index+1]

        return (single_image, index, total_count)

    @classmethod
    def IS_CHANGED(cls, images, index, loop=True):
        """Force re-execution when index changes."""
        return f"{index}_{loop}"


# Export for registration
NODE_CLASS_MAPPINGS = {
    "ComfyAngel_LoadImageFromFolder": LoadImageFromFolder,
    "ComfyAngel_LoadAllImagesFromFolder": LoadAllImagesFromFolder,
    "ComfyAngel_SplitImageBatch": SplitImageBatch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyAngel_LoadImageFromFolder": "Load Image from Folder 🪽",
    "ComfyAngel_LoadAllImagesFromFolder": "Load Images from Folder as BATCH 🪽",
    "ComfyAngel_SplitImageBatch": "Split Image Batch 🪽",
}
