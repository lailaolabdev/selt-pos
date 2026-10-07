# 4B-easy-POS server storage

Production runs on MongoDB. The Docker Compose stack starts a persistent MongoDB container and connects the API to it on port `3001`. JSON storage remains available only for local tests or legacy demo data. API routes, RFID Socket.IO events, admin login, payment snapshots and receipt responses remain compatible with the existing client.

Run from the `server/` directory:

```sh
npm run build
npm run start:prod
```

Docker production stack (uses the locally built `dist/`):

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f pos-server
```

Development: `npm run start:dev`. Configuration in `.env`:

```dotenv
STORAGE_DRIVER=mongo
MONGO_URI=mongodb://localhost:27017/pos_rfid
PORT=3001
```

The file contains products, tags, sessions, payments and admin password hashes. Its format is `{ "version": 1, "collections": { "products": [], "tags": [], "sessions": [], "payments": [], "admins": [] } }`. Existing ObjectIds and timestamps are preserved. Passwords retain their scrypt hashes. Without an existing file, the configured default admin is created on startup; use the normal product/tag APIs to add demo data.

JSON mode keeps a small snapshot in Node memory and serializes writes through one queue, fsyncs a temporary file, then atomically replaces the database file. Schema casting/defaults/validation still use the Mongoose library, but there is **no MongoDB connection or MongoDB process requirement**. Library dependencies are retained so the Mongo option still works.

Only one server process may use a file. A `.lock` file prevents simultaneous writers, and a dead process's lock is recovered on startup. Invalid JSON stops startup without overwriting the file. Stop the server before manually editing, restoring or copying the JSON file for backup. Never delete the file to restart a sale: it includes payment history and sold tag states. Runtime JSON files are excluded from Git and created with private file permissions.

This mode is intended for a small, single-process demo POS. Each write replaces the whole JSON snapshot; it is not suitable for a growing payment history, many concurrent tills, cluster/PM2 workers, or shared network filesystems. Each storage operation is atomic, but the existing multi-step payment webhook is not converted into a cross-collection database transaction. Physical printer recovery still uses Electron's separate local print queue.

## Import existing MongoDB data

Stop the POS server first. Keep MongoDB reachable for this one-time read, and point `MONGO_URI` at the source database. Before the target JSON file has been created:

```sh
npm run storage:import-mongo
```

This copies all five collections without changing MongoDB. The importer refuses to overwrite an existing target file. Choose a new `JSON_DB_PATH` if you need another export. IDs, hashes, paid transactions and sale snapshots are retained. Start the JSON server and verify products/inventory before disabling the old MongoDB service. On 28 September 2026 the workspace's existing data was copied to `storage/data/pos.json` (2 products, 4 tags, 2 sessions, 28 payments, 1 admin).

## Switch back to MongoDB

Set `STORAGE_DRIVER=mongo` and the existing `MONGO_URI`, then restart. This reads the MongoDB database as it was last saved there; changes made in JSON mode are **not automatically copied back**. Keep a backup before switching storage drivers.

`npm run seed:admin` works with either driver. To deliberately reset the configured admin password, set `ADMIN_RESET_PASSWORD=true` for that command only.

## Verify

```sh
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand --testPathPatterns=json-storage
```

JSON integration tests use a temporary file and fake payment provider. They verify auth, products, duplicate RFID tags, inventory, checkout, repeated payment callbacks, receipts and restart persistence with an unreachable Mongo URI.

---

# 4B-easy-POS Server API

NestJS API ສຳລັບ 4B-easy-POS, RFID hub, POS frontend, inventory ແລະ checkout flow.

## Run

```bash
pnpm install
pnpm run start:dev
```

Default API server:

```text
http://localhost:3000
```

Swagger UI:

```text
http://localhost:3000/api-docs
```

## RFID client flow and troubleshooting

Use one active POS/admin workflow per physical reader (`deviceId`). The Go scanner and React client must use the same device ID and API server:

- Go defaults: `RFID_DEVICE_ID=RPi-POS-01`, `RFID_SERVER_URL=http://localhost:3000` (base URL, without `/tags/capture`).
- Client: `VITE_DEVICE_ID=RPi-POS-01`, `VITE_API_URL=http://localhost:3000`, `VITE_SOCKET_URL=http://localhost:3000`.
- Opening POS sets `CHECKOUT`. Opening the product add/edit form sets `CHECK`, collecting known and unknown tag IDs without saving stock until the user saves the form. Closing the form sets `IDLE`.
- `ADD` is available through the API when an existing product has been selected; it registers captures immediately. The product form intentionally uses `CHECK` before saving.

The client serializes mode changes when navigating, re-establishes its mode after reconnect, and polls `/session/:deviceId/snapshot` every 3 seconds for recovery. Both `scanUpdate` and snapshot include **raw** `tagIds` at the top level. In `CHECKOUT`, `result.tagIds` contains only tags accepted into the sale; `result.unknownTagIds` and `result.unavailableTagIds` explain rejected tags. In `CHECK`, `result.tagIds` includes all scanned IDs, with `found` and `unknownTagIds`. Snapshots preserve `SCANNING` / `STABLE` / `IDLE` rather than declaring every nonempty basket stable.

