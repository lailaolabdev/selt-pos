package main

import (
	"fmt"
	"strings"
	"testing"

	"go.bug.st/serial"
)

type codedPortError struct{ code serial.PortErrorCode }

func (e codedPortError) Error() string              { return "serial open failed" }
func (e codedPortError) Code() serial.PortErrorCode { return e.code }

func TestPortOpenErrors(t *testing.T) {
	for _, tc := range []struct {
		code     serial.PortErrorCode
		terminal bool
		hint     string
	}{
		{serial.PortBusy, true, "already in use"},
		{serial.PortNotFound, true, "no longer exists"},
		{serial.PermissionDenied, true, "Cannot access"},
		{serial.InvalidSpeed, false, "Baud rate"},
	} {
		err := fmt.Errorf("open: %w", codedPortError{tc.code})
		if terminalPortError(err) != tc.terminal || !strings.Contains(portOpenHint(err), tc.hint) {
			t.Fatalf("incorrect guidance for %v: %s", tc.code, portOpenHint(err))
		}
	}
}
