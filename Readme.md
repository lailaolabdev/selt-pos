# 4B-easy-POS — วิธีรัน RFID และ Desktop POS
go run ./cmd/cart_scanner
ระบบประกอบด้วย 3 ส่วนที่เปิดแยกกัน:

| ส่วน | หน้าที่ |
| --- | --- |
| `server/` | API, Socket.IO, payment และข้อมูลสินค้าในไฟล์ JSON |
| `hub_scanner/` | อ่าน RFID ผ่าน serial/USB แล้วส่งรายการ tag เข้า server |
| `client/` | Desktop POS ด้วย React + Electron และพิมพ์ใบเสร็จ |

ลำดับการเปิด: **Server → RFID hub → Desktop POS** โดยเปิดคนละ Terminal และปล่อยทั้ง 3 ส่วนทำงานไว้

## 1. เตรียมเครื่องและติดตั้งครั้งแรก

ต้องมี Node.js ที่รองรับ dependencies ของโปรเจกต์, npm, pnpm และ Go ตาม `hub_scanner/go.mod` (ปัจจุบัน Go 1.25.6) พร้อม driver USB/serial ของ RFID reader และ driver เครื่องพิมพ์ถ้าจะพิมพ์จริง

บนเครื่องปัจจุบัน รากโปรเจกต์อยู่ที่:

```sh
cd /Users/lailaolabair/lailaolab/pos_rfid
```

ตัวอย่างต่อไปนี้ให้เริ่มจาก **รากโปรเจกต์** ในแต่ละ Terminal หากใช้เครื่องอื่น ให้เปลี่ยน path รากโปรเจกต์ตามตำแหน่งที่ติดตั้ง

ติดตั้ง dependencies ทีละส่วน:

```sh
# Server
cd server
pnpm install --frozen-lockfile
cd ..

# Desktop
cd client
npm ci
cd ..

# RFID hub
cd hub_scanner
go mod download
cd ..
```

ถ้า Electron แจ้งว่า runtime ยังไม่ถูกติดตั้ง ให้รันจาก `client/`:

```sh
node node_modules/electron/install.js
```

### ตั้งค่า Server

ใช้ `server/.env` ที่มีอยู่แล้ว หากเป็นการติดตั้งใหม่ ให้คัดลอก `server/.env.example` เป็น `server/.env` และแก้ค่าให้เหมาะกับเครื่อง

ค่าหลักสำหรับโหมด JSON:

```dotenv
PORT=3000
STORAGE_DRIVER=json
JSON_DB_PATH=storage/data/pos.json
```

โหมดนี้ไม่ต้องเปิด MongoDB ข้อมูลอยู่ใน `server/storage/data/pos.json` รวมสินค้า, tags, sessions, payments และ admin

ข้อมูลเดิมของ workspace นี้ย้ายมา JSON แล้ว จึงไม่ต้อง import ซ้ำ สำหรับการย้ายข้อมูลจาก MongoDB บนเครื่องอื่น ดู [คู่มือ Server](server/README.md)

บัญชี Admin ใช้บัญชีเดิมในข้อมูล JSON หรือค่าที่ตั้งใน `server/.env` สำหรับการติดตั้งใหม่

### ตั้งค่า Desktop

สร้างหรือแก้ `client/.env.local`:

```dotenv
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
VITE_DEVICE_ID=RPi-POS-01
```

`VITE_*` มีผลตอนเปิด Vite หรือ build แอป หลังแก้ให้ restart โหมด dev หรือ build ใหม่

## 2. Terminal ที่ 1 — เปิด Server

สำหรับเครื่อง POS สเปกต่ำ ให้ build ครั้งแรกหรือเมื่อโค้ดเปลี่ยน แล้วรันโค้ดที่ build แล้ว:

```sh
cd server
npm run build
npm run start:prod
```

ครั้งถัดไปที่ไม่ได้แก้โค้ด:

```sh
cd server
npm run start:prod
```

เปิด Swagger เพื่อตรวจ API ได้ที่ `http://localhost:3000/api-docs` และ log จะระบุว่าใช้ JSON storage

ระหว่างพัฒนา ใช้คำสั่งนี้แทน:

```sh
cd server
npm run start:dev
```

ให้ใช้ JSON file หนึ่งไฟล์กับ server หนึ่ง process และหยุด server ก่อนสำรองหรือแก้ไฟล์ข้อมูลด้วยมือ

## 3. Terminal ที่ 2 — เปิด RFID hub

เสียบ RFID reader เข้ากับเครื่อง แล้วรัน:

```sh
cd hub_scanner
go run ./cmd/cart_scanner
```

