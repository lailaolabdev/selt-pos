package main

import (
	"testing"
	"time"
)

func TestScanBatchCollectsForThreeSeconds(t *testing.T) {
	now := time.Now()
	b := scanBatch{}
	b.observe([]string{"3721168358"}, now)
	b.observe([]string{"3721168358"}, now.Add(time.Second))
	if _, ready := b.take(now.Add(2999 * time.Millisecond)); ready {
		t.Fatal("capture sent before 3 seconds")
	}
	b.observe([]string{"3721168358", "3721168362"}, now.Add(2*time.Second))
	ids, ready := b.take(now.Add(3 * time.Second))
	if !ready || len(ids) != 2 || ids[0] != "3721168358" || ids[1] != "3721168362" {
		t.Fatalf("incorrect batch %v", ids)
	}
	if _, ready := b.take(now.Add(4 * time.Second)); ready {
		t.Fatal("duplicate batch")
	}
	b.observe([]string{}, now.Add(5*time.Second))
	ids, ready = b.take(now.Add(8 * time.Second))
	if !ready || len(ids) != 0 || captureStatus(ids) != "IDLE" {
		t.Fatal("empty basket not sent")
	}
}

func TestSparseReadSurvivesScanWindow(t *testing.T) {
	previous := tagLastSeen
	defer func() { tagLastSeen = previous }()
	tagLastSeen = map[string]time.Time{"3721168358": time.Now().Add(-3100 * time.Millisecond)}
	if len(getActiveTagIDs()) != 1 {
		t.Fatal("single tag expires before 3-second batch")
	}
}
