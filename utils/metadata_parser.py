"""
PNG Metadata Parser for A1111 and ComfyUI formats.

Extracts generation parameters from PNG metadata:
- Seed, Model, LoRA, CFG, Steps, Sampler, Scheduler
"""

import json
import re
from typing import Optional
from dataclasses import dataclass, field
from PIL import Image


@dataclass
class GenerationParams:
    """Extracted generation parameters."""

    seed: Optional[int] = None
    model: Optional[str] = None
    loras: list[tuple[str, float]] = field(default_factory=list)  # [(name, weight), ...]
    cfg: Optional[float] = None
    steps: Optional[int] = None
    sampler: Optional[str] = None
    scheduler: Optional[str] = None
    denoise: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    positive_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None

    def format_overlay(self, show_prompt: bool = False, max_prompt_len: int = 50) -> list[str]:
        """
        Format parameters for overlay display.

        Returns:
            List of lines to display
        """
        lines = []

        # Line 1: Model + LoRAs
        model_parts = []
        if self.model:
            model_parts.append(self.model)
        for lora_name, lora_weight in self.loras[:2]:  # Max 2 LoRAs
            model_parts.append(f"{lora_name}:{lora_weight:.1f}")
        if model_parts:
            lines.append(" | ".join(model_parts))

        # Line 2: Seed, CFG, Steps, Sampler
        param_parts = []
        if self.seed is not None:
            param_parts.append(f"Seed:{self.seed}")
        if self.cfg is not None:
            param_parts.append(f"CFG:{self.cfg:.1f}")
        if self.steps is not None:
            param_parts.append(f"Steps:{self.steps}")
        if self.sampler:
            sampler_str = self.sampler
            if self.scheduler:
                sampler_str += f"/{self.scheduler}"
            param_parts.append(sampler_str)
        if param_parts:
            lines.append(" | ".join(param_parts))

        # Line 3: Resolution + Denoise (optional)
        extra_parts = []
        if self.width and self.height:
            extra_parts.append(f"{self.width}x{self.height}")
        if self.denoise is not None and self.denoise < 1.0:
            extra_parts.append(f"Denoise:{self.denoise:.2f}")
        if extra_parts:
            lines.append(" | ".join(extra_parts))

        # Optional: Prompts
        if show_prompt:
            if self.positive_prompt:
                truncated = self.positive_prompt[:max_prompt_len]
                if len(self.positive_prompt) > max_prompt_len:
                    truncated += "..."
                lines.append(f"Prompt: {truncated}")

        return lines


def parse_a1111_format(text: str) -> GenerationParams:
    """
    Parse A1111/Civitai format metadata.

    Format example:
    ```
    masterpiece, best quality, girl
    Negative prompt: bad quality
    Steps: 30, Sampler: Euler a, CFG scale: 7, Seed: 12345, Size: 512x512, Model: sd_xl_base_1.0
    ```
    """
    params = GenerationParams()

    lines = text.strip().split("\n")

    # Find the parameters line (contains "Steps:")
    param_line = ""
    for i, line in enumerate(lines):
        if line.startswith("Negative prompt:"):
            params.negative_prompt = line[len("Negative prompt:"):].strip()
        elif "Steps:" in line:
            param_line = line
        elif i == 0 and "Steps:" not in line and "Negative prompt:" not in line:
            params.positive_prompt = line.strip()

    # Parse key-value pairs from param line
    if param_line:
        # Split by comma, but handle nested values
        pairs = re.findall(r'([^:,]+):\s*([^,]+(?:,\s*[^:,]+)*?)(?=,\s*[^:,]+:|$)', param_line)
        for key, value in pairs:
            key = key.strip().lower()
            value = value.strip()

            if key == "steps":
                params.steps = int(value)
            elif key == "cfg scale":
                params.cfg = float(value)
            elif key == "seed":
                params.seed = int(value)
            elif key == "sampler":
                params.sampler = value
            elif key == "scheduler":
                params.scheduler = value
            elif key == "size":
                match = re.match(r"(\d+)x(\d+)", value)
                if match:
                    params.width = int(match.group(1))
                    params.height = int(match.group(2))
            elif key == "model":
                params.model = value
            elif key == "denoising strength":
                params.denoise = float(value)

        # Parse LoRAs from prompt (format: <lora:name:weight>)
        if params.positive_prompt:
            lora_matches = re.findall(r"<lora:([^:>]+):([0-9.]+)>", params.positive_prompt)
            params.loras = [(name, float(weight)) for name, weight in lora_matches]

    return params


