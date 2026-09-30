package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"go.bug.st/serial"
	"go.bug.st/serial/enumerator"
)

func portErrorCode(err error) (serial.PortErrorCode, bool) {
	var coded interface{ Code() serial.PortErrorCode }
	if errors.As(err, &coded) {
		return coded.Code(), true
	}
	return 0, false
}

func terminalPortError(err error) bool {
	code, ok := portErrorCode(err)
	return ok && (code == serial.PortBusy || code == serial.PortNotFound || code == serial.PermissionDenied || code == serial.InvalidSerialPort)
}

func portOpenHint(err error) string {
	code, ok := portErrorCode(err)
	if ok {
		switch code {
		case serial.PortBusy:
			return "Port is already in use. Stop the other RFID scanner/serial monitor, then run again."
		case serial.PortNotFound:
			return "Port no longer exists. Reconnect the USB reader and clear any outdated RFID_PORT value."
		case serial.PermissionDenied:
			return "Cannot access this port. Close other serial apps and check OS permissions/USB driver."
		case serial.InvalidSpeed:
			return "Baud rate is unsupported. Check RFID_BAUD against the reader configuration."
		}
	}
	return "Check the USB connection/driver and close other applications using the serial port."
}

type portCandidate struct {
	name, reason, vid, pid, serialNumber string
	usb                                  bool
}

type portSelector struct {
	port, vid, pid, serialNumber string
}

func portSelectorFromEnv() portSelector {
	return portSelector{
		port:         strings.TrimSpace(os.Getenv("RFID_PORT")),
		vid:          normalizeUSBID(os.Getenv("RFID_USB_VID")),
		pid:          normalizeUSBID(os.Getenv("RFID_USB_PID")),
		serialNumber: strings.TrimSpace(os.Getenv("RFID_USB_SERIAL")),
	}
}

func normalizeUSBID(id string) string {
	return strings.ToUpper(strings.TrimPrefix(strings.ToLower(strings.TrimSpace(id)), "0x"))
}

// macOS exposes both tty (dial-in) and cu (call-out) for the same device.
func canonicalPort(name, platform string) string {
	if platform == "darwin" && strings.HasPrefix(name, "/dev/tty.") {
		return "/dev/cu." + strings.TrimPrefix(name, "/dev/tty.")
	}
	if platform == "windows" {
		return strings.ToUpper(name)
	}
	return name
}

func usablePort(name, platform string) bool {
	lower := strings.ToLower(name)
	if strings.Contains(lower, "bluetooth") || strings.Contains(lower, "debug-console") {
		return false
	}
	if platform == "darwin" {
		return strings.HasPrefix(lower, "/dev/cu.") &&
			(strings.Contains(lower, "usb") || strings.Contains(lower, "ch340"))
	}
	if platform == "windows" {
		return strings.HasPrefix(lower, "com")
	}
	return strings.HasPrefix(name, "/dev/ttyUSB") || strings.HasPrefix(name, "/dev/ttyACM")
}

func discoverPorts() []portCandidate {
	byName := make(map[string]portCandidate)
	add := func(p portCandidate) {
		p.name = canonicalPort(p.name, runtime.GOOS)
		if !usablePort(p.name, runtime.GOOS) && !p.usb {
			return
		}
		if existing, ok := byName[p.name]; !ok || (!existing.usb && p.usb) {
			byName[p.name] = p
		}
	}
	if ports, err := enumerator.GetDetailedPortsList(); err == nil {
		for _, p := range ports {
			if p == nil {
				continue
			}
			reason := "serial device"
			if p.IsUSB {
				reason = fmt.Sprintf("USB VID:%s PID:%s SN:%s %s", p.VID, p.PID, p.SerialNumber, p.Product)
			}
			add(portCandidate{name: p.Name, reason: reason, usb: p.IsUSB,
				vid: normalizeUSBID(p.VID), pid: normalizeUSBID(p.PID), serialNumber: p.SerialNumber})
		}
	} else {
		fmt.Println("⚠️ Could not read USB serial details:", err)
	}
	if ports, err := serial.GetPortsList(); err == nil {
		for _, name := range ports {
			add(portCandidate{name: name, reason: "serial device"})
		}
	}
	// Fallback for macOS drivers not exposed by the detailed enumerator.
	if runtime.GOOS == "darwin" {
		for _, pattern := range []string{"/dev/cu.*usb*", "/dev/cu.SLAB_USBtoUART*", "/dev/cu.CH340*"} {
			matches, _ := filepath.Glob(pattern)
			for _, name := range matches {
				add(portCandidate{name: name, reason: "macOS USB serial device", usb: true})
			}
		}
	}
	candidates := make([]portCandidate, 0, len(byName))
	for _, p := range byName {
		candidates = append(candidates, p)
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].name < candidates[j].name })
	return candidates
}

// USB IDs identify the adapter, not the RFID protocol. Never guess between
// multiple equally eligible adapters or send probe commands to unknown devices.
func selectRFIDPort(candidates []portCandidate, selector portSelector) (*portCandidate, error) {
	if selector.port != "" {
		return &portCandidate{name: selector.port, reason: "RFID_PORT"}, nil
	}
	filtered := make([]portCandidate, 0)
	explicitFilter := selector.vid != "" || selector.pid != "" || selector.serialNumber != ""
	for _, p := range candidates {
		if explicitFilter {
			if (selector.vid != "" && p.vid != selector.vid) ||
				(selector.pid != "" && p.pid != selector.pid) ||
				(selector.serialNumber != "" && p.serialNumber != selector.serialNumber) {
				continue
			}
		}
		filtered = append(filtered, p)
	}
	if !explicitFilter {
		// Prefer the USB adapter detected on this project's RFID reader.
		preferred := make([]portCandidate, 0)
		usb := make([]portCandidate, 0)
		for _, p := range filtered {
			if p.vid == "1A86" && p.pid == "7523" {
				preferred = append(preferred, p)
			}
			if p.usb {
				usb = append(usb, p)
			}
		}
		if len(preferred) > 0 {
			filtered = preferred
		} else if len(usb) > 0 {
			filtered = usb
		}
	}
	if len(filtered) == 0 {
		return nil, nil
	}
	if len(filtered) == 1 {
		return &filtered[0], nil
	}
	names := make([]string, 0, len(filtered))
	for _, p := range filtered {
		names = append(names, p.name)
	}
	return nil, fmt.Errorf("multiple possible RFID ports: %s; set RFID_PORT or RFID_USB_VID / RFID_USB_PID / RFID_USB_SERIAL", strings.Join(names, ", "))
}
