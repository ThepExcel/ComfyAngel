"""
Loop utilities for ComfyAngel

Helper classes for dynamic type handling in loop nodes.
"""

import torch


class AlwaysEqualProxy(str):
    """
    A string subclass that always equals any other value.
    Used for creating 'any' type inputs/outputs in ComfyUI.
    """
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


class TautologyStr(str):
    """String that never not-equals anything (for type matching)."""
    def __ne__(self, other):
        return False


class ByPassTypeTuple(tuple):
    """
    Tuple that bypasses type checking by always returning first element.
    Used for dynamic return types in loop nodes.
    """
    def __getitem__(self, index):
        if index > 0:
            index = 0
        item = super().__getitem__(index)
        if isinstance(item, str):
            return TautologyStr(item)
        return item


# Singleton for any type
any_type = AlwaysEqualProxy("*")


def get_items_length(items) -> int:
    """
    Get the length of items regardless of type.
    Supports: torch.Tensor (batch), list, tuple, or single item.
    """
    if items is None:
        return 0

    if isinstance(items, torch.Tensor):
        # For tensors, first dimension is batch size
        return items.shape[0] if items.dim() > 0 else 1

    if isinstance(items, (list, tuple)):
        return len(items)

    # Single item
    return 1


def get_item_at_index(items, index: int):
    """
    Get item at index from any iterable type.
    Handles: torch.Tensor, list, tuple, single item.
    """
    if items is None:
        return None

    if isinstance(items, torch.Tensor):
        if items.dim() == 0:
            return items
        # Return single item from batch, keeping dimensions
        return items[index:index+1]

    if isinstance(items, (list, tuple)):
        if len(items) == 0:
            return None
        return items[index]

    # Single item - return as-is
    return items


def accumulate_results(existing, new_item):
    """
    Accumulate results into a batch.
    For tensors (IMAGE, MASK, LATENT): concatenates along batch dimension.
    For other types (strings, etc.): creates a list.
    """
    if new_item is None:
        return existing

    if existing is None:
        # First item - clone tensor or wrap in list
        if isinstance(new_item, torch.Tensor):
            return new_item.clone()
        return [new_item]

    # Both are tensors - concatenate
    if isinstance(existing, torch.Tensor) and isinstance(new_item, torch.Tensor):
        # Ensure same number of dimensions
        if existing.dim() != new_item.dim():
            if existing.dim() == 3 and new_item.dim() == 4:
                existing = existing.unsqueeze(0)
            elif existing.dim() == 4 and new_item.dim() == 3:
                new_item = new_item.unsqueeze(0)
        return torch.cat([existing, new_item], dim=0)

    # existing is list of tensors - try to concat all
    if isinstance(existing, list) and len(existing) > 0:
        if isinstance(existing[0], torch.Tensor) and isinstance(new_item, torch.Tensor):
            try:
                stacked = torch.cat(existing, dim=0)
                return torch.cat([stacked, new_item], dim=0)
            except Exception:
                pass
        # Append to list
        return existing + [new_item]

    # existing is tensor, new_item is not
    if isinstance(existing, torch.Tensor):
        return [existing, new_item]

    # Default: create/extend list
    if isinstance(existing, list):
        return existing + [new_item]

    return [existing, new_item]
