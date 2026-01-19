# ComfyAngel Design TODO

> **Last Updated:** 2026-01-19
> **Current Focus:** ทำให้ครบ PRD

---

## Active Tasks

### Fix: composite_widget.js ไม่ทำงาน
- **Status:** in_progress
- **Phase:** HANDOFF (ready to spawn builder)
- **Problem:** Widget เช็ค node name ผิด `ComfyAngel_SmartComposite` (ไม่มี node นี้)
- **Solution:** แก้ให้รองรับ `SmartCompositeXY` และ `SmartCompositeAlign`
- **Files:**
  - `js/composite_widget.js` - แก้ node name check + logic สำหรับ 2 modes
  - `nodes/widget_nodes.py` - reference สำหรับ input names
- **Note:** มีการแก้ไขบางส่วนแล้ว (line 12-23) แต่ยังไม่ครบ

---

## Backlog (PRD Gap)

| Item | PRD Section | Status | Notes |
|------|-------------|--------|-------|
| Smart Position visual picker | 2.2, 6.2 | partial | composite_widget.js มีอยู่แล้ว แค่ไม่ทำงาน |
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
| Phase 4: Visual Widgets - Composite | done | SmartCompositeXY, SmartCompositeAlign (แต่ widget มี bug) |
| Loop nodes | done | Simple + Advanced |
| Loader nodes | done | LoadAllImagesFromFolder, SplitImageBatch |
| Text utilities | done | TextCombine, TextPermutation |

---

## Notes

- **Project Focus:** Parameter Overlay + Visual Widgets
- **Don't Build:** Layer/Blend, Filters, Mask ops (ใช้ LayerStyle)
- **Current Nodes:** 21 nodes total
