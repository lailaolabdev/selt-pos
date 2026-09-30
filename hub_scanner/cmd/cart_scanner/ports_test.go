package main

import "testing"

func TestSelectRFIDPort(t *testing.T) {
	reader := portCandidate{name: "/dev/cu.usbserial-3110", usb: true, vid: "1A86", pid: "7523", serialNumber: "reader"}
	other := portCandidate{name: "COM42", usb: true, vid: "0403", pid: "6001", serialNumber: "other"}
	tests := []struct {
		name      string
		ports     []portCandidate
		selector  portSelector
		want      string
		wantError bool
	}{
		{name: "no device waits", want: ""},
		{name: "current Mac reader", ports: []portCandidate{reader}, want: reader.name},
		{name: "Windows COM above 32", ports: []portCandidate{other}, want: "COM42"},
		{name: "prefer current adapter", ports: []portCandidate{other, reader}, want: reader.name},
		{name: "prefer USB over built-in COM", ports: []portCandidate{{name: "COM1"}, other}, want: "COM42"},
		{name: "unknown USBs ambiguous", ports: []portCandidate{other, {name: "COM43", usb: true}}, wantError: true},
		{name: "same adapter IDs ambiguous", ports: []portCandidate{reader, {name: "COM8", usb: true, vid: "1A86", pid: "7523"}}, wantError: true},
		{name: "explicit port overrides", ports: []portCandidate{reader, other}, selector: portSelector{port: "COM99"}, want: "COM99"},
		{name: "custom USB ID", ports: []portCandidate{reader, other}, selector: portSelector{vid: "0403", pid: "6001"}, want: "COM42"},
		{name: "serial distinguishes identical adapters", ports: []portCandidate{reader, {name: "COM8", vid: "1A86", pid: "7523", usb: true}}, selector: portSelector{serialNumber: "reader"}, want: reader.name},
		{name: "filter missing waits without fallback", ports: []portCandidate{reader}, selector: portSelector{vid: "FFFF"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := selectRFIDPort(tt.ports, tt.selector)
			if (err != nil) != tt.wantError {
				t.Fatalf("error = %v", err)
			}
			name := ""
			if got != nil {
				name = got.name
			}
			if name != tt.want {
				t.Fatalf("port = %q, want %q", name, tt.want)
			}
		})
	}
}

func TestPlatformPortNames(t *testing.T) {
	if canonicalPort("/dev/tty.usbserial-3110", "darwin") != "/dev/cu.usbserial-3110" {
		t.Fatal("Mac tty alias not normalized")
	}
	if canonicalPort("com42", "windows") != "COM42" {
		t.Fatal("Windows COM not normalized")
	}
	for _, name := range []string{"/dev/cu.Bluetooth-Incoming-Port", "/dev/cu.debug-console"} {
		if usablePort(name, "darwin") {
			t.Fatalf("unexpected system port %s", name)
		}
	}
	if !usablePort("COM128", "windows") || !usablePort("/dev/cu.usbserial-3110", "darwin") {
		t.Fatal("valid serial port rejected")
	}
}

func TestPortSelectorFromEnv(t *testing.T) {
	t.Setenv("RFID_PORT", " ")
	t.Setenv("RFID_USB_VID", " 0x1a86 ")
	t.Setenv("RFID_USB_PID", "7523")
	t.Setenv("RFID_USB_SERIAL", " reader ")
	got := portSelectorFromEnv()
	if got != (portSelector{vid: "1A86", pid: "7523", serialNumber: "reader"}) {
		t.Fatalf("selector = %+v", got)
	}
}
