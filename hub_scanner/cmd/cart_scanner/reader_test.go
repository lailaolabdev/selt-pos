package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"go.bug.st/serial"
)

func TestTagDecoder(t *testing.T) {
	d := tagDecoder{}
	if got := d.feed([]byte("E280123")); len(got) != 0 {
		t.Fatal("accepted incomplete frame")
	}
	got := d.feed([]byte("456\r\nSECOND-TAG\rTHIRD-TAG\n"))
	if strings.Join(got, ",") != "E280123456,SECOND-TAG,THIRD-TAG" {
		t.Fatalf("decoded tags = %v", got)
	}
	if got := d.feed([]byte("NO\nBAD\xffTAG123\n")); len(got) != 0 {
		t.Fatalf("accepted invalid record: %v", got)
	}
	if got := d.feed([]byte(strings.Repeat("X", 5000) + "\nVALID-TAG\n")); len(got) != 1 || got[0] != "VALID-TAG" {
		t.Fatalf("overflow recovery = %v", got)
	}
	if len(d.line) > 256 {
		t.Fatal("unbounded serial buffer")
	}
}

func TestBaudDetectionWaitsForData(t *testing.T) {
	now := time.Now()
	d := newBaudDetection([]int{9600, 115200, 57600}, 9600, now)
	if d.confirmed || d.due(now.Add(3*time.Second)) {
		t.Fatal("open port must not confirm baud")
	}
	if !d.due(now.Add(4 * time.Second)) {
		t.Fatal("must try another baud without readable data")
	}
	if d.advance(now.Add(4*time.Second)) != 115200 || d.advance(now.Add(8*time.Second)) != 57600 || d.advance(now.Add(12*time.Second)) != 9600 {
		t.Fatal("incorrect baud cycle")
	}
	d.confirmed = true
	if d.due(now.Add(time.Hour)) {
		t.Fatal("must retain confirmed baud when tags are removed")
	}
}

type scriptedReader struct {
	serial.Port
	chunks [][]byte
	endAt  time.Time
}

func (p *scriptedReader) Read(buf []byte) (int, error) {
	if len(p.chunks) == 0 {
		if time.Now().Before(p.endAt) {
			time.Sleep(50 * time.Millisecond)
			return 0, nil
		}
		return 0, errors.New("test reader disconnected")
	}
	chunk := p.chunks[0]
	p.chunks = p.chunks[1:]
	return copy(buf, chunk), nil
}

func TestReaderForwardsCompleteTagToServer(t *testing.T) {
	previousPort, previousURL, previousTags := port, serverURL, tagLastSeen
	previousStable, previousNew, previousAny := isStable, lastNewTagTime, lastAnyTagTime
	defer func() {
		port, serverURL, tagLastSeen = previousPort, previousURL, previousTags
		isStable, lastNewTagTime, lastAnyTagTime = previousStable, previousNew, previousAny
	}()
	var payloads []struct {
		TagIDs []string `json:"tagIds"`
		Status string   `json:"status"`
	}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"mode":"CHECKOUT"}`))
			return
		}
		var payload struct {
			TagIDs []string `json:"tagIds"`
			Status string   `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		payloads = append(payloads, payload)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"mode":"CHECKOUT"}`))
	}))
	defer s.Close()
	serverURL = s.URL
	tagLastSeen = make(map[string]time.Time)
	port = &scriptedReader{chunks: [][]byte{[]byte("GARBAGE\xffDATA\n"), []byte("REAL-TAG"), []byte("-001\r\n")}, endAt: time.Now().Add(3300 * time.Millisecond)}
	monitorLoop([]int{115200}, 115200)
	if len(payloads) != 1 || payloads[0].Status != "STABLE" || len(payloads[0].TagIDs) != 1 || payloads[0].TagIDs[0] != "REAL-TAG-001" {
		t.Fatalf("reader -> server captures = %+v", payloads)
	}
}

func TestObservedSTXETXFrames(t *testing.T) {
	d := tagDecoder{}
	if ids := d.feed([]byte("\x023721168")); len(ids) != 0 {
		t.Fatal("partial framed ID accepted")
	}
	if ids := d.feed([]byte("358\r\n")); len(ids) != 0 {
		t.Fatal("framed ID accepted before ETX")
	}
	ids := d.feed([]byte("\x03\x023721168362\r\n\x03\x020001234567\x03"))
	if strings.Join(ids, ",") != "3721168358,3721168362,0001234567" {
		t.Fatalf("observed frame decoding = %v", ids)
	}
	if ids := d.feed([]byte("\x02BAD\xffTAG\r\n\x03")); len(ids) != 0 {
		t.Fatalf("accepted corrupt frame %v", ids)
	}
}

// Browser verification supplies an isolated real Nest server, in CHECK mode.
func TestFramedReaderAgainstJSONServer(t *testing.T) {
	endpoint := os.Getenv("RFID_TEST_SERVER_URL")
	if endpoint == "" {
		t.Skip("set RFID_TEST_SERVER_URL to an isolated server")
	}
	previousPort, previousURL, previousTags := port, serverURL, tagLastSeen
	defer func() { port, serverURL, tagLastSeen = previousPort, previousURL, previousTags }()
	serverURL = strings.TrimRight(endpoint, "/") + "/tags/capture"
	tagLastSeen = make(map[string]time.Time)
	port = &scriptedReader{
		chunks: [][]byte{[]byte("\x023721168"), []byte("358\r\n\x03\x023721168358\r\n\x03"), []byte("\x023721168362\r\n\x03")},
		endAt:  time.Now().Add(3300 * time.Millisecond),
	}
	started := time.Now()
	monitorLoop([]int{9600}, 9600)
	response, err := http.Get(strings.TrimRight(endpoint, "/") + "/session/RPi-POS-01/snapshot")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var snapshot struct {
		TagIDs []string `json:"tagIds"`
		Status string   `json:"status"`
	}
	if err := json.NewDecoder(response.Body).Decode(&snapshot); err != nil {
		t.Fatal(err)
	}
	if strings.Join(snapshot.TagIDs, ",") != "3721168358,3721168362" || snapshot.Status != "STABLE" || time.Since(started) < scanWindow {
		t.Fatalf("framed reader -> server snapshot = %+v", snapshot)
	}
}
