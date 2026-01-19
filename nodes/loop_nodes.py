"""
Loop nodes for ComfyAngel

Provides true loop functionality without needing Auto Queue.

Two versions:
- Simple: Just loop through items and collect results (no value passing)
- Advanced: Loop with 10 value slots for complex accumulation
"""

import torch
from ..utils.loop_utils import (
    any_type,
    ByPassTypeTuple,
    get_items_length,
    get_item_at_index,
    accumulate_results,
)

# Try to import ComfyUI execution utilities
try:
    from comfy_execution.graph_utils import GraphBuilder, is_link
    from comfy_execution.graph import ExecutionBlocker
    HAS_GRAPH_UTILS = True
except ImportError:
    HAS_GRAPH_UTILS = False
    GraphBuilder = None
    ExecutionBlocker = None
    is_link = lambda x: isinstance(x, list) and len(x) == 2

MAX_SLOTS = 10


# ============== Simple Loop Nodes ==============

class LoopStartSimple:
    """
    Start a loop over items - Simple version.

    Input:
        items: Any batch (IMAGE batch, list of strings, etc.)

    Output:
        flow: Connect to Loop End
        item: Current item from the batch
        index: Current iteration index (0-based)
        total: Total number of items
        is_last: True if this is the last iteration
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "items": (any_type, {"tooltip": "Batch/list to iterate over"}),
            },
            "hidden": {
                "_index": (any_type,),
                "_accumulated": (any_type,),
            }
        }

    # Output index 5 is for accumulated value (hidden but accessible via rawLink)
    RETURN_TYPES = ByPassTypeTuple(("FLOW_CONTROL", any_type, "INT", "INT", "BOOLEAN", any_type))
    RETURN_NAMES = ("flow", "item", "index", "total", "is_last", "_acc")
    INPUT_IS_LIST = True
    FUNCTION = "loop_start"
    CATEGORY = "ComfyAngel/Loop"

    def loop_start(self, items, _index=None, _accumulated=None):
        if isinstance(items, list) and len(items) == 1 and isinstance(items[0], torch.Tensor):
            items = items[0]

        if isinstance(_index, list):
            _index = _index[0] if _index else None
        if isinstance(_accumulated, list):
            _accumulated = _accumulated[0] if _accumulated else None

        index = 0 if _index is None else int(_index)
        total = get_items_length(items)

        if total == 0:
            raise ValueError("Cannot loop over empty items")

        item = get_item_at_index(items, min(index, total - 1))
        is_last = (index >= total - 1)

        # Return accumulated as output so it can be referenced by LoopEnd
        return ("loop_flow", item, index, total, is_last, _accumulated)


class LoopEndSimple:
    """
    End a loop and collect results - Simple version.

    Input:
        flow: Connect from Loop Start
        result: Value to accumulate across iterations

    Output:
        results: Accumulated results (batched tensor or list)
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
            },
            "optional": {
                "result": (any_type, {"rawLink": True}),
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ByPassTypeTuple((any_type,))
    RETURN_NAMES = ("results",)
    FUNCTION = "loop_end"
    CATEGORY = "ComfyAngel/Loop"

    def loop_end(self, flow, result=None, dynprompt=None, unique_id=None):
        if not HAS_GRAPH_UTILS:
            raise RuntimeError("Loop nodes require ComfyUI with comfy_execution module.")

        loop_start_id = flow[0]
        loop_start_node = dynprompt.get_node(loop_start_id)

        if loop_start_node['class_type'] != 'ComfyAngel_LoopStartSimple':
            raise ValueError("flow must be connected from Loop Start node")

        items_input = loop_start_node['inputs'].get('items')

        graph = GraphBuilder()

        # Get total count
        total_node = graph.node("ComfyAngel_GetLength", items=items_input)
        total = total_node.out(0)

        # Calculate next index (index is output 2)
        add_node = graph.node("ComfyAngel_MathInt", operation="add", a=[loop_start_id, 2], b=1)
        next_index = add_node.out(0)

        # Check condition
        cond_node = graph.node("ComfyAngel_Compare", a=next_index, b=total, comparison="a < b")
        should_continue = cond_node.out(0)

        # Accumulate result - use OUTPUT from LoopStart (index 5), not input!
        # This ensures we get the value from the cloned LoopStart during iteration
        ACCUMULATED_OUTPUT_INDEX = 5
        prev_accumulated = [loop_start_id, ACCUMULATED_OUTPUT_INDEX]

        if result is not None:
            acc_node = graph.node("ComfyAngel_Accumulate", existing=prev_accumulated, new_item=result)
            accumulated = acc_node.out(0)
        else:
            accumulated = prev_accumulated

        # Create while loop end node
        while_end = graph.node(
            "ComfyAngel_WhileLoopEndSimple",
            flow=flow,
            condition=should_continue,
            next_index=next_index,
            accumulated=accumulated,
        )

        return {
            "result": (while_end.out(0),),
            "expand": graph.finalize(),
        }


class WhileLoopEndSimple:
    """Internal: While loop controller for Simple loop."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
                "condition": ("BOOLEAN",),
                "next_index": ("INT",),
            },
            "optional": {
                "accumulated": (any_type,),
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ByPassTypeTuple((any_type,))
    RETURN_NAMES = ("results",)
    FUNCTION = "while_end"
    CATEGORY = "ComfyAngel/Loop/Internal"
    DEPRECATED = True  # Hide from menu

    def explore_dependencies(self, node_id, dynprompt, upstream, parent_ids):
        node_info = dynprompt.get_node(node_id)
        if "inputs" not in node_info:
            return
        for k, v in node_info["inputs"].items():
            if is_link(v):
                parent_id = v[0]
                display_id = dynprompt.get_display_node_id(parent_id)
                display_node = dynprompt.get_node(display_id)
                class_type = display_node.get("class_type", "")
                if "LoopEnd" not in class_type and "WhileLoopEnd" not in class_type:
                    parent_ids.append(display_id)
                if parent_id not in upstream:
                    upstream[parent_id] = []
                    self.explore_dependencies(parent_id, dynprompt, upstream, parent_ids)
                upstream[parent_id].append(node_id)

    def collect_contained(self, node_id, upstream, contained):
        if node_id not in upstream:
            return
        for child_id in upstream[node_id]:
            if child_id not in contained:
                contained[child_id] = True
                self.collect_contained(child_id, upstream, contained)

    def while_end(self, flow, condition, next_index, accumulated=None, dynprompt=None, unique_id=None):
        if not condition:
            return (accumulated,)

        graph = GraphBuilder()
        loop_start_id = flow[0]

        upstream = {}
        parent_ids = []
        self.explore_dependencies(unique_id, dynprompt, upstream, parent_ids)
        parent_ids = list(set(parent_ids))

        contained = {}
        self.collect_contained(loop_start_id, upstream, contained)
        contained[unique_id] = True
        contained[loop_start_id] = True

        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            node = graph.node(original_node["class_type"], "Recurse" if node_id == unique_id else node_id)
            node.set_override_display_id(node_id)

        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            node = graph.lookup_node("Recurse" if node_id == unique_id else node_id)
            for k, v in original_node["inputs"].items():
                if is_link(v) and v[0] in contained:
                    parent = graph.lookup_node(v[0])
                    node.set_input(k, parent.out(v[1]))
                else:
                    node.set_input(k, v)

        new_loop_start = graph.lookup_node(loop_start_id)
        new_loop_start.set_input("_index", next_index)
        new_loop_start.set_input("_accumulated", accumulated)

        my_clone = graph.lookup_node("Recurse")
        return {
            "result": (my_clone.out(0),),
            "expand": graph.finalize(),
        }


# ============== Advanced Loop Nodes ==============

class LoopStartAdvanced:
    """
    Start a loop over items - Advanced version with 10 value slots.

    Input:
        items: Any batch (IMAGE batch, list of strings, etc.)
        initial_value0-9: Optional values to pass through/accumulate

    Output:
        flow: Connect to Loop End (Advanced)
        item: Current item from the batch
        index: Current iteration index (0-based)
        total: Total number of items
        is_last: True if this is the last iteration
        value0-9: Pass-through values
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "items": (any_type, {"tooltip": "Batch/list to iterate over"}),
            },
            "optional": {
                **{f"initial_value{i}": (any_type,) for i in range(MAX_SLOTS)}
            },
            "hidden": {
                "_index": (any_type,),
            }
        }

    RETURN_TYPES = ByPassTypeTuple(tuple(
        ["FLOW_CONTROL", any_type, "INT", "INT", "BOOLEAN"] + [any_type] * MAX_SLOTS
    ))
    RETURN_NAMES = ByPassTypeTuple(tuple(
        ["flow", "item", "index", "total", "is_last"] + [f"value{i}" for i in range(MAX_SLOTS)]
    ))
    INPUT_IS_LIST = True
    FUNCTION = "loop_start"
    CATEGORY = "ComfyAngel/Loop"

    def loop_start(self, items, _index=None, **kwargs):
        if isinstance(items, list) and len(items) == 1 and isinstance(items[0], torch.Tensor):
            items = items[0]

        if isinstance(_index, list):
            _index = _index[0] if _index else None

        index = 0 if _index is None else int(_index)
        total = get_items_length(items)

        if total == 0:
            raise ValueError("Cannot loop over empty items")

        item = get_item_at_index(items, min(index, total - 1))
        is_last = (index >= total - 1)

        values = []
        for i in range(MAX_SLOTS):
            val = kwargs.get(f"initial_value{i}", None)
            if isinstance(val, list) and len(val) == 1:
                val = val[0]
            elif isinstance(val, list) and len(val) == 0:
                val = None
            values.append(val)

        return tuple(["loop_flow", item, index, total, is_last] + values)