Products must have registered, `available` tags to appear in the POS sale. A `sold`/damaged tag is displayed as unavailable, and an unregistered tag is displayed as unknown. Editing retained tags preserves their status: changing a product must not make sold tags available again.

The Go scanner refreshes a held basket every 5 seconds and retries failed captures using the latest basket. This recovers after a server restart or a mode change while the tags remain on the reader. The scanner collects unique IDs for a 3-second window before posting `STABLE` (or `IDLE` for an empty set). Sparse reads are retained for 4 seconds so they survive that window. The observed 9600-baud reader uses STX + ASCII ID + CR/LF + ETX, which is supported alongside ordinary CR/LF-delimited ASCII; USB port discovery alone does not establish that RFID data is arriving. Unsupported binary reader protocols require the device's protocol documentation.

To trace a missing scan:

1. Go: expect `Serial RX`, `Readable tag received`, `New Tag Found`, then `Syncing` and the HTTP server response. If there are no received bytes across baud rates, inspect reader power/configuration/output mode first.
2. Server: expect `[Incoming Capture]` with the device and tag IDs, and `[Session Status] Mode: CHECK` or `CHECKOUT` for the current page.
3. Read `GET /session/RPi-POS-01/snapshot`: check mode, raw tag IDs, status and result. An empty snapshot means no tags are currently stored; `IDLE` does not calculate a sale.
4. Client: verify the configured API/socket/device match Go. Open the product form to collect tags, save them, then use POS to sell available tags. Keep other tabs for the same physical reader out of competing modes.

Browser verification uses real Nest + JSON + Socket.IO + React with simulated captures and an actual Go sender. It creates a temporary database/profile, does not open RFID hardware, and does not create a payment or print:

```sh
cd ../client
npm run test:rfid
```

Requires installed Chrome, Go and project dependencies. Tests cover product registration, held tag recovery, page mode transitions, device filtering, POS totals, empty baskets, unknown/sold tags, HTTP fallback, reload, editing and preserved stock status. For physical reader verification, run Go and place a real tag on the reader; simulated browser tests do not certify the hardware protocol.

## RFID Hub Test Flow

ໃຊ້ Swagger UI ທົດສອບກ່ອນຕໍ່ RFID hub ຈິງ.

### 0. Admin Login

`POST /auth/admin/login`

Default account ສ້າງອັດຕະໂນມັດຕອນ server start ຖ້າຍັງບໍ່ມີ admin:

```json
{
  "username": "admin",
  "password": "admin"
}
```

