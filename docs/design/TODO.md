# ComfyAngel Design TODO

> **Last Updated:** 2026-01-19 (UX/UI improvements + TextCombine preview)
> **Current Focus:** ทำให้ครบ PRD

---

## Active Tasks

(ว่าง)

---

## Backlog (PRD Gap)

| Item | PRD Section | Status | Notes |
|------|-------------|--------|-------|
| Smart Position visual picker | 2.2, 6.2 | done | Fixed in composite_widget.js |
| Phase 5: Documentation | 4 | pending | |
| Phase 5: Tests | 4 | pending | |
| Phase 5: Registry publish | 4 | pending | |

---

## Completed

| Task | Date | Notes |
|------|------|-------|
| Phase 1: Project Setup | done | V1+V3 dual support |
| Phase 2: Parameter Overlay | done | 4 nodes |
| Phase 3: Visual Widgets - Crop & Color | done | SmartCrop, SolidColor, ColorPicker |
| Phase 4: Visual Widgets - Composite | done | SmartCompositeXY, SmartCompositeAlign (widget fixed 2026-01-19) |
| Loop nodes | done | Simple + Advanced |
| Loader nodes | done | LoadAllImagesFromFolder, SplitImageBatch |
| Text utilities | done | TextCombine, TextPermutation |
| ColorPicker eyedropper | done | Sample colors from images using x,y coordinates |
| Folder validation widget | 2026-01-19 | Validate folder path + count images + path history |
| UX/UI improvements | 2026-01-19 | Hide internal nodes, fix labels, reduce outputs, add previews |
| TextCombine preview | 2026-01-19 | Show combined text after execution |

---

## Notes

- **Project Focus:** Parameter Overlay + Visual Widgets
- **Don't Build:** Layer/Blend, Filters, Mask ops (ใช้ LayerStyle)
- **Current Nodes:** 21 nodes total

---

## Lessons Learned (ComfyUI Development)

### 1. ซ่อน Nodes จากเมนู
- **วิธีที่ได้ผล:** ใช้ `DEPRECATED = True` ใน class definition
- **วิธีที่ไม่ได้ผล:** ลบจาก `NODE_DISPLAY_NAME_MAPPINGS` (nodes ยังโผล่)

### 2. แสดง Text Preview ใน Node (หลัง execute)
- **วิธีที่ได้ผล:**
  1. Python: `OUTPUT_NODE = True` + return `{"ui": {"text": [result]}, "result": (result,)}`
  2. JS: ใช้ `ComfyWidgets["STRING"]` ใน `onExecuted` handler (เหมือน pythongosssss's ShowText)
- **วิธีที่ไม่ได้ผล:** Custom draw widget (ไม่ได้รับ message จาก backend)
- **Reference:** https://github.com/pythongosssss/ComfyUI-Custom-Scripts/blob/main/web/js/showText.js

### 3. API Endpoints สำหรับ Custom Nodes
- สร้างไฟล์ `api_routes.py` และ import ใน `__init__.py`
- ใช้ `PromptServer.instance.routes` decorator
- Example: `@routes.post("/comfyangel/validate_folder")`
