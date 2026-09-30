# AGENT.md — AutoPOS / RFID Hub

เอกสารนี้เป็นคู่มือสำหรับ agent และนักพัฒนาที่ทำงานต่อในโปรเจกต์ AutoPOS ซึ่งจะใช้สาธิตในงาน Digital Week ร่วมกับ RFID hub, ลำโพง/AI และเครื่องพิมพ์ โดยหน้าจอสำหรับผู้ใช้งานต้องเป็นภาษาลาวทั้งหมด

## เป้าหมายของระบบ

สร้างจุดชำระเงินแบบตะกร้าอัจฉริยะ:

1. RFID reader อ่าน tag ในตะกร้า
2. RFID hub ส่งรายการ tag ปัจจุบันเข้า backend
3. Backend แปลง tag เป็นสินค้า คำนวณยอด และส่งผลแบบ realtime
4. ผู้ใช้เห็นรายการสินค้า/ยอดเงินเป็นภาษาลาว
5. ระบบรับการยืนยันการชำระเงิน พิมพ์ใบเสร็จ และประกาศเสียงได้
6. โหมดจัดการสินค้าและตรวจนับสต็อกใช้ tag เดียวกันได้

## โครงสร้างปัจจุบัน

- `client/`: React 19 + Vite + TypeScript + Tailwind + Zustand + TanStack Query
  - `pages/POSPage.tsx`: หน้า POS อัตโนมัติ public ที่ `/` (ปัจจุบัน QR/การจ่ายเงินยังเป็น mock)
  - `pages/LoginPage.tsx`: หน้า login demo สำหรับเข้า admin
  - `pages/ProductsPage.tsx`: CRUD สินค้าและผูก RFID tags
  - `pages/InventoryPage.tsx`: สรุปจำนวน tag ที่มีสถานะ available
  - `components/Layout.tsx`: layout เฉพาะพื้นที่ Admin ที่ `/admin/*`
  - `store/useCartStore.ts`: state ของอุปกรณ์/ตะกร้า
  - `hooks/useSocketSync.ts`: รับ `scanUpdate` ผ่าน Socket.IO
- `server/`: NestJS + Socket.IO; storage เริ่มต้นเป็น JSON (`storage/data/pos.json`), เลือก MongoDB ได้ด้วย `STORAGE_DRIVER=mongo`
  - `storage/`: JSON adapter ใช้ schema validation เดิมโดยไม่เชื่อม MongoDB; ต้องรัน server หนึ่ง process ต่อไฟล์
  - `products/`: สินค้า
  - `tags/`: RFID tag, sync, confirm sale, inventory summary
  - `sessions/`: device mode, capture, realtime gateway
- `hub_scanner/`: Go RFID serial gateway
  - อ่าน serial, debounce/expiry tag, ส่ง `POST /tags/capture`

## Flow และสัญญาข้อมูลที่มีอยู่

- Device id ปัจจุบัน: `RPi-POS-01`
- mode: `IDLE`, `ADD`, `CHECK`, `CHECKOUT`
- Hub ส่ง `{ deviceId, tagIds, status }` ไปที่ `POST /tags/capture`
- หน้าเว็บสั่ง `POST /session/set-mode`
- Backend ส่ง Socket.IO event `scanUpdate` รูปแบบ `{ deviceId, mode, result, status }`
- Checkout สร้าง `transactionId` ชั่วคราวและคำนวณจาก tag ที่ `available`
- การขายจริงต้องเรียก `PATCH /tags/confirm-sale` เพื่อเปลี่ยน tag เป็น `sold`

## กฎสำคัญสำหรับ agent

### ภาษาและ UX

- ข้อความที่ผู้ใช้เห็นใน client ต้องเป็นภาษาลาวทั้งหมด รวม title, label, button, error, empty state, status และ dialog
- ชื่อ field/API/internal code ใช้ภาษาอังกฤษได้เพื่อความเสถียรของโปรแกรม
- ชื่อผลิตภัณฑ์ที่แสดงบนหน้าจอคือ `4B-easy-POS` และใช้ asset โลโก้ `client/public/logo.jpeg`
- รวมข้อความ UI ไว้ในไฟล์ locale/translation เดียว ไม่กระจาย string ตาม component เมื่อเริ่มทำ localization
- รองรับฟอนต์ลาวและตรวจการตัดบรรทัด/ขนาดตัวอักษรบนจอที่ใช้แสดงงาน
- ปุ่มสำคัญต้องใช้งานด้วย touch ได้ง่าย และสถานะ RFID ต้องสื่อสารด้วยทั้งสีและข้อความ

