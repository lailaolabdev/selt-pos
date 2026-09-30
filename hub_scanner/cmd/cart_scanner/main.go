package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.bug.st/serial"
)

var (
	tagLastSeen    = make(map[string]time.Time)
	lastAnyTagTime time.Time
	lastNewTagTime time.Time
	isStable       bool
	serverURL      = "http://localhost:3000/tags/capture"
	deviceID       = "RPi-POS-01"
	captureClient  = &http.Client{Timeout: 5 * time.Second}
	port           serial.Port
	// This reader is configured for 9600 baud. Keep the default fixed so the
	// driver is never reconfigured while a basket is being read. Set
	// RFID_BAUD explicitly when using a reader with another speed.
	BaudRates = []int{9600}
)

func playSound(name string) {
	// Sound is disabled for the RFID scanner.
}

func readerCommandChecksum(payload []byte) byte {
	sum := 0
	for _, b := range payload {
		sum += int(b)
	}
	return byte(-sum)
}

func setReaderBeeperModeIfRequested() {
	modeConfig := strings.ToLower(strings.TrimSpace(os.Getenv("RFID_READER_BEEP")))
	if modeConfig == "" {
		return
	}

	var mode byte
	switch modeConfig {
	case "0", "off", "quiet", "false":
		mode = 0x00
	case "1", "round":
		mode = 0x01
	case "2", "tag", "on", "true":
		mode = 0x02
	default:
		fmt.Printf("⚠️  Unknown RFID_READER_BEEP value %q. Use off, round, or tag.\n", modeConfig)
		return
	}

	// Common UHF reader protocol: A0 Len Address Cmd Mode Check.
	// Cmd 0x7A sets the reader buzzer mode; address 0xFF is the public address.
	payload := []byte{0x04, 0xFF, 0x7A, mode}
	cmd := append([]byte{0xA0}, payload...)
	cmd = append(cmd, readerCommandChecksum(payload))

	if _, err := port.Write(cmd); err != nil {
		fmt.Println("⚠️  Failed to send RFID reader beeper command:", err)
		return
	}

	time.Sleep(150 * time.Millisecond)
	buf := make([]byte, 32)
	if n, err := port.Read(buf); err == nil && n > 0 {
		fmt.Printf("🔇 RFID reader beeper command sent. Response: % X\n", buf[:n])
	} else {
		fmt.Println("🔇 RFID reader beeper command sent. No response from reader.")
	}
}

