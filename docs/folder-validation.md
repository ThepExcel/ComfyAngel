# Folder Validation Widget

Widget สำหรับ `LoadAllImagesFromFolder` node ที่ช่วยให้ validation และ preview folder path ก่อน load images.

## Features

1. **Validate Button** — ตรวจสอบว่า path ถูกต้องและมีรูปกี่รูป
2. **Visual Status Display** — แสดง ✓ (valid) หรือ ✗ (invalid) พร้อม message
3. **Path History** — จำ recent folders ที่เคยใช้ (เก็บใน localStorage, สูงสุด 10 items)
4. **Auto-validation** — ถ้ามี path อยู่แล้ว จะ validate อัตโนมัติเมื่อโหลด node

## Usage

### 1. พิมพ์ folder path

```
folder_path: D:\images\batch1
```

### 2. กด "Validate Folder"

Widget จะแสดง:
- ✓ **Found 25 image(s)** (ถ้า valid)
- ✗ **Path does not exist** (ถ้า invalid)

### 3. เลือกจาก Recent Folders

Widget จะแสดง list ของ paths ที่เคยใช้:
- คลิกที่ path เพื่อเลือก
- จะ auto-validate หลังเลือก

### 4. Run node ตามปกติ

หลัง validate แล้ว สามารถกด Queue prompt ได้เลย

## Supported Extensions

```
.png, .jpg, .jpeg, .webp, .bmp, .gif
```

## Notes

- Path history เก็บใน `localStorage` (browser-specific)
- รองรับ `include_subdirs` parameter จาก node
- Validation ทำงานผ่าน API endpoint `/comfyangel/validate_folder`

## Error Messages

| Message | Meaning |
|---------|---------|
| Path is empty | ไม่ได้กรอก path |
| Path does not exist | Path ไม่มีอยู่จริง |
| Path is not a directory | Path ไม่ใช่โฟลเดอร์ |
| Permission denied | ไม่มีสิทธิ์เข้าถึง |
| No valid images found | ไม่มีรูปใน folder |

## API Endpoint

### POST `/comfyangel/validate_folder`

**Request:**
```json
{
  "folder_path": "D:\\images\\batch1",
  "include_subdirs": false
}
```

**Response:**
```json
{
  "valid": true,
  "message": "Found 25 image(s)",
  "count": 25
}
```

## Implementation Files

- **JS Widget:** `js/folder_widget.js`
- **API Routes:** `api_routes.py`
- **Node:** `nodes/loader_nodes.py` (LoadAllImagesFromFolder)
