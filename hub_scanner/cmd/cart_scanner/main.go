package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"
)

var (
	tagLastSeen    = make(map[string]time.Time)
	lastAnyTagTime time.Time
	lastNewTagTime time.Time
	isStable       bool
	logTimestamps  = make(map[string]time.Time)
	// serverURL      = "https://api-seltpos.soudev.site/tags/capture"
	serverURL = "http://localhost:3000/tags/capture"

	deviceID      = "RPi-POS-01"
	sessionMode   string
	captureClient = &http.Client{Timeout: 5 * time.Second}
	port          serial.Port
	// This reader is configured for 9600 baud. Keep the default fixed so the
	// driver is never reconfigured while a basket is being read. Set
	// RFID_BAUD explicitly when using a reader with another speed.
	BaudRates = []int{9600}
	logMu     sync.Mutex
)

func logThrottled(key string, interval time.Duration, format string, args ...interface{}) {
	logMu.Lock()
	defer logMu.Unlock()
	now := time.Now()
	if previous, ok := logTimestamps[key]; ok && now.Sub(previous) < interval {
		return
	}
	logTimestamps[key] = now
	fmt.Printf(format, args...)
}

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
		captureURL, err := normalizeCaptureURL(value)
		if err != nil {
			fmt.Printf("❌ Invalid RFID_SERVER_URL %q: %v\n", value, err)
			os.Exit(1)
		}
		serverURL = captureURL
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

// RFID_SERVER_URL accepts either the API base URL or the complete capture URL.
// The hub forwards tag snapshots only; the server session mode decides whether
// they are used for stock checks/tag registration or a POS checkout basket.
func normalizeCaptureURL(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", fmt.Errorf("expected an http(s) API base URL or /tags/capture URL")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	if parsed.Path == "" {
		parsed.Path = "/tags/capture"
	} else if !strings.HasSuffix(parsed.Path, "/tags/capture") {
		parsed.Path += "/tags/capture"
	}
	return parsed.String(), nil
}

