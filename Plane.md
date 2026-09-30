# แผนพัฒนา AutoPOS สำหรับงาน Digital Week

## เป้าหมายสุดท้าย

ระบบขายสินค้าแบบตะกร้าอัจฉริยะที่ใช้ RFID อ่านสินค้าอัตโนมัติ แสดงผลเป็นภาษาลาว คำนวณยอด ชำระเงิน พิมพ์ใบเสร็จ และประกาศเสียงได้ โดยทำงานต่อได้แม้บางอุปกรณ์หรือ network ขัดข้อง

## สถานะงาน

- [x] มีโครงสร้าง client, server และ RFID hub
- [x] อ่าน RFID และส่ง tag เข้า backend
- [x] คำนวณรายการสินค้าและยอดเงินแบบ realtime
- [x] จัดการสินค้าและผูก RFID tag ได้
- [x] ดูจำนวนสินค้าใน inventory ได้
- [x] ปรับชื่อระบบเป็น `4B-easy-POS` และใช้โลโก้ 4B
- [x] แยกหน้า POS อัตโนมัติออกจาก Admin layout
- [x] เพิ่มหน้า Login และป้องกัน route `/admin/*` ในระดับ frontend (demo)
- [ ] เชื่อม Login กับ authentication ของ backend จริง
- [ ] แปลหน้าจอเป็นภาษาลาวทั้งหมด
- [ ] ยืนยันการชำระเงินจริงและบันทึก transaction
- [ ] เชื่อมต่อเครื่องพิมพ์
- [ ] เชื่อมต่อลำโพง/เสียง/AI
- [ ] ทำ offline/demo mode และทดสอบหน้างาน

## ลำดับการทำงาน

### ระยะที่ 1: ทำให้ระบบเดิมรันได้เสถียร

สถานะ: `กำลังรอทำ`

- แก้ client build จาก unused imports
- แก้การเรียก `useSocketSync()` ซ้ำใน `App` และ `Layout`
- เพิ่ม root README สำหรับวิธีติดตั้งและรันทั้งระบบ
- เพิ่ม `.env.example` ให้ client, server และ RFID hub
- เปลี่ยน MongoDB URL, API URL, device id และ serial port ให้มาจาก environment
- เพิ่ม seed ข้อมูลสินค้าและ RFID tags สำหรับ booth
- ตรวจ build/test/lint ของทุกส่วน

เสร็จเมื่อ: นักพัฒนาคนใหม่สามารถติดตั้งและเปิดระบบได้ตามเอกสาร และ flow scan พื้นฐานทำงานซ้ำได้

### ระยะที่ 2: แปลเป็นภาษาลาวและเตรียมหน้าจอแสดงงาน

สถานะ: `ยังไม่เริ่ม`

- สร้างระบบ locale โดยใช้ `lo` เป็นค่าเริ่มต้น
- แปลเมนู, ปุ่ม, หัวข้อ, ตาราง, dialog, error, empty state และสถานะ RFID ทุกจุด
- กำหนดรูปแบบราคาและสกุลเงินที่ใช้ในงาน
- ตรวจ font ลาว, line-height และการตัดคำบนจอ kiosk
- ออกแบบหน้าจอหลัก: ว่าง, กำลังอ่าน, พร้อมชำระ, รอชำระ, สำเร็จ, ล้มเหลว และ offline
- แสดงสถานะ RFID hub, printer, speaker และ network จาก health จริง

หมายเหตุปัจจุบัน: UI หลักของ POS, Login, Sidebar, Products และ Inventory ถูกปรับเป็นภาษาลาวแล้ว แต่ยังต้องตรวจคำแปลให้ครบทุกข้อความ รวมถึง error จาก API และ dialog ยืนยันการลบ

เสร็จเมื่อ: ผู้เข้าชมสามารถใช้งานหน้าจอได้โดยไม่ต้องอ่านภาษาอังกฤษ

### ระยะที่ 3: ทำ RFID hub ให้พร้อมใช้งานจริง

สถานะ: `ยังไม่เริ่ม`