func getActiveTagIDs() []string {
	var ids []string
	now := time.Now()
	for id, lastSeen := range tagLastSeen {
		if now.Sub(lastSeen) < tagExpiry {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

func sameTagIDs(a []string, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func main() {
	if value := strings.TrimSpace(os.Getenv("RFID_SERVER_URL")); value != "" {
		serverURL = strings.TrimRight(value, "/") + "/tags/capture"
	}
	if value := strings.TrimSpace(os.Getenv("RFID_DEVICE_ID")); value != "" {
		deviceID = value
	}
	if len(os.Args) == 2 && os.Args[1] == "--list-ports" {
		for _, candidate := range discoverPorts() {
			fmt.Printf("%s (%s)\n", candidate.name, candidate.reason)
		}
		return
	}

	var portCandidates []portCandidate
	for {
		candidate, err := selectRFIDPort(discoverPorts(), portSelectorFromEnv())
		if err != nil {
			fmt.Println("❌", err)
			os.Exit(1)
		}
		if candidate != nil {
			portCandidates = []portCandidate{*candidate}
			break
		}
		fmt.Println("🔎 Waiting for RFID serial device... Plug in the reader (Ctrl+C to stop).")
		time.Sleep(2 * time.Second)
	}

	bauds := BaudRates
	if bStr := os.Getenv("RFID_BAUD"); bStr != "" {
		if b, err := strconv.Atoi(bStr); err == nil && b > 0 {
			bauds = []int{b}
		} else {
			fmt.Println("❌ RFID_BAUD must be a positive number.")
			os.Exit(1)
		}
	}

	var err error
	var connectedPort string
	var connectedBaud int
	for _, candidate := range portCandidates {
		for _, baud := range bauds {
			fmt.Printf("Connecting to %s at %d baud (%s)...\n", candidate.name, baud, candidate.reason)
			mode := &serial.Mode{
				BaudRate: baud,
				DataBits: 8,
				Parity:   serial.NoParity,
				StopBits: serial.OneStopBit,
			}

			port, err = serial.Open(candidate.name, mode)
			if err == nil {
				if err := port.SetReadTimeout(500 * time.Millisecond); err != nil {
					fmt.Println("❌ Cannot set serial read timeout:", err)
					port.Close()
					return
				}
				time.Sleep(500 * time.Millisecond)
				connectedPort = candidate.name
				connectedBaud = baud
				fmt.Printf("🔌 Port opened: %s (Baud: %d; waiting for readable tag data)\n", candidate.name, baud)
				break
			}
			fmt.Printf("   ↳ failed: %v\n", err)
			if port != nil {
				port.Close()
				port = nil
			}
			if terminalPortError(err) {
				break // Changing baud cannot fix a busy/missing/inaccessible port.
			}
		}
		if port != nil {
			break
		}
	}

	if port == nil {
		fmt.Printf("❌ Cannot open RFID port %s: %v\n", portCandidates[0].name, err)
		fmt.Println("  ", portOpenHint(err))
		fmt.Println("   List current devices: go run ./cmd/cart_scanner --list-ports")
		fmt.Println("   For automatic discovery, unset RFID_PORT if it points to an old port.")
		os.Exit(1)
	}
	defer func() {
		if port != nil {
			_ = port.Close()
		}
	}()

	fmt.Printf("🛒 RFID Gateway (Go) started on %s...\n", connectedPort)
	setReaderBeeperModeIfRequested()
	fmt.Printf("📡 Server: %s | Device: %s\n", serverURL, deviceID)
	fmt.Printf("🏷️ Place a tag on the reader and keep it there at %d baud.\n", connectedBaud)
	monitorLoop(bauds, connectedBaud, connectedPort)
}

func openSerialPort(name string, baud int) (serial.Port, error) {
	mode := &serial.Mode{
		BaudRate: baud,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}
	opened, err := serial.Open(name, mode)
	if err != nil {
		return nil, err
	}
	if err := opened.SetReadTimeout(500 * time.Millisecond); err != nil {
		_ = opened.Close()
		return nil, err
	}
	// The macOS USB-serial driver can report a successful open before the
	// adapter has finished restoring its termios state. The first read during
	// that window may fail with ENXIO ("device not configured"). Match the
	// initial connection's settle delay before handing the port to the loop.
	time.Sleep(500 * time.Millisecond)
	return opened, nil
}

// reconnectRFIDPort keeps the gateway alive when macOS resets or briefly loses
// the USB-serial adapter. It waits for the reader and reuses the last baud rate.
func reconnectRFIDPort(lastPort string, baud int) (string, bool) {
	if port != nil {
		_ = port.Close()
		port = nil
	}

	for {
		selector := portSelectorFromEnv()
		candidates := discoverPorts()
		candidate, err := selectRFIDPort(candidates, selector)
		if err != nil {
			fmt.Println("⚠️  RFID reconnect:", err)
			time.Sleep(2 * time.Second)
			continue
		}
		if candidate == nil {
			fmt.Println("🔎 RFID reader disconnected. Waiting to reconnect...")
			time.Sleep(2 * time.Second)
			continue
		}

		// Prefer the previous port when it is still present. This prevents a
		// second USB serial device from silently becoming the RFID reader.
		if selector.port == "" && lastPort != "" {
			for _, available := range candidates {
				if available.name == lastPort {
					copy := available
					candidate = &copy
					break
				}
			}
		}

		fmt.Printf("🔁 Reconnecting to %s at %d baud...\n", candidate.name, baud)
		opened, openErr := openSerialPort(candidate.name, baud)
		if openErr == nil {
			port = opened
			fmt.Printf("✅ RFID reader reconnected on %s\n", candidate.name)
			return candidate.name, true
		}
		fmt.Println("⚠️  RFID reconnect failed:", openErr)
		time.Sleep(2 * time.Second)
	}
}

func monitorLoop(bauds []int, initialBaud int, portName ...string) {
	connectedPort := ""
	if len(portName) > 0 {
		connectedPort = portName[0]
	}
	buf := make([]byte, 1024)
	decoder := tagDecoder{}
	detection := newBaudDetection(bauds, initialBaud, time.Now())
	lastRawLog := time.Time{}
	bytesSinceCheck := 0
	lastSyncAttempt := time.Time{}
	needsSync := false
	batch := scanBatch{}

	for {
		n, err := port.Read(buf)

		nowRead := time.Now()
		if n > 0 {
			lastAnyTagTime = nowRead
			bytesSinceCheck += n
			if !detection.confirmed && nowRead.Sub(lastRawLog) >= time.Second {
				preview := buf[:n]
				if len(preview) > 32 {
					preview = preview[:32]
				}
				fmt.Printf("📥 Serial RX at %d baud: %d bytes | HEX: % X | Text: %q\n", detection.current(), n, preview, preview)
				lastRawLog = nowRead
			}
			for _, tagID := range decoder.feed(buf[:n]) {
				if !detection.confirmed {
					detection.confirmed = true
					fmt.Printf("✅ Readable tag received — using %d baud\n", detection.current())
				}
				if _, exists := tagLastSeen[tagID]; !exists {
					fmt.Printf("🏷️  New Tag Found: %s — collecting unique IDs for 3 seconds\n", tagID)
					lastNewTagTime = nowRead
					isStable = false
				}
				tagLastSeen[tagID] = nowRead
			}
		}

		// Some USB-serial drivers return both data and an error when the device
		// disappears. Consume the bytes first; otherwise the final tag frame is
		// silently lost and the current basket can be reported as empty.
		if err != nil {
			fmt.Println("❌ Serial read error:", err, "— attempting automatic reconnect.")
			// Tests and injected readers do not have a discoverable OS port.
			// Keep their old one-shot behavior while real devices reconnect.
			if connectedPort == "" {
				return
			}
			baudWasConfirmed := detection.confirmed
			var reconnected bool
			connectedPort, reconnected = reconnectRFIDPort(connectedPort, detection.current())
			if !reconnected {
				return
			}
			decoder = tagDecoder{}
			// Keep the last working baud after reconnect. Re-running baud
			// detection here can switch a healthy reader away from 9600 while
			// the tag is still being held on it.
			detection = newBaudDetection(bauds, detection.current(), time.Now())
			detection.confirmed = baudWasConfirmed
			bytesSinceCheck = 0
			lastRawLog = time.Time{}
			continue
		}

		if detection.due(nowRead) {
			if bytesSinceCheck == 0 {
				fmt.Printf("⚠️ No serial bytes received at %d baud. Keep a tag on the reader.\n", detection.current())
			} else {
				fmt.Printf("⚠️ Received %d bytes at %d baud, but no valid text tag ending in CR/LF. Check baud rate or reader output protocol.\n", bytesSinceCheck, detection.current())
			}
			bytesSinceCheck = 0
			if len(bauds) > 1 {
				next := detection.advance(nowRead)
				if err := port.SetMode(&serial.Mode{BaudRate: next, DataBits: 8, Parity: serial.NoParity, StopBits: serial.OneStopBit}); err != nil {
					fmt.Println("❌ Could not change baud rate:", err)
					return
				}
				if err := port.ResetInputBuffer(); err != nil {
					fmt.Println("❌ Could not clear serial buffer:", err)
					return
				}
				decoder = tagDecoder{}
				fmt.Printf("🔎 Trying %d baud...\n", next)
			} else {
				detection.lastTry = nowRead
				fmt.Println("   RFID_BAUD is fixed. Verify this value with the reader configuration.")
			}
		}

		// Cleanup expired tags
		now := time.Now()
		for id, lastSeen := range tagLastSeen {
			if now.Sub(lastSeen) >= tagExpiry {
				delete(tagLastSeen, id)
				fmt.Printf("🗑️  Tag Removed: %s\n", id)
				isStable = false
				lastNewTagTime = now // Reset stability timer on removal too
			}
		}

		activeIDsAfter := getActiveTagIDs()

		wasPending := batch.pending
		batch.observe(activeIDsAfter, now)
		if !wasPending && batch.pending {
			fmt.Printf("⏳ Checking RFID set for 3 seconds (%d unique tags)...\n", len(activeIDsAfter))
		}
		if ids, ready := batch.take(now); ready {
			status := captureStatus(ids)
			isStable = len(ids) > 0
			fmt.Printf("✅ RFID set checked for 3 seconds: %d unique tags [%s]\n", len(ids), strings.Join(ids, ", "))
			needsSync = !sendCaptureToServer(ids, status)
			lastSyncAttempt = time.Now()
		}

		// Retry only failed captures. A successful basket is sent once and stays
		// quiet until its unique tag set changes; this keeps ADD and CHECKOUT
		// flows simple and avoids repeatedly re-processing the same tags.
		if !batch.pending && needsSync && time.Since(lastSyncAttempt) >= 5*time.Second {
			needsSync = !sendCaptureToServer(activeIDsAfter, captureStatus(activeIDsAfter))
			lastSyncAttempt = time.Now()
		}

		if n == 0 {
			time.Sleep(100 * time.Millisecond)
		}
	}
}

func sendCaptureToServer(tagIds []string, status string) bool {
	payload := map[string]interface{}{
		"deviceId": deviceID,
		"tagIds":   tagIds,
		"status":   status,
	}

	jsonData, _ := json.Marshal(payload)
	fmt.Printf("📤 Syncing %d tags to server (Status: %s)\n", len(tagIds), status)
	if len(tagIds) > 0 {
		fmt.Printf("   Tags: %s\n", strings.Join(tagIds, ", "))
	} else {
		fmt.Println("   Tags: <empty>")
	}

	resp, err := captureClient.Post(serverURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("❌ Server Error:", err)
		return false
	}
	defer resp.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fmt.Printf("❌ Server rejected capture: %s | %s\n", resp.Status, strings.TrimSpace(string(body)))
	} else {
		fmt.Printf("✅ Server received capture: %s | %s\n", resp.Status, strings.TrimSpace(string(body)))
	}
	if readErr != nil {
		fmt.Println("⚠️ Could not read server response:", readErr)
	}
	return resp.StatusCode >= 200 && resp.StatusCode < 300 && readErr == nil
}
