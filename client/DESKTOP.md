# 4B-easy-POS desktop

Electron hosts the existing React app. NestJS and the Go RFID hub still run separately. The server uses JSON storage by default; MongoDB is optional. Receipts are read from paid transaction snapshots, never from the current basket.

## Run

```sh
cd client
npm ci
npm run desktop:dev
```

If your package manager blocks install scripts and reports that Electron is missing, run `node node_modules/electron/install.js` to download the official runtime.

Development opens a regular window. For kiosk development use `POS_KIOSK=1 npm run desktop:dev`. Port 5173 must be free. For a production UI:

```sh
npm run build
npm run desktop:start
```

Production serves the bundled UI at `http://127.0.0.1:17831` and opens fullscreen/kiosk by default. Set `POS_KIOSK=0` for a regular window. Staff can quit through the OS (Alt+F4 / Cmd+Q); strict OS lockdown and boot auto-start must be configured on the deployment machine.

## Settings

Sign in to Admin, open the printer settings at `/admin/printer`, choose an OS-installed printer and 58 or 80 mm paper, save, then print a test. Install the manufacturer's driver and set roll paper/cutter settings in the OS. Mock mode records successful simulated jobs without sending paper. Save settings before testing; the test uses saved settings.

The app bundles a Lao font (SIL Open Font License in `public/fonts/OFL.txt`). Native printing renders a separate HTML receipt, waits for the font, and submits silently to the configured OS device. Printer enumeration confirms an installed driver, not physical connectivity or paper availability. Validate margins, long receipts and cutter behavior on the actual printer/OS.

## Configuration

React's `VITE_*` variables are read at build time. Electron's `POS_*` variables are read when starting the desktop app. Configure both sides to use the same backend/device:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3000` | React API |
| `VITE_SOCKET_URL` | `http://localhost:3000` | React Socket.IO |
| `VITE_DEVICE_ID` | `RPi-POS-01` | React device |
| `POS_API_URL` | `http://localhost:3000` | Electron receipt/status API |
| `POS_DEVICE_ID` | `RPi-POS-01` | Restrict receipts to this device |
| `POS_KIOSK` | `1` in production, `0` in development | Fullscreen/kiosk |
| `POS_PAYMENT_ORIGINS` | `https://payment-link-sandbox.netlify.app,https://payment-gateway.phajay.co` | Comma-separated exact HTTPS origins allowed in payment window |

Use actual PhaJay origins for production. External payment pages run in a sandboxed child window without the POS preload bridge. Add required redirect origins explicitly. The provider return URL may point to `/payment-return` on the POS origin when reachable; completion always comes from the backend, with status polling every three seconds, so a remote return page is not required to authorize printing. Electron closes the payment window when PAID is observed.

## Queue and recovery

`print-queue.json` lives in Electron's per-user application data directory. Writes replace an atomic temporary file. A single app instance and serialized queue prevent duplicate automatic submission of the same payment ID, including Socket/polling duplicates and restarts. The active payment is saved in browser local storage until the print job has been recorded. Queued jobs resume after restart; failed jobs require manual retry.

Statuses:
- `queued`: saved, not yet submitted.
- `printing`: submission in progress.
- `submitted`: OS accepted the request; physical printing is not confirmed.
- `failed`: preparation failed (network, invalid receipt, printer not configured). Safe to retry.
- `uncertain`: submission failed/timed out or the app stopped during submission. Inspect paper and OS spooler before retrying. Never automatically resubmitted.
- `mock`: simulated; no paper printed.

Manual resubmission after `submitted`/`uncertain` requires a confirmation and labels the receipt as a copy. Attempt count is retained. Queue retains completed jobs for deduplication; only the latest 100 are shown. Do not delete application data if automatic duplicate protection must be preserved. Avoid reinstalling under a different OS user or running the same POS from multiple machines/profiles. Exactly-once physical paper output cannot be guaranteed by an OS spooler.

## Package and validate

```sh
npm run test:printer
npm run test:desktop
npm run desktop:pack
npm run desktop:dist
```

`test:desktop` uses a temporary profile and fake payment server; it does not charge or send paper. It exercises payment recovery, duplicate suppression, restart, printer UI and offline Lao receipt rendering, and prints the location of screenshots/PDF artifacts.

`desktop:pack` creates an unpacked app in `release/`; `desktop:dist` creates an installer for the current platform. Windows NSIS and Linux AppImage targets are configured; build and test on the deployment OS. macOS distribution needs signing/notarization credentials; Windows signing credentials must be supplied for public distribution. No signing secrets are stored in this repo.