- แยก serial protocol, parser และ debounce เป็นส่วนทดสอบได้
- ใช้ set/hash ของ tag ตรวจการเปลี่ยนแปลง ไม่ตรวจเฉพาะจำนวน tag
- รองรับ tag เพิ่ม, tag หาย, tag สลับ, tag ซ้ำ และ tag ไม่รู้จัก
- เพิ่ม timeout, retry, exponential backoff และ queue เมื่อ backend ไม่พร้อม
- เพิ่ม heartbeat/health endpoint และสถานะ disconnected/reconnecting
- ย้าย `deviceId`, server URL, RFID port และ baud rate เป็น config
- เพิ่ม graceful shutdown และ log ที่อ่านง่าย

เสร็จเมื่อ: ถอด/ใส่สินค้าและตัด network แล้วระบบกลับมาทำงานต่อได้โดยไม่เกิดรายการผิดหรือขายซ้ำ

### ระยะที่ 4: ทำ checkout และ transaction ให้ถูกต้อง

สถานะ: `ยังไม่เริ่ม`

- เพิ่ม `Transaction` schema พร้อม line items และราคา ณ เวลาขาย
- แยกสถานะ `pending`, `paid`, `cancelled`, `expired`, `failed`
- ทำ reservation ป้องกัน tag เดียวกันถูก checkout พร้อมกันหลายครั้ง
- ทำ confirm payment แบบ idempotent
- หลังชำระสำเร็จจึงเปลี่ยน tag จาก `available` เป็น `sold`
- รองรับยกเลิก, timeout, payment failed และ retry
- ตรวจยอดเงินด้วย integer minor units ไม่ใช้ floating point ใน logic เงิน
- เพิ่ม audit log สำหรับ scan, checkout, payment และการเปลี่ยนสถานะ tag

เสร็จเมื่อ: ชำระสำเร็จหนึ่งครั้งจะสร้าง transaction เดียวและ tag ถูกขายเพียงครั้งเดียว

### ระยะที่ 5: เชื่อมต่อ payment และสร้างใบเสร็จ

สถานะ: `ยังไม่เริ่ม`

- เลือกวิธีชำระเงินสำหรับ demo เช่น QR payment หรือ mock payment ที่ควบคุมได้
- สร้าง QR จาก payment payload จริง ไม่ใช้ pattern สุ่มในหน้าเว็บ
- เพิ่ม payment callback/status polling ตาม provider ที่เลือก
- สร้าง `ReceiptPrinter` interface และ mock printer
- เพิ่ม print job, print status, retry และป้องกันพิมพ์ใบเสร็จซ้ำ
- ออกแบบใบเสร็จภาษาลาว พร้อมชื่อสินค้า จำนวน ราคา ยอดรวม และเลข transaction
- ทดสอบ printer offline, กระดาษหมด และการพิมพ์ซ้ำ

เสร็จเมื่อ: การชำระสำเร็จแสดงผลสำเร็จและพิมพ์ใบเสร็จได้ หรือแจ้ง fallback ภาษาลาวอย่างชัดเจน

### ระยะที่ 6: ลำโพง เสียง และ AI

สถานะ: `ยังไม่เริ่ม`

- สร้าง `Speaker` และ `AiVoice` interface
- ทำ mock/local sound adapter ก่อนเชื่อม hardware จริง
- เพิ่มเสียงสำหรับอ่าน tag เสถียร, ยอดรวม, รอชำระ, ชำระสำเร็จ และเกิดข้อผิดพลาด
- เพิ่ม TTS/AI voice เฉพาะกรณีที่ network พร้อม
- มี fallback เป็นเสียงสำเร็จรูปเมื่อ AI ใช้งานไม่ได้
- จำกัด queue เสียงและป้องกันการพูดซ้ำจาก RFID event
- ทดสอบเสียงในสภาพแวดล้อมจริงของบูธ

เสร็จเมื่อ: ผู้เข้าชมได้รับ feedback ทางเสียงทุกสถานะสำคัญ โดยระบบไม่ค้างเมื่อ AI/network ล่ม

### ระยะที่ 7: เตรียมติดตั้งและแสดงงาน

สถานะ: `ยังไม่เริ่ม`

- ทำ kiosk mode และ auto-start สำหรับ client/server/hub
- เพิ่มปุ่ม reset สำหรับ staff พร้อมยืนยันก่อนล้าง session
- ทำ offline/demo mode ที่ใช้ข้อมูลจำลองได้โดยไม่ต่อ RFID/payment/printer
- เพิ่ม recovery เมื่อ app, hub หรือ network restart
- ทดสอบ end-to-end: RFID → cart → payment → sold → receipt → voice
- เตรียม test tags, สินค้าสำรอง, สายไฟ, network สำรอง และเครื่องพิมพ์สำรอง
- เตรียม backup database และขั้นตอนกู้คืน
- ทำ checklist ก่อนเปิดบูธและบันทึกปัญหาที่พบ

