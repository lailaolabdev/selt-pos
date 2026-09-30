package main

import "time"

const scanWindow = 3 * time.Second

// Retain a sparse read long enough to survive the collection window.
const tagExpiry = scanWindow + time.Second

type scanBatch struct {
	observed []string
	started  time.Time
	pending  bool
}

func (b *scanBatch) observe(ids []string, now time.Time) {
	if sameTagIDs(ids, b.observed) {
		return
	}
	b.observed = append([]string{}, ids...)
	if !b.pending {
		b.pending = true
		b.started = now
	}
}

func (b *scanBatch) take(now time.Time) ([]string, bool) {
	if !b.pending || now.Sub(b.started) < scanWindow {
		return nil, false
	}
	b.pending = false
	return append([]string{}, b.observed...), true
}

func captureStatus(ids []string) string {
	if len(ids) == 0 {
		return "IDLE"
	}
	return "STABLE"
}