โปรแกรมค้นหาพอร์ตที่เสียบอยู่จริงอัตโนมัติบน macOS และ Windows ไม่ต้องกำหนด `RFID_PORT` ตามชื่อพอร์ตของแต่ละเครื่อง โดยให้ความสำคัญกับ USB adapter `1A86:7523` ที่ตรวจพบบน reader ปัจจุบัน ถ้าไม่พบ ID นี้ จะเลือก USB serial ที่มีเพียงตัวเดียว หากยังไม่ได้เสียบ reader โปรแกรมจะรอและค้นหาใหม่ทุก 2 วินาทีจนพบอุปกรณ์

บน macOS ใช้ `/dev/cu.*` และตัดพอร์ต Bluetooth/debug-console ออก บน Windows ค้นหาจาก COM ที่ระบบรายงานจริง รวม COM หมายเลขสูงกว่า 32 ถ้ามีอุปกรณ์ตรงกันหลายตัว โปรแกรมจะหยุดพร้อมแสดงพอร์ตให้เลือก โดยใช้ `RFID_PORT` หรือกรองด้วย `RFID_USB_VID`, `RFID_USB_PID`, `RFID_USB_SERIAL` (USB ID บอกชนิด adapter ไม่ได้ยืนยันว่าเป็น RFID)

ดูรายการพอร์ตพร้อม USB ID โดยไม่เปิดพอร์ตหรือส่งข้อมูลเข้า server:

```sh
go run ./cmd/cart_scanner --list-ports
```

โปรแกรมลอง baud `9600`, `115200`, `57600` จนได้รับ frame ID ที่อ่านได้ ไม่ถือว่าการเปิดพอร์ตสำเร็จยืนยัน baud โดย reader ปัจจุบันพบข้อมูลจริงที่ **9600 baud** ในรูปแบบ `STX + ID + CR/LF + ETX`

เมื่อพบแท็ก โปรแกรมจะรวบรวมชุด ID ไม่ซ้ำประมาณ **3 วินาที** แล้ว POST `/tags/capture` พร้อม `deviceId`, `tagIds`, `status: STABLE` ดู log `New Tag Found` → `RFID set checked for 3 seconds` → `Syncing` → `Server received capture: 201 Created` ถ้า server ไม่รับจะแสดงข้อผิดพลาดและลองส่งใหม่

ตัวอย่างสำหรับ reader ปัจจุบัน โดยให้ค้นหาพอร์ตอัตโนมัติ:

```sh
RFID_BAUD=9600 go run ./cmd/cart_scanner
```

ตัวอย่างค้นหาพอร์ตอัตโนมัติ โดยกำหนดเฉพาะ baud rate บน macOS:

```sh
RFID_BAUD=115200 go run ./cmd/cart_scanner
```

### macOS

ตรวจชื่อ port:

```sh
ls /dev/cu.*
```

ตัวอย่างรันจาก `hub_scanner/` โดยเปลี่ยนชื่อ port และ baud rate ตามอุปกรณ์:

```sh
RFID_PORT=/dev/cu.usbserial-1110 RFID_BAUD=115200 go run ./cmd/cart_scanner
```

### Linux / Raspberry Pi

ตรวจชื่อ port:

```sh
ls /dev/serial/by-id/
ls /dev/ttyUSB* /dev/ttyACM*
```

ตัวอย่าง:

```sh
RFID_PORT=/dev/ttyUSB0 RFID_BAUD=115200 go run ./cmd/cart_scanner
```

หากไม่มีสิทธิ์เปิด serial port ให้ตั้งสิทธิ์ของผู้ใช้กับอุปกรณ์ serial ตามระบบปฏิบัติการที่ใช้

### Windows — PowerShell

รันจาก `hub_scanner/` ให้ค้นหา COM port อัตโนมัติ:

```powershell
$env:RFID_BAUD = "115200"
go run ./cmd/cart_scanner
```

ถ้าเคยตั้ง `RFID_PORT` ไว้ ให้ล้างด้วย `Remove-Item Env:RFID_PORT -ErrorAction SilentlyContinue` เพื่อกลับไปค้นหาอัตโนมัติ

หากต้องการกำหนด COM port เอง ให้ดูชื่อใน Device Manager แล้วใช้:

```powershell
$env:RFID_PORT = "COM6"
$env:RFID_BAUD = "115200"
go run ./cmd/cart_scanner
```

### Build RFID hub สำหรับใช้งานประจำ

จาก `hub_scanner/`:

```sh
go build -o cart_scanner ./cmd/cart_scanner
./cart_scanner
```

บน Windows:

```powershell
go build -o cart_scanner.exe ./cmd/cart_scanner
.\cart_scanner.exe
```

