package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func signedRequest(path, body string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	for _, h := range []string{"X-Relay-Time", "X-Relay-Nonce", "X-Relay-Signature"} {
		r.Header.Set(h, "synthetic")
	}
	return r
}

func TestValidatedTLSAndExactForwarding(t *testing.T) {
	body := `{"action":"state","connectionId":"synthetic"}`
	var requests atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		data, _ := io.ReadAll(r.Body)
		if string(data) != body || r.Method != "POST" || r.URL.RequestURI() != "/verification" {
			t.Error("Signed body or fixed route changed")
		}
		for _, h := range []string{"Cookie", "Authorization", "Forwarded", "X-Forwarded-For", "Idempotency-Key"} {
			if r.Header.Get(h) != "" {
				t.Errorf("Forwarded unapproved header %s", h)
			}
		}
		if r.Header.Get("X-Relay-Signature") != "synthetic" {
			t.Error("Missing signed header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Set-Cookie", "unexpected=private")
		w.Header().Set("Location", "https://example.invalid/")
		_, _ = w.Write([]byte(`{"status":"waiting"}`))
	}))
	defer upstream.Close()
	front := httptest.NewTLSServer(relayHandler(newRelayClient(), upstream.URL+"/verification"))
	defer front.Close()
	r := signedRequest(front.URL+"/verification", body)
	for _, h := range []string{"Cookie", "Authorization", "Forwarded", "X-Forwarded-For", "Idempotency-Key"} {
		r.Header.Set(h, "must-not-forward")
	}
	r.RequestURI = ""
	response, err := front.Client().Do(r) // Trust only this test server's certificate.
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || response.Header.Get("Cache-Control") != "private, no-store" || response.Header.Get("Set-Cookie") != "" || response.Header.Get("Location") != "" {
		t.Fatal("Unexpected gateway response or leaked header")
	}
	if requests.Load() != 1 {
		t.Fatal("Submission was repeated")
	}
}

func TestRouteAndRequestRejection(t *testing.T) {
	for _, tc := range []struct {
		name   string
		edit   func(*http.Request)
		status int
	}{
		{"normal page", func(r *http.Request) { r.URL.Path = "/reports" }, 404},
		{"wrong method", func(r *http.Request) { r.Method = "GET" }, 404},
		{"query", func(r *http.Request) { r.URL.RawQuery = "next=/reports" }, 404},
		{"encoded path", func(r *http.Request) { r.URL.RawPath = "/verific%61tion" }, 404},
		{"wrong body type", func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }, 415},
		{"unsigned", func(r *http.Request) { r.Header.Del("X-Relay-Signature") }, 401},
		{"duplicate signed header", func(r *http.Request) { r.Header.Add("X-Relay-Signature", "other") }, 401},
		{"large streamed body", func(r *http.Request) {
			r.Body = io.NopCloser(strings.NewReader(strings.Repeat("x", maxBody+1)))
			r.ContentLength = -1
		}, 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := signedRequest("https://localhost/verification", "{}")
			tc.edit(r)
			w := httptest.NewRecorder()
			relayHandler(nil, "unused").ServeHTTP(w, r) // Any upstream call would panic.
			if w.Code != tc.status {
				t.Fatalf("got %d, want %d", w.Code, tc.status)
			}
		})
	}
}

func TestRedirectAndUnexpectedResponseAreNotExposed(t *testing.T) {
	var redirected atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirected.Add(1); w.WriteHeader(500) }))
	defer target.Close()
	for _, tc := range []struct {
		name              string
		status            int
		contentType, body string
	}{
		{"redirect", 307, "application/json", `{}`},
		{"carrier HTML", 200, "text/html", `<html>private data</html>`},
		{"invalid JSON", 200, "application/json", `private data`},
		{"oversized result", 200, "application/json", `"` + strings.Repeat("x", 16385) + `"`},
		{"upstream error", 500, "application/json", `{"private":"details"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Location", target.URL)
				w.Header().Set("Content-Type", tc.contentType)
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer upstream.Close()
			w := httptest.NewRecorder()
			relayHandler(newRelayClient(), upstream.URL).ServeHTTP(w, signedRequest("https://localhost/verification", "{}"))
			if w.Code != 502 || strings.Contains(w.Body.String(), "private") {
				t.Fatal("Unexpected upstream result exposed")
			}
		})
	}
	if redirected.Load() != 0 {
		t.Fatal("Followed upstream redirect")
	}
}

func TestTimeoutDoesNotRepeatSubmission(t *testing.T) {
	var requests atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		_, _ = io.Copy(io.Discard, r.Body)
		<-r.Context().Done()
	}))
	defer upstream.Close()
	client := newRelayClient()
	client.Timeout = 25 * time.Millisecond
	w := httptest.NewRecorder()
	relayHandler(client, upstream.URL).ServeHTTP(w, signedRequest("https://localhost/verification", "{}"))
	if w.Code != 502 || requests.Load() != 1 {
		t.Fatal("Timeout was not safely bounded")
	}
}