ນຳ `accessToken` ທີ່ໄດ້ໄປກົດ Authorize ໃນ Swagger ແລ້ວໃສ່ເປັນ Bearer token. ຄ່າ default ປ່ຽນໄດ້ດ້ວຍ environment variables:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
ADMIN_DISPLAY_NAME=Administrator
ADMIN_TOKEN_SECRET=change-this-secret
ADMIN_TOKEN_TTL_SECONDS=86400
```

### 1. Create Product

`POST /products`

```json
{
  "name": "ເສື້ອ 4B Digital Week",
  "sku": "TSHIRT-4B-001",
  "basePrice": 99000,
  "category": "souvenir",
  "imageUrl": "https://placehold.co/600x400?text=4B+Product"
}
```

ເກັບ `_id` ຈາກ response ໄວ້ເປັນ `productId`.

### 2. Register RFID Tags To Product

`POST /tags/sync`

```json
{
  "deviceId": "RPi-POS-01",
  "mode": "add",
  "productId": "PASTE_PRODUCT_ID_HERE",
  "tagIds": [
    "E280689400004003ABCD0001",
    "E280689400004003ABCD0002"
  ]
}
```

### 3. Set POS Device To Checkout Mode

`POST /session/set-mode`

```json
{
  "deviceId": "RPi-POS-01",
  "mode": "CHECKOUT"
}
```

### 4. Simulate RFID Hub Sending Basket Tags

`POST /tags/capture`

```json
{
  "deviceId": "RPi-POS-01",
  "tagIds": [
    "E280689400004003ABCD0001",
    "E280689400004003ABCD0002"
  ],
  "status": "STABLE"
}
```

Expected response shape:

```json
{
  "transactionId": "66f0c2d4b7f1c9a001234999",
  "items": [
    {
      "name": "ເສື້ອ 4B Digital Week",
      "imageUrl": "https://placehold.co/600x400?text=4B+Product",
      "count": 2,
      "subtotal": 198000
    }
  ],
  "totalPrice": 198000,
  "tagIds": [
    "E280689400004003ABCD0001",
    "E280689400004003ABCD0002"
  ]
}
```

### 5. Confirm Sale

`PATCH /tags/confirm-sale`

```json
{
  "transactionId": "PASTE_TRANSACTION_ID_HERE",
  "tagIds": [
    "E280689400004003ABCD0001",
    "E280689400004003ABCD0002"
  ]
}
```

## Important Endpoints

- `POST /session/set-mode` - ຕັ້ງ mode ຂອງ RFID/POS device.
- `POST /tags/capture` - endpoint ຫຼັກທີ່ RFID hub ສົ່ງ tagIds ເຂົ້າ server.
- `POST /tags/sync` - manual sync/register/check/checkout tags ຜ່ານ Swagger.
- `PATCH /tags/confirm-sale` - mark tags ເປັນ sold ຫຼັງຊຳລະເງິນ.
- `POST /payments/phajay/payment-link` - create PhaJay Payment Link ຈາກກະຕ່າ checkout ປັດຈຸບັນ.
- `POST /payments/phajay/qr` - create PhaJay QR ແບບຢູ່ໜ້າ POS ເດີມ.
- `POST /payments/phajay/bio/intent` - ສ້າງ Palm/Vein payment intent ແລະສັ່ງ Bio POS ເປີດໜ້າສະແກນ.
- `POST /payments/phajay/bio/webhook` - ຮັບ webhook `palm_payment.succeeded` ພ້ອມກວດ HMAC-SHA256.
- `POST /tags/dev/capture-product` - ຈຳລອງການສະແກນ RFID ສຳລັບ dev ເທົ່ານັ້ນ (`ENV=dev`).
- `POST /payments/phajay/webhook` - webhook ຈາກ PhaJay; ເມື່ອ `PAYMENT_COMPLETED` ຈະ mark tags ເປັນ sold ແລະ clear basket.
- `GET /payments/phajay/:paymentId/status` - POS frontend ໃຊ້ poll ສະຖານະການຊຳລະ.
- `GET /inventory/summary` - ເບິ່ງ stock ຕາມ product.

## PhaJay Payment Setup

Set these values in `server/.env`:

```text
PHAJAY_PAYMENT_MODE=production
PHAJAY_BASE_URL=https://payment-gateway.phajay.co
PHAJAY_PAYMENT_LINK_PATH=
PHAJAY_QR_BANK=bcel
PHAJAY_QR_PATH=
PHAJAY_SECRET_KEY=
PHAJAY_TEST_KEY=
# Production QR requires the approved merchant secret key above.
```

- POS now calls `POST /payments/phajay/qr` and displays a locally rendered QR inside the 1024×768 payment screen. No external window is opened. The server sends `amount`, ASCII `description`, unique `orderNo`, and tags to the documented `/v1/api/payment/generate-{bank}-qr` endpoint with the `secretKey` header. Production QR requires `PHAJAY_SECRET_KEY`; it never falls back to `PHAJAY_TEST_KEY`. Keys stay on the server. The POS opens payment methods first: Online Payment → select bank → Generate QR. PhaJay BIO Payment is a disabled placeholder for future integration.
- `PHAJAY_PAYMENT_MODE` only controls the legacy Payment Link endpoint, not the embedded QR screen.
- `PHAJAY_PAYMENT_MODE=sandbox` uses `/v1/api/test/payment/get-payment-link`.
- `PHAJAY_PAYMENT_MODE=production` uses `/v1/api/link/payment-link`.
- `PHAJAY_PAYMENT_LINK_PATH` is optional and only needed when PhaJay gives a custom path.
- `PHAJAY_QR_BANK` sets the default for older callers without a `bank` field. The POS sends its selected `bank`: `bcel`, `jdb`, `ldb`, `ib`, `stb`, or `m-money`.
- Embedded QR always uses `https://payment-gateway.phajay.co/v1/api/payment/generate-{bank}-qr`. `PHAJAY_QR_PATH` and `PHAJAY_BASE_URL` overrides do not change this production QR route; base/link path settings apply to legacy Payment Link only.
- Configure PhaJay portal webhook to `https://YOUR_API_DOMAIN/payments/phajay/webhook`.
- BCEL QR must be scanned with BCEL One; other banks cannot scan this QR.
- The POS checks local status every 3 seconds and listens for `paymentUpdate`; it restores the same QR after reload. Closing the QR screen hides it and keeps the payment active; use the Show QR button to reopen it.
- Payment is confirmed only after a matching PhaJay callback with `PAYMENT_COMPLETED` and the exact `txnAmount`. This marks tags sold and clears the basket; Desktop then queues the receipt. Polling local status cannot replace a provider callback.
- A localhost webhook is not reachable from PhaJay: use a public HTTPS server URL or a tunnel and register that URL in the portal. The existing webhook does not yet verify provider signatures. PhaJay requires requesting its signature verification guide/key from support before trusting production callbacks: https://payment-doc.phajay.co/v1/verify-webhook-signature
- QR API documentation: https://payment-doc.phajay.co/v1/connect-payment-QR/generateQR

## Device Modes

- `IDLE` - ຮັບ scan ແຕ່ບໍ່ປະມວນຜົນ.
- `ADD` - ຜູກ tagIds ໃຫ້ productId ທີ່ active.
- `CHECK` - ກວດ tagIds ວ່າຮູ້ຈັກ ຫຼື unknown.
- `CHECKOUT` - ຄິດໄລ່ຕະກ້າ, totalPrice ແລະ transactionId.

## Test

```bash
pnpm run build
pnpm test --runInBand
```