ตัวแปร `RFID_PORT` และ `RFID_BAUD` ใช้กับ binary ที่ build แล้วได้เช่นกัน

**ค่าที่ RFID hub ใช้อยู่ในโค้ดปัจจุบัน:**

- ส่งไปที่ `http://localhost:3000/tags/capture`
- ใช้ device id `RPi-POS-01`
- อ่าน tag เป็นข้อความที่มี newline คั่นแต่ละ tag
- อ่านไม่พบ tag ประมาณ 4 วินาที จะนำ tag ออกจากชุด แล้วส่งชุดใหม่หลังหน้าต่างรวบรวม 3 วินาที

ถ้าเปลี่ยนเครื่อง server หรือ device id ให้ตั้ง `RFID_SERVER_URL` (base URL เช่น `http://192.168.1.10:3000` ไม่ต้องใส่ `/tags/capture`) และ `RFID_DEVICE_ID` ให้ตรงกับ `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_DEVICE_ID` ของ Desktop ไม่ต้องแก้โค้ด Go

Go จะส่งตะกร้าที่มีแท็กค้างอยู่ซ้ำทุก 5 วินาที และลองใหม่เมื่อ server ตอบผิดพลาด เพื่อกู้ข้อมูลเมื่อเปลี่ยนหน้า/รีสตาร์ต server

**วิธีใช้งานจริง:** เปิดฟอร์มเพิ่มหรือแก้สินค้าใน Admin เพื่อให้ reader อยู่โหมด `CHECK` → วางแท็กและบันทึกสินค้า → ไปหน้า POS ซึ่งตั้งโหมด `CHECKOUT` อัตโนมัติ → วางแท็กที่ผูกสินค้าและยังไม่ขายแล้ว หน้า POS จะแสดงราคา แท็กที่ไม่รู้จักหรือขายแล้วจะแสดงคำเตือน ใช้งาน reader หนึ่งตัวกับหน้าที่ทำงานอยู่หนึ่งหน้าต่อครั้ง

ตรวจ flow หน้าจอและ server ด้วยข้อมูลจำลองแยกจากข้อมูลจริง:

```sh
cd client
npm run test:rfid
```

