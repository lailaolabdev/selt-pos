package main

import (
	"strings"
	"time"
)

// Accept newline-delimited ASCII and the observed STX + ID + CR/LF + ETX
// reader frames. Preserve the ID as text (including any leading zeroes).
type tagDecoder struct {
	line    []byte
	invalid bool
	framed  bool
}

func (d *tagDecoder) feed(data []byte) []string {
	var tags []string
	finish := func() {
		id := strings.TrimSpace(string(d.line))
		if !d.invalid && len(id) > 4 {
			tags = append(tags, id)
		}
		d.line = d.line[:0]
		d.invalid = false
	}
	for _, b := range data {
		if b == 0x02 {
			d.line = d.line[:0]
			d.invalid = false
			d.framed = true
			continue
		}
		if b == 0x03 {
			if d.framed {
				finish()
			}
			d.framed = false
			continue
		}
		if b == '\r' || b == '\n' {
			if !d.framed {
				finish()
			}
			continue
		}
		if b < 32 || b > 126 || len(d.line) >= 256 {
			d.invalid = true
		}
		if !d.invalid {
			d.line = append(d.line, b)
		}
	}
	return tags
}

type baudDetection struct {
	bauds     []int
	index     int
	confirmed bool
	lastTry   time.Time
}

func newBaudDetection(bauds []int, current int, now time.Time) baudDetection {
	d := baudDetection{bauds: bauds, lastTry: now}
	for i, baud := range bauds {
		if baud == current {
			d.index = i
			break
		}
	}
	return d
}

func (d *baudDetection) current() int { return d.bauds[d.index] }

func (d *baudDetection) due(now time.Time) bool {
	return !d.confirmed && now.Sub(d.lastTry) >= 4*time.Second
}

func (d *baudDetection) advance(now time.Time) int {
	d.index = (d.index + 1) % len(d.bauds)
	d.lastTry = now
	return d.current()
}