เสร็จเมื่อ: เปิดบูธได้ต่อเนื่อง และมีวิธี fallback หากอุปกรณ์ใดอุปกรณ์หนึ่งเสีย

## งานที่ควรเริ่มทันที

1. เชื่อม Login demo เข้ากับ authentication ของ backend
2. แยก socket sync ให้เหลือ listener เดียว
3. ทำ Lao locale กลาง และแปลข้อความที่เหลือให้ครบ
4. เพิ่ม transaction/confirm sale เพื่อป้องกันข้อมูลขายผิด
5. เพิ่ม mock mode สำหรับซ้อม flow โดยไม่ต้องใช้อุปกรณ์จริง

## Definition of Done

- หน้าจอที่ผู้เข้าชมเห็นเป็นภาษาลาวทั้งหมด
- RFID เพิ่ม/นำสินค้าออกแล้ว cart ตรงกับ tag จริง
- tag ไม่รู้จักหรือขายแล้วมีข้อความแจ้งเตือนที่เข้าใจง่าย
- ยอดเงินถูกต้องและ transaction ไม่ซ้ำ
- ชำระสำเร็จแล้ว tag เปลี่ยนเป็น `sold`
- พิมพ์ใบเสร็จและประกาศเสียงได้ พร้อม fallback เมื่ออุปกรณ์ล้มเหลว
- มี mock/offline mode สำหรับซ้อมงาน
- มีคำสั่งติดตั้ง รัน ทดสอบ และ recovery ที่เขียนไว้ครบ

## คำสั่งตรวจสอบก่อนส่งงาน

```bash
cd client && npm run build && npm run lint
cd ../server && npm run build && npm test -- --runInBand
cd ../hub_scanner && GOCACHE=/private/tmp/autopos-go-cache go test ./... && GOCACHE=/private/tmp/autopos-go-cache go vet ./...
```
go run ./cmd/cart_scanner

## Electron และเครื่องพิมพ์ (28 กันยายน 2026)

- [x] Electron main/preload แยกจาก React พร้อม fullscreen/kiosk
- [x] ReceiptPrinter device adapter รองรับ OS driver และ mock
- [x] Receipt API อ่าน snapshot จาก payment ที่ PAID เท่านั้น
- [x] คิวพิมพ์บันทึกลงเครื่อง ป้องกัน event ซ้ำ และกู้คืนหลัง restart
- [x] หน้าตั้งค่าเครื่องพิมพ์ภาษาลาว กระดาษ 58/80 มม. และ manual retry
- [x] ฟอนต์ลาวในแอปและใบเสร็จ ไม่ต้องโหลดจากอินเทอร์เน็ต
- [x] Unit tests, Electron integration test และแพ็กแอป macOS แบบไม่เซ็น
- [ ] ทดสอบ printer รุ่นจริง กระดาษหมด สายหลุด cutter และ OS ปลายทาง
- [ ] ตั้ง OS kiosk lockdown, auto-start และ code signing สำหรับแจกจ่าย

วิธีรันและข้อจำกัดของสถานะงานพิมพ์: [client/DESKTOP.md](./client/DESKTOP.md)


## Lightweight storage สำหรับ POS จำลอง (28 กันยายน 2026)

- [x] เปลี่ยน storage เริ่มต้นเป็น JSON โดย API เดิมยังใช้ได้
- [x] ปิดการเชื่อม MongoDB ในโหมด JSON และมีตัวเลือกกลับไป MongoDB
- [x] บันทึกสินค้า tags sessions payments และ admin hashes ลงไฟล์
- [x] จัดคิวเขียนไฟล์ atomic replacement และล็อกไม่ให้หลาย process เขียนพร้อมกัน
- [x] ย้ายข้อมูลเดิมจาก MongoDB ลง `server/storage/data/pos.json` โดยไม่ลบต้นฉบับ
- [x] ทดสอบ login → RFID → payment จำลอง → ใบเสร็จ → restart

รายละเอียดและวิธีสำรองข้อมูล: [server/README.md](./server/README.md)
