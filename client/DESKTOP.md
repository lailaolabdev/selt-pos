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

### Windows USB thermal printer (80 mm)

The default **Windows driver** connection uses Electron's printer list and the driver's page/cutter settings. For ESC/POS printers, the POS can also send raw receipts through a Windows printer queue, network IP, or a Windows COM port. Raw mode sends the receipt as a raster image, then sends paper-feed and cutter commands.

If the USB printer interface was changed to **WinUSB with Zadig**, select **USB via Zadig (ESC/POS)** instead of the Windows driver/queue connection. The app uses `escpos-usb` to discover USB printer-class devices and sends the raster receipt, feed, and cut bytes directly to the selected VID/PID. Choose a discovered VID/PID, or enter the hexadecimal VID and PID shown in Zadig or Windows Device Manager, then save and print a test. `USB008` is a Windows spooler port and is not used by this mode. Replacing a device's Windows printer driver with WinUSB can make its Windows printer queue unavailable; this is expected. If more than one connected device has the same VID/PID, unplug the other device before printing so the app cannot send a receipt to the wrong one.

1. Install the printer's Windows driver or the manufacturer's setup utility, then connect the USB cable and power on the printer.
2. In **Settings → Bluetooth & devices → Printers & scanners**, confirm that the printer appears and print a Windows test page. Rename it if the store needs a clear name, such as `POS-Thermal-80mm`.
3. Open **Printing preferences** for that printer and set an 80 mm roll/custom paper size, zero or minimum margins, portrait orientation, and the cutter option if the driver exposes one. Disable “Fit to page” or scaling.
4. Start the Electron POS, open **Admin → Printer**, select the Windows printer, choose **80 mm**, save, and press **Print test**. A USB queue is automatically offered in raw Windows queue mode when Windows reports a `USB###` port.

If the Windows printer is named `PrinterPOS-80` on port `USB008` but Electron does not list it, choose **USB via Windows queue (ESC/POS)** and enter `PrinterPOS-80` as the queue name. Enter the printer **name**, not `USB008`: the latter is a Windows USB printer port, not a COM port. Raw queue mode sends ESC/POS and a cutter command through the Windows spooler without depending on Electron's printer enumeration. It requires a printer/driver queue that accepts RAW ESC/POS data; a Windows test page alone does not prove that. Test with paper and verify the receipt and cut before live sales.

If Windows shows the device only under **Ports (COM & LPT)** and it does not appear in **Printers & scanners**, choose **COM/USB-Serial (ESC/POS)** in POS printer settings, refresh the COM list, and set the baud rate to match the printer. If the printer has a LAN port, choose **IP network (ESC/POS)** and enter its IP address and raw-print port (usually 9100). Keep the printer and POS on the same network and verify that raw printing is enabled in the printer configuration.

The app bundles a Lao font (SIL Open Font License in `public/fonts/OFL.txt`). All printing paths render Lao text as an image. Windows driver mode uses the driver's paper and Auto cut settings. Raw ESC/POS mode sends the image, three feed lines and a full-cut command; the printer must support ESC/POS raster printing and have a cutter installed/enabled. Printer enumeration confirms a visible USB device, installed queue, or COM port, not paper availability. Print a test receipt on the actual printer before using it for sales.

## Configuration

React's `VITE_*` variables are read at build time. Electron's `POS_*` variables are read when starting the desktop app. Configure both sides to use the same backend/device:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `https://api-seltpos.soudev.site` | React API |
| `VITE_SOCKET_URL` | `https://api-seltpos.soudev.site` | React Socket.IO |
| `VITE_DEVICE_ID` | `RPi-POS-01` | React device |
| `POS_API_URL` | `https://api-seltpos.soudev.site` | Electron receipt/status API |
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