class LoopEndAdvanced:
    """
    End a loop and collect results - Advanced version with 10 result slots.

    Input:
        flow: Connect from Loop Start (Advanced)
        result0-9: Values to accumulate across iterations

    Output:
        results0-9: Accumulated results (batched tensors or lists)
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
            },
            "optional": {
                **{f"result{i}": (any_type, {"rawLink": True}) for i in range(MAX_SLOTS)}
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ByPassTypeTuple(tuple([any_type] * MAX_SLOTS))
    RETURN_NAMES = ByPassTypeTuple(tuple([f"results{i}" for i in range(MAX_SLOTS)]))
    FUNCTION = "loop_end"
    CATEGORY = "ComfyAngel/Loop"

    def loop_end(self, flow, dynprompt=None, unique_id=None, **kwargs):
        if not HAS_GRAPH_UTILS:
            raise RuntimeError("Loop nodes require ComfyUI with comfy_execution module.")

        loop_start_id = flow[0]
        loop_start_node = dynprompt.get_node(loop_start_id)

        if loop_start_node['class_type'] != 'ComfyAngel_LoopStartAdvanced':
            raise ValueError("flow must be connected from Loop Start (Advanced) node")

        items_input = loop_start_node['inputs'].get('items')

        graph = GraphBuilder()

        total_node = graph.node("ComfyAngel_GetLength", items=items_input)
        total = total_node.out(0)

        add_node = graph.node("ComfyAngel_MathInt", operation="add", a=[loop_start_id, 2], b=1)
        next_index = add_node.out(0)

        cond_node = graph.node("ComfyAngel_Compare", a=next_index, b=total, comparison="a < b")
        should_continue = cond_node.out(0)

        # LoopStartAdvanced outputs: flow(0), item(1), index(2), total(3), is_last(4), value0(5), ...
        VALUE_OUTPUT_OFFSET = 5

        accumulated = {}
        for i in range(MAX_SLOTS):
            result_value = kwargs.get(f"result{i}")
            prev_value = [loop_start_id, VALUE_OUTPUT_OFFSET + i]
            if result_value is not None:
                acc_node = graph.node("ComfyAngel_Accumulate", existing=prev_value, new_item=result_value)
                accumulated[f"initial_value{i}"] = acc_node.out(0)
            else:
                accumulated[f"initial_value{i}"] = prev_value

        while_end = graph.node(
            "ComfyAngel_WhileLoopEndAdvanced",
            flow=flow,
            condition=should_continue,
            next_index=next_index,
            **accumulated
        )

        return {
            "result": tuple(while_end.out(i) for i in range(MAX_SLOTS)),
            "expand": graph.finalize(),
        }


class WhileLoopEndAdvanced:
    """Internal: While loop controller for Advanced loop."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
                "condition": ("BOOLEAN",),
                "next_index": ("INT",),
            },
            "optional": {
                **{f"initial_value{i}": (any_type,) for i in range(MAX_SLOTS)}
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ByPassTypeTuple(tuple([any_type] * MAX_SLOTS))
    RETURN_NAMES = ByPassTypeTuple(tuple([f"value{i}" for i in range(MAX_SLOTS)]))
    FUNCTION = "while_end"
    CATEGORY = "ComfyAngel/Loop/Internal"
    DEPRECATED = True  # Hide from menu

    def explore_dependencies(self, node_id, dynprompt, upstream, parent_ids):
        node_info = dynprompt.get_node(node_id)
        if "inputs" not in node_info:
            return
        for k, v in node_info["inputs"].items():
            if is_link(v):
                parent_id = v[0]
                display_id = dynprompt.get_display_node_id(parent_id)
                display_node = dynprompt.get_node(display_id)
                class_type = display_node.get("class_type", "")
                if "LoopEnd" not in class_type and "WhileLoopEnd" not in class_type:
                    parent_ids.append(display_id)
                if parent_id not in upstream:
                    upstream[parent_id] = []
                    self.explore_dependencies(parent_id, dynprompt, upstream, parent_ids)
                upstream[parent_id].append(node_id)

    def collect_contained(self, node_id, upstream, contained):
        if node_id not in upstream:
            return
        for child_id in upstream[node_id]:
            if child_id not in contained:
                contained[child_id] = True
                self.collect_contained(child_id, upstream, contained)

    def while_end(self, flow, condition, next_index, dynprompt=None, unique_id=None, **kwargs):
        values = [kwargs.get(f"initial_value{i}", None) for i in range(MAX_SLOTS)]

        if not condition:
            return tuple(values)

        graph = GraphBuilder()
        loop_start_id = flow[0]

        upstream = {}
        parent_ids = []
        self.explore_dependencies(unique_id, dynprompt, upstream, parent_ids)
        parent_ids = list(set(parent_ids))

        contained = {}
        self.collect_contained(loop_start_id, upstream, contained)
        contained[unique_id] = True
        contained[loop_start_id] = True

        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            node = graph.node(original_node["class_type"], "Recurse" if node_id == unique_id else node_id)
            node.set_override_display_id(node_id)

        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            node = graph.lookup_node("Recurse" if node_id == unique_id else node_id)
            for k, v in original_node["inputs"].items():
                if is_link(v) and v[0] in contained:
                    parent = graph.lookup_node(v[0])
                    node.set_input(k, parent.out(v[1]))
                else:
                    node.set_input(k, v)

        new_loop_start = graph.lookup_node(loop_start_id)
        new_loop_start.set_input("_index", next_index)
        for i in range(MAX_SLOTS):
            new_loop_start.set_input(f"initial_value{i}", kwargs.get(f"initial_value{i}", None))

        my_clone = graph.lookup_node("Recurse")
        return {
            "result": tuple(my_clone.out(i) for i in range(MAX_SLOTS)),
            "expand": graph.finalize(),
        }


# ============== Shared Internal Helper Nodes ==============

class GetLength:
    """Internal: Get length of any iterable."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"items": (any_type,)}}

    RETURN_TYPES = ("INT",)
    INPUT_IS_LIST = True
    FUNCTION = "get_length"
    CATEGORY = "ComfyAngel/Loop/Internal"
    DEPRECATED = True  # Hide from menu (shown only if "Show deprecated" enabled)

    def get_length(self, items):
        if isinstance(items, list):
            if len(items) == 1 and isinstance(items[0], torch.Tensor):
                items = items[0]
        return (get_items_length(items),)


class MathInt:
    """Internal: Integer math operations."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "a": ("INT", {"default": 0}),
                "b": ("INT", {"default": 0}),
                "operation": (["add", "subtract", "multiply", "divide", "modulo"],),
            }
        }

    RETURN_TYPES = ("INT",)
    FUNCTION = "math_op"
    CATEGORY = "ComfyAngel/Loop/Internal"
    DEPRECATED = True  # Hide from menu

    def math_op(self, a, b, operation):
        ops = {
            "add": lambda x, y: x + y,
            "subtract": lambda x, y: x - y,
            "multiply": lambda x, y: x * y,
            "divide": lambda x, y: x // y if y != 0 else 0,
            "modulo": lambda x, y: x % y if y != 0 else 0,
        }
        return (ops[operation](a, b),)


