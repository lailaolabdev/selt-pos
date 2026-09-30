package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCapturePayloadContract(t *testing.T) {
	var received struct {
		DeviceID string   `json:"deviceId"`
		TagIDs   []string `json:"tagIds"`
		Status   string   `json:"status"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("unexpected request: %s %s", r.Method, r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Error(err)
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()
	previous := serverURL
	serverURL = server.URL
	defer func() { serverURL = previous }()
	sendCaptureToServer([]string{"DEMO-TAG-001", "DEMO-TAG-002"}, "STABLE")
	if received.DeviceID != "RPi-POS-01" || received.Status != "STABLE" || len(received.TagIDs) != 2 {
		t.Fatalf("unexpected payload: %+v", received)
	}
}

func TestBasketTracksIdentityAndExpiry(t *testing.T) {
	previous := tagLastSeen
	defer func() { tagLastSeen = previous }()
	tagLastSeen = map[string]time.Time{"ACTIVE-TAG": time.Now(), "EXPIRED-TAG": time.Now().Add(-5 * time.Second)}
	ids := getActiveTagIDs()
	if len(ids) != 1 || ids[0] != "ACTIVE-TAG" {
		t.Fatalf("incorrect active tags: %v", ids)
	}
	if sameTagIDs([]string{"FIRST-TAG"}, []string{"OTHER-TAG"}) {
		t.Fatal("same count must not imply the same basket")
	}
}

// Invoked by the Nest integration test against an isolated JSON database.
func TestCaptureAgainstJSONServer(t *testing.T) {
	endpoint := os.Getenv("RFID_TEST_SERVER_URL")
	if endpoint == "" {
		t.Skip("set RFID_TEST_SERVER_URL to an isolated test server")
	}
	previous := serverURL
	serverURL = strings.TrimRight(endpoint, "/") + "/tags/capture"
	defer func() { serverURL = previous }()
	tags := []string{"TAG1", "TAG2", "TAG1", "UNKNOWN"}
	for _, status := range []string{"SCANNING", "STABLE"} {
		sendCaptureToServer(tags, status)
		response, err := http.Get(strings.TrimRight(endpoint, "/") + "/session/RPi-POS-01/snapshot")
		if err != nil {
			t.Fatal(err)
		}
		var snapshot struct {
			DeviceID string `json:"deviceId"`
			Mode     string `json:"mode"`
			Result   struct {
				TotalPrice int `json:"totalPrice"`
				Items      []struct {
					Count int `json:"count"`
				} `json:"items"`
			} `json:"result"`
		}
		err = json.NewDecoder(response.Body).Decode(&snapshot)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if snapshot.DeviceID != "RPi-POS-01" || snapshot.Mode != "CHECKOUT" || snapshot.Result.TotalPrice != 3000 || len(snapshot.Result.Items) != 1 || snapshot.Result.Items[0].Count != 2 {
			t.Fatalf("Go -> JSON server checkout failed: %+v", snapshot)
		}
	}
	sendCaptureToServer([]string{}, "IDLE")
	response, err := http.Get(strings.TrimRight(endpoint, "/") + "/session/RPi-POS-01/snapshot")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var empty struct {
		Result struct {
			TotalPrice int               `json:"totalPrice"`
			Items      []json.RawMessage `json:"items"`
		} `json:"result"`
	}
	if err := json.NewDecoder(response.Body).Decode(&empty); err != nil {
		t.Fatal(err)
	}
	if empty.Result.TotalPrice != 0 || len(empty.Result.Items) != 0 {
		t.Fatalf("Go -> JSON server removal failed: %+v", empty)
	}
}