func openSerialPort(name string, baud int) (serial.Port, error) {
	mode := &serial.Mode{BaudRate: baud, DataBits: 8, Parity: serial.NoParity, StopBits: serial.OneStopBit}
	opened, err := serial.Open(name, mode)
	if err != nil {
		return nil, err
	}
	if err := opened.SetReadTimeout(500 * time.Millisecond); err != nil {
		_ = opened.Close()
		return nil, err
	}
	// Give the macOS USB-serial driver time to restore its termios state.
	time.Sleep(500 * time.Millisecond)
	return opened, nil
}

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
			logThrottled("reconnect-select", 30*time.Second, "⚠️ RFID reconnect: %v\n", err)
			time.Sleep(2 * time.Second)
			continue
		}
		if candidate == nil {
			logThrottled("reconnect-disconnected", 30*time.Second, "🔎 RFID reader disconnected. Waiting to reconnect...\n")
			time.Sleep(2 * time.Second)
			continue
		}
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
		logThrottled("reconnect-failed", 30*time.Second, "⚠️ RFID reconnect failed: %v\n", openErr)
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
	bytesSinceCheck := 0
	batch := scanBatch{}
	readCounts := make(map[string]int)
	// Push changed tag sets quickly for the POS socket, while keeping the
	// three-second batch as the authoritative STABLE snapshot.
	realtimeUpdates := len(portName) > 0
	lastScanningIDs := []string{}
	lastTagChangeAt := time.Time{}
	modeUpdates := make(chan string, 1)
	go func() {
		for {
			mode := fetchSessionMode()
			select {
			case modeUpdates <- mode:
			default:
				select {
				case <-modeUpdates:
				default:
				}
				select {
				case modeUpdates <- mode:
				default:
				}
			}
			time.Sleep(time.Second)
		}
	}()
	type captureUpdate struct {
		ids    []string
		status string
	}
	captureQueue := make(chan captureUpdate, 1)
	queueCapture := func(ids []string, status string) {
		update := captureUpdate{append([]string{}, ids...), status}
		select {
		case captureQueue <- update:
		default:
			select {
			case <-captureQueue:
			default:
			}
			select {
			case captureQueue <- update:
			default:
			}
		}
	}
	go func() {
		for update := range captureQueue {
			for !sendCaptureToServer(update.ids, update.status) {
				// While retrying, keep only the latest complete basket snapshot.
				select {
				case update = <-captureQueue:
				default:
					time.Sleep(2 * time.Second)
				}
			}
		}
	}()
	const scanUpdateDebounce = 350 * time.Millisecond
	rawLogging := strings.ToLower(strings.TrimSpace(os.Getenv("RFID_RAW_LOG")))
	showRawData := rawLogging == "1" || rawLogging == "true" || rawLogging == "on" || rawLogging == "yes"
	reportedReaderIssue := false
	resetLocalScanState := func(reason string) {
		tagLastSeen = make(map[string]time.Time)
		batch = scanBatch{}
		clear(readCounts)
		lastScanningIDs = nil
		lastTagChangeAt = time.Time{}
		isStable = false
		fmt.Printf("🧹 RFID local scan state reset (%s); waiting for fresh tag reads\n", reason)
	}

	for {
		n, err := port.Read(buf)

		nowRead := time.Now()
		select {
		case newMode := <-modeUpdates:
			previousMode := sessionMode
			if newMode != "" {
				sessionMode = newMode
			}
			if previousMode != sessionMode && sessionMode != "" {
				if previousMode == "" {
					fmt.Printf("📡 POS RFID mode: %s\n", sessionMode)
				} else {
					fmt.Printf("🔄 POS RFID mode changed: %s -> %s\n", previousMode, sessionMode)
				}
				switch sessionMode {
				case "ADD":
					fmt.Println("📦 Operation: stock registration (link scanned tags to a product); no sale is performed by Go hub")
				case "CHECK":
					fmt.Println("📦 Operation: stock/tag check; no sale is performed by Go hub")
				case "CHECKOUT":
					fmt.Println("🧾 Operation: POS checkout basket; payment and sale confirmation are handled by the server")
				case "PAYMENT":
					fmt.Println("🔒 Operation: payment in progress; basket is locked")
				case "IDLE":
					fmt.Println("🛑 POS scan session ended. Scanner is IDLE and waiting for the next Start")
				}
				// A POS Start/Stop creates a new scan session. Do not carry tags
				// observed before that button press into the next basket.
				resetLocalScanState("POS mode " + sessionMode)
			}
		default:
		}
		if n > 0 {
			lastAnyTagTime = nowRead
			bytesSinceCheck += n
			if showRawData {
				// Do not truncate or sanitize this line: it is the exact complete
				// packet returned by the reader for this serial read.
				fmt.Printf("🧾 RAW TAG DATA: bytes=%d | HEX: % X | TEXT: %q\n", n, buf[:n], buf[:n])
			}
			for _, tagID := range decoder.feed(buf[:n]) {
				readCounts[tagID]++
				if !detection.confirmed {
					detection.confirmed = true
					reportedReaderIssue = false
					fmt.Printf("✅ Readable tag received — using %d baud\n", detection.current())
				}
				if _, exists := tagLastSeen[tagID]; !exists {
					lastNewTagTime = nowRead
					isStable = false
				}
				tagLastSeen[tagID] = nowRead
			}
		}

		if err != nil {
			fmt.Println("❌ Serial read error:", err, "— attempting automatic reconnect.")
			if connectedPort == "" {
				return
			}
			var reconnected bool
			connectedPort, reconnected = reconnectRFIDPort(connectedPort, detection.current())
			if !reconnected {
				return
			}
			// Keep the current basket and its stability window across a brief
			// USB/driver read interruption. Clearing it on every reconnect can
			// leave the POS with visible items stuck in SCANNING forever if the
			// reader keeps reopening but still has intermittent read errors.
			fmt.Println("🧹 RFID byte decoder reset after reconnect; preserving current tag snapshot for stability check")
			decoder = tagDecoder{}
			detection = newBaudDetection(bauds, detection.current(), time.Now())
			detection.confirmed = false
			reportedReaderIssue = false
			bytesSinceCheck = 0
			continue
		}

		if detection.due(nowRead) {
			if !detection.confirmed && !reportedReaderIssue {
				if bytesSinceCheck == 0 {
					fmt.Printf("⚠️ No RFID data received at %d baud. Check reader connection/configuration.\n", detection.current())
				} else {
					fmt.Printf("⚠️ RFID sent %d unreadable bytes at %d baud. Check reader output format.\n", bytesSinceCheck, detection.current())
				}
				reportedReaderIssue = true
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
			}
		}

		// Cleanup expired tags
		now := time.Now()
		for id, lastSeen := range tagLastSeen {
			if now.Sub(lastSeen) >= tagExpiry {
				delete(tagLastSeen, id)
				isStable = false
				lastNewTagTime = now // Reset stability timer on removal too
			}
		}

		activeIDsAfter := getActiveTagIDs()

		previousObserved := append([]string{}, batch.observed...)
		batch.observe(activeIDsAfter, now)
		if realtimeUpdates && !sameTagIDs(activeIDsAfter, previousObserved) {
			lastTagChangeAt = now
		}
		if realtimeUpdates && !lastTagChangeAt.IsZero() && now.Sub(lastTagChangeAt) >= scanUpdateDebounce && !sameTagIDs(activeIDsAfter, lastScanningIDs) {
			queueCapture(rankTagsByReadCount(activeIDsAfter, readCounts), "SCANNING")
			lastScanningIDs = append([]string{}, activeIDsAfter...)
			lastTagChangeAt = time.Time{}
		}
		if ids, ready := batch.take(now); ready {
			observedIDs := append([]string{}, ids...)
			ids = rankTagsByReadCount(ids, readCounts)
			status := captureStatus(ids)
			isStable = len(ids) > 0
			queueCapture(ids, status)
			clear(readCounts)
			if realtimeUpdates {
				lastScanningIDs = observedIDs
				lastTagChangeAt = time.Time{}
			}
		}

		if n == 0 {
			time.Sleep(100 * time.Millisecond)
		}
	}
}