### Hardware integration

- ห้ามให้ client เรียก serial, printer หรือ provider ของเสียงโดยตรง ให้ผ่าน backend/device adapter
- ต้องมี interface แยกสำหรับ `RfidReader`, `ReceiptPrinter`, `Speaker` และ `AiVoice`
- ทุกอุปกรณ์ต้องมี mock adapter เพื่อ demo/offline และมี health status ที่อ่านได้
- ห้ามผูกเสียงกับ macOS command (`afplay`) ใน production; Go hub ควรส่ง event แล้วให้ sound service ที่เลือกตาม environment เป็นผู้เล่นเสียง
- ต้องรองรับ reconnect, timeout, duplicate event และการส่งซ้ำโดยไม่ทำให้ขายซ้ำ

### Data integrity

- การ checkout ต้อง snapshot รายการ/ราคาไว้ใน transaction ก่อนการชำระเงิน
- การยืนยันขายต้องเป็น operation ที่ทำซ้ำได้อย่างปลอดภัย (idempotent) และ atomically เปลี่ยน `available` เป็น `sold`
- ต้องแยก `unknown`, `unavailable`, `removed` และ `sold` ให้ผู้ใช้เข้าใจ
- ห้ามใช้ `any` กับ DTO/domain ใหม่; ใช้ DTO + validation และตรวจ ObjectId/จำนวนเงิน
- ราคาควรเก็บเป็น integer หน่วยย่อยของสกุลเงิน ไม่ใช้ floating point ใน flow เงิน
- อย่าลบ tag ของสินค้าโดยไม่ตรวจว่ามีประวัติ transaction แล้ว

### Realtime/state

- `scanUpdate` ต้องมี `eventId`, `deviceId`, `capturedAt`, `status` และรายการ tag ที่เป็น source of truth
- subscribe socket เฉพาะ device/session ที่เกี่ยวข้องเมื่อมีหลายจุดขาย
- cleanup listener ใน React ทุกครั้ง และอย่าเรียก `useSocketSync()` ซ้ำทั้ง `App` และ `Layout`
- ไม่สร้าง QR ด้วย `Math.random()` ใน render; ใช้ payment payload จริงหรือ mock ที่ deterministic

## งานที่พบจากโค้ดปัจจุบัน

1. UI ยังเป็นภาษาอังกฤษทั้งหมด ต้องทำ Lao localization
2. `App` และ `Layout` เรียก `useSocketSync` ซ้ำ มีโอกาส listener ซ้ำ
3. `POST /session/clear` ล้างตะกร้า แต่ checkout ไม่ได้เรียก confirm sale; tag จึงไม่เปลี่ยนเป็น sold
4. `transactionId` เป็น mock และไม่มี transaction/payment model
5. QR เป็น mock ไม่ใช่ QR จาก payment provider และปุ่ม Confirm Payment ยืนยันเองได้
6. Go hub ใช้ device id/server URL แบบ hard-code และยังไม่มี retry/backoff, health endpoint, graceful shutdown
7. Go hub ใช้การหมดอายุ 1.5 วินาทีและเทียบจำนวน tag เป็นหลัก อาจพลาดกรณี tag สลับแต่จำนวนเท่าเดิม
8. `processCheckout`/`handleCheckout` ทำ logic ซ้ำสองจุด ควรรวม domain service เดียว
9. ไม่มี DTO validation/auth/audit log และ CORS เปิด `*`
10. MongoDB URL hard-code และยังไม่มี index/seed/backup/operational setup
11. สถานะ scanner ใน inventory แสดง Connected/Last Sync แบบ hard-code ไม่ใช่ health จริง
12. การพิมพ์ใบเสร็จและเสียง/AI ยังไม่มี adapter หรือ API

## แผนพัฒนา

ดูแผนงานฉบับเต็มที่ [Plane.md](./Plane.md) ซึ่งเป็นเอกสารหลักสำหรับลำดับงาน สถานะ และเกณฑ์เสร็จของระบบ

เมื่อแก้ integration ให้ทดสอบทั้งกรณีปกติ, tag ซ้ำ, tag ไม่รู้จัก, tag ถูกขายแล้ว, scanner disconnect, payment timeout และ printer offline เสมอ