def parse_comfyui_format(prompt_json: str, workflow_json: Optional[str] = None) -> GenerationParams:
    """
    Parse ComfyUI format metadata (JSON workflow).

    The prompt contains node inputs with class_type and inputs.
    """
    params = GenerationParams()

    try:
        prompt = json.loads(prompt_json)
    except json.JSONDecodeError:
        return params

    # Search through nodes for relevant data
    for node_id, node_data in prompt.items():
        if not isinstance(node_data, dict):
            continue

        class_type = node_data.get("class_type", "")
        inputs = node_data.get("inputs", {})

        # KSampler / KSamplerAdvanced
        if "KSampler" in class_type:
            if "seed" in inputs:
                seed_val = inputs["seed"]
                if isinstance(seed_val, (int, float)):
                    params.seed = int(seed_val)
            if "cfg" in inputs:
                params.cfg = float(inputs["cfg"])
            if "steps" in inputs:
                params.steps = int(inputs["steps"])
            if "sampler_name" in inputs:
                params.sampler = inputs["sampler_name"]
            if "scheduler" in inputs:
                params.scheduler = inputs["scheduler"]
            if "denoise" in inputs:
                params.denoise = float(inputs["denoise"])

        # CheckpointLoader
        if "CheckpointLoader" in class_type or "CheckpointSimple" in class_type:
            if "ckpt_name" in inputs:
                # Remove extension and path
                model_name = inputs["ckpt_name"]
                model_name = model_name.rsplit("/", 1)[-1]
                model_name = model_name.rsplit("\\", 1)[-1]
                model_name = re.sub(r"\.(safetensors|ckpt)$", "", model_name)
                params.model = model_name

        # LoraLoader
        if "LoraLoader" in class_type or "Lora" in class_type:
            lora_name = inputs.get("lora_name", "")
            strength = inputs.get("strength_model", inputs.get("strength", 1.0))
            if lora_name:
                # Clean up lora name
                lora_name = lora_name.rsplit("/", 1)[-1]
                lora_name = lora_name.rsplit("\\", 1)[-1]
                lora_name = re.sub(r"\.(safetensors|pt)$", "", lora_name)
                params.loras.append((lora_name, float(strength)))

        # EmptyLatentImage (for resolution)
        if "EmptyLatentImage" in class_type:
            if "width" in inputs:
                params.width = int(inputs["width"])
            if "height" in inputs:
                params.height = int(inputs["height"])

        # CLIPTextEncode (prompts)
        if "CLIPTextEncode" in class_type:
            text = inputs.get("text", "")
            if text:
                # Heuristic: shorter text or text with "bad" is likely negative
                if params.positive_prompt is None:
                    params.positive_prompt = text
                elif "bad" in text.lower() or "ugly" in text.lower() or len(text) < len(params.positive_prompt):
                    params.negative_prompt = text
                    # Swap if needed
                    if len(params.positive_prompt) < len(text):
                        params.positive_prompt, params.negative_prompt = params.negative_prompt, params.positive_prompt

    return params


def read_image_metadata(image_path: str) -> GenerationParams:
    """
    Read and parse metadata from an image file.

    Supports:
    - A1111 format (parameters key)
    - ComfyUI format (prompt key)
    - Civitai format (similar to A1111)

    Args:
        image_path: Path to PNG image

    Returns:
        GenerationParams with extracted data (empty if no metadata)
    """
    try:
        img = Image.open(image_path)
        metadata = img.info
    except Exception:
        return GenerationParams()

    # Try A1111 format first
    if "parameters" in metadata:
        return parse_a1111_format(metadata["parameters"])

    # Try ComfyUI format
    if "prompt" in metadata:
        workflow = metadata.get("workflow")
        return parse_comfyui_format(metadata["prompt"], workflow)

    return GenerationParams()


def read_tensor_metadata(image_tensor, metadata_source: str = "") -> GenerationParams:
    """
    Try to extract metadata from various sources.

    Note: ComfyUI IMAGE tensors don't carry metadata directly.
    This function is for when you have a path or embedded metadata string.

    Args:
        image_tensor: ComfyUI IMAGE tensor (not used directly)
        metadata_source: Path to original file or raw metadata string

    Returns:
        GenerationParams
    """
    if not metadata_source:
        return GenerationParams()

    # If it looks like a file path
    if "/" in metadata_source or "\\" in metadata_source:
        return read_image_metadata(metadata_source)

    # Try parsing as raw metadata
    if "Steps:" in metadata_source:
        return parse_a1111_format(metadata_source)

    if metadata_source.strip().startswith("{"):
        return parse_comfyui_format(metadata_source)

    return GenerationParams()