func sendCaptureToServer(tagIds []string, status string) bool {
	if sessionMode == "IDLE" {
		return true
	}
	if sessionMode == "PAYMENT" {
		return true
	}
	payload := map[string]interface{}{
		"deviceId": deviceID,
		"tagIds":   tagIds,
		"status":   status,
	}

	jsonData, _ := json.Marshal(payload)
	resp, err := captureClient.Post(serverURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		logThrottled("capture-network", 10*time.Second, "❌ API POST /tags/capture failed: %v\n", err)
		return false
	}
	defer resp.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logThrottled("capture-rejected", 10*time.Second, "❌ API POST /tags/capture tags=%d status=%s rejected: %s\n", len(tagIds), status, strings.TrimSpace(string(body)))
	} else {
		fmt.Printf("📤 API POST /tags/capture tags=%d status=%s -> %s\n", len(tagIds), status, resp.Status)
	}
	if readErr != nil {
		fmt.Println("⚠️ Could not read server response:", readErr)
	}
	return resp.StatusCode >= 200 && resp.StatusCode < 300 && readErr == nil
}

func fetchSessionMode() string {
	baseURL := strings.TrimSuffix(serverURL, "/tags/capture")
	snapshotURL := strings.TrimRight(baseURL, "/") + "/session/" + url.PathEscape(deviceID) + "/snapshot"
	resp, err := captureClient.Get(snapshotURL)
	if err != nil {
		logThrottled("session-mode-network", 30*time.Second, "⚠️ Could not read POS RFID session mode: %v\n", err)
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logThrottled("session-mode-rejected", 30*time.Second, "⚠️ POS RFID session mode rejected: %s\n", resp.Status)
		return ""
	}
	var snapshot struct {
		Mode string `json:"mode"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&snapshot); err != nil || snapshot.Mode == "" {
		logThrottled("session-mode-invalid", 30*time.Second, "⚠️ Invalid POS RFID session mode response\n")
		return ""
	}
	return snapshot.Mode
}