class Compare:
    """Internal: Compare two values."""

    COMPARISONS = {
        "a == b": lambda a, b: a == b,
        "a != b": lambda a, b: a != b,
        "a < b": lambda a, b: a < b,
        "a > b": lambda a, b: a > b,
        "a <= b": lambda a, b: a <= b,
        "a >= b": lambda a, b: a >= b,
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "a": (any_type, {"default": 0}),
                "b": (any_type, {"default": 0}),
                "comparison": (list(cls.COMPARISONS.keys()), {"default": "a < b"}),
            }
        }

    RETURN_TYPES = ("BOOLEAN",)
    FUNCTION = "compare"
    CATEGORY = "ComfyAngel/Loop/Internal"
    DEPRECATED = True  # Hide from menu

    def compare(self, a, b, comparison):
        return (self.COMPARISONS[comparison](a, b),)


class Accumulate:
    """Internal: Accumulate values into a batch/list."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "existing": (any_type,),
                "new_item": (any_type,),
            }
        }

    RETURN_TYPES = (any_type,)
    FUNCTION = "accumulate"
    CATEGORY = "ComfyAngel/Loop/Internal"
    DEPRECATED = True  # Hide from menu

    def accumulate(self, existing=None, new_item=None):
        if new_item is None:
            return (existing,)
        return (accumulate_results(existing, new_item),)


# ============== Node Mappings ==============

NODE_CLASS_MAPPINGS = {
    # Simple loop (recommended)
    "ComfyAngel_LoopStartSimple": LoopStartSimple,
    "ComfyAngel_LoopEndSimple": LoopEndSimple,
    # Advanced loop (10 value slots)
    "ComfyAngel_LoopStartAdvanced": LoopStartAdvanced,
    "ComfyAngel_LoopEndAdvanced": LoopEndAdvanced,
    # Internal nodes
    "ComfyAngel_WhileLoopEndSimple": WhileLoopEndSimple,
    "ComfyAngel_WhileLoopEndAdvanced": WhileLoopEndAdvanced,
    "ComfyAngel_GetLength": GetLength,
    "ComfyAngel_MathInt": MathInt,
    "ComfyAngel_Compare": Compare,
    "ComfyAngel_Accumulate": Accumulate,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    # Public loop nodes (shown in menu)
    "ComfyAngel_LoopStartSimple": "Loop Start 🪽",
    "ComfyAngel_LoopEndSimple": "Loop End 🪽",
    "ComfyAngel_LoopStartAdvanced": "Loop Start (Advanced) 🪽",
    "ComfyAngel_LoopEndAdvanced": "Loop End (Advanced) 🪽",
    # Internal nodes are NOT listed here = hidden from menu but still functional
}