รายละเอียด event และ troubleshooting ดู [server/README.md](server/README.md#rfid-client-flow-and-troubleshooting)

## 4. Terminal ที่ 3 — เปิด Desktop POS

### โหมดพัฒนา

```sh
cd client
npm run desktop:dev
```

คำสั่งนี้เปิด Vite และ Electron ให้พร้อมกัน ใช้ port `5173` และเปิดเป็นหน้าต่างปกติ จึงไม่ต้องเปิด `npm run dev` แยกอีกตัว

ถ้าต้องการทดสอบ fullscreen/kiosk บน macOS หรือ Linux:

```sh
cd client
POS_KIOSK=1 npm run desktop:dev
```

Windows PowerShell:

```powershell
cd client
$env:POS_KIOSK = "1"
npm run desktop:dev
```

### โหมดใช้งานบนเครื่อง POS

Build ครั้งแรกหรือเมื่อแก้ frontend:

```sh
cd client
npm run build
npm run desktop:start
```

ครั้งถัดไปที่ไม่ได้แก้ frontend:

```sh
cd client
npm run desktop:start
```

โหมดนี้ใช้ไฟล์ที่ build แล้ว ไม่เปิด Vite และเปิด fullscreen/kiosk โดยอัตโนมัติ หน้าเว็บภายในแอปอยู่ที่ `http://127.0.0.1:17831`

ออกจากแอปด้วยคำสั่งของ OS เช่น `Cmd+Q` บน macOS หรือ `Alt+F4` บน Windows โหมดนี้ยังไม่ได้ตั้ง OS lockdown หรือเปิดแอปอัตโนมัติหลังเปิดเครื่อง

### หาก Desktop ต่อ server คนละเครื่อง

เปลี่ยน `VITE_API_URL` และ `VITE_SOCKET_URL` ใน `client/.env.local` แล้ว build ใหม่ พร้อมตั้ง `POS_API_URL` ตอนเปิด Electron ให้เป็น backend เดียวกัน เช่น:

```sh
cd client
POS_API_URL=http://192.168.1.100:3000 npm run desktop:start
```

ถ้าเปลี่ยน device id ให้ตั้ง `VITE_DEVICE_ID` ตอน build และ `POS_DEVICE_ID` ตอนเปิด Electron ให้ตรงกับ hub ด้วย

## 5. ตั้งค่าเครื่องพิมพ์

1. ติดตั้ง driver และทดสอบ printer จาก OS ก่อน
2. เปิด Desktop POS แล้วเข้า Admin
3. เปิดเมนูตั้งค่าเครื่องพิมพ์ หรือหน้า `/admin/printer`
4. เลือกเครื่องพิมพ์และกระดาษ 58 หรือ 80 มม.
5. กดบันทึก แล้วกดพิมพ์ทดสอบ

หากยังไม่มี printer ให้เลือกโหมดจำลองและบันทึก ระบบจะบันทึกงานพิมพ์โดยไม่ส่งกระดาษ

เมื่อ server ยืนยัน payment เป็น `PAID` Desktop จะอ่านรายการจาก transaction แล้วสร้างงานพิมพ์ สถานะ “ส่งงานพิมพ์แล้ว” หมายถึง OS รับงานแล้ว ให้ตรวจใบเสร็จที่เครื่องพิมพ์ด้วย หากสถานะไม่แน่ชัด ให้ตรวจทั้งกระดาษและคิวของ OS ก่อนสั่งพิมพ์ซ้ำ

รายละเอียดเพิ่มเติม: [คู่มือ Desktop และคิวพิมพ์](client/DESKTOP.md)

## 6. ทดลองระบบ

1. เปิด server, hub และ Desktop ตามลำดับ
2. เข้า Admin สร้างสินค้าและผูก RFID tag ที่ใช้ทดสอบกับสินค้านั้น
3. กลับหน้าหลัก POS เพื่อให้เครื่องเข้าสู่โหมด `CHECKOUT`
4. วางสินค้าที่มี tag ในจุดอ่าน และตรวจรายการ/ยอดเงินบนจอ
5. นำสินค้าออก แล้วตรวจว่ารายการเปลี่ยนตาม tag
6. กดชำระเงิน: เลือก Online Payment → เลือก BCEL/JDB/LDB/IB/STB/M MoneyX → Generate QR ผ่าน production ของ PhaJay (`PHAJAY_SECRET_KEY`) ในจอ 1024×768 โดยไม่เปิดหน้าต่างภายนอก ใช้ BCEL One หากตั้ง `PHAJAY_QR_BANK=bcel`
7. เมื่อ backend ได้รับ callback สำเร็จ ตรวจสถานะขายและงานพิมพ์

การใช้ JSON หรือ mock printer **ไม่ได้เปลี่ยน payment เป็นระบบจำลองอัตโนมัติ** การทดสอบชำระผ่านหน้าจอยังต้องมี PhaJay production secret key, อินเทอร์เน็ต และ webhook ที่ provider เรียกถึง server ได้

### ทดสอบหน้าจอโดยไม่ต่อ RFID reader

ไม่ต้องเปิด hub ในกรณีนี้ สร้างสินค้าผ่าน Admin และผูก tag ตัวอย่าง `DEMO-TAG-001` ก่อน จากนั้นกลับหน้าหลัก POS แล้วส่ง capture จำลองจาก Terminal:

```sh
curl -X POST http://localhost:3000/tags/capture \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"RPi-POS-01","tagIds":["DEMO-TAG-001"],"status":"STABLE"}'
```

จำลองการนำสินค้าออก:

```sh
curl -X POST http://localhost:3000/tags/capture \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"RPi-POS-01","tagIds":[],"status":"IDLE"}'
```

ตัวอย่าง curl นี้ใช้รูปแบบ shell ของ macOS/Linux และต้องใช้ tag ที่ผูกสินค้าไว้แล้วและยังมีสถานะ `available`

## ปัญหาที่พบบ่อย

| อาการ | ตรวจสอบ |
| --- | --- |
| Hub ขึ้น `Waiting for RFID serial device` | สาย USB, driver และชื่อ `RFID_PORT`; ใช้ `--list-ports` ตรวจอุปกรณ์ |
| เชื่อม port ได้แต่ไม่มี tag | Baud rate และ reader ต้องส่งข้อมูล tag แบบข้อความคั่นด้วย newline |
| Hub ส่งข้อมูลไม่สำเร็จ | Server ต้องเปิดที่ port `3000` ตาม URL ที่ hub ใช้อยู่ |
| หน้าจอไม่แสดงสินค้า | ผูก tag กับสินค้าแล้ว, tag ยัง `available`, device id ตรงกัน และกลับหน้า POS |
| Port `5173` ถูกใช้งาน | ปิด Vite เดิมก่อนเปิด `desktop:dev` |
| Desktop production เปิดไม่ได้ | รัน `npm run build` ใน `client/` และตรวจว่า port `17831` ว่าง |
| JSON database ขึ้น `already in use` | ต้องเปิด server เพียงหนึ่ง process ต่อไฟล์ |
| ไม่มี printer ในรายการ | ติดตั้ง driver ให้ OS เห็นเครื่อง แล้วกดโหลดใหม่ในหน้าตั้งค่า |
