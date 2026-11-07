// The gateway exposes only the signed verification relay, never a browser.
// It deliberately has no external modules, automatic certificates or admin API.
package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const maxBody = 2048

func relayHandler(client *http.Client, upstream string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		fail := func(status int) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"error":"Verification unavailable"}`))
		}
		if r.Method != http.MethodPost || r.URL.Path != "/verification" || r.URL.RawPath != "" || r.URL.RawQuery != "" || r.URL.ForceQuery {
			fail(http.StatusNotFound)
			return
		}
		if r.Header.Get("Content-Type") != "application/json" {
			fail(http.StatusUnsupportedMediaType)
			return
		}
		for _, name := range []string{"X-Relay-Time", "X-Relay-Nonce", "X-Relay-Signature"} {
			values := r.Header.Values(name)
			if len(values) != 1 || values[0] == "" || len(values[0]) > 128 {
				fail(http.StatusUnauthorized)
				return
			}
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			fail(http.StatusRequestEntityTooLarge)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()
		out, err := http.NewRequestWithContext(ctx, http.MethodPost, upstream, bytes.NewReader(body))
		if err != nil {
			fail(http.StatusBadGateway)
			return
		}
		// Do not replay a submission, forward arbitrary headers, cookies or IPs,
		// honor proxy environment variables, or follow upstream redirects.
		out.GetBody = nil
		out.Header.Set("Content-Type", "application/json")
		for _, name := range []string{"X-Relay-Time", "X-Relay-Nonce", "X-Relay-Signature"} {
			out.Header.Set(name, r.Header.Get(name))
		}
		response, err := client.Do(out)
		if err != nil {
			fail(http.StatusBadGateway)
			return
		}
		defer response.Body.Close()
		switch response.StatusCode {
		case 200, 401, 403, 404, 409, 413:
		default:
			fail(http.StatusBadGateway)
			return
		}
		result, err := io.ReadAll(io.LimitReader(response.Body, 16385))
		if err != nil || len(result) > 16384 || !json.Valid(result) || response.Header.Get("Content-Type") != "application/json" {
			fail(http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(result)
	})
}

func newRelayClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:                  nil,
			DialContext:            (&net.Dialer{Timeout: 2 * time.Second}).DialContext,
			DisableCompression:     true,
			DisableKeepAlives:      true,
			ResponseHeaderTimeout:  5 * time.Second,
			MaxResponseHeaderBytes: 4096,
		},
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		Timeout:       6 * time.Second,
	}
}

func main() {
	cert, key := os.Getenv("GATEWAY_TLS_CERT"), os.Getenv("GATEWAY_TLS_KEY")
	if cert == "" || key == "" {
		log.Fatal("Gateway TLS certificate configuration is required")
	}
	server := &http.Server{
		Addr:              ":8443",
		Handler:           relayHandler(newRelayClient(), "http://127.0.0.1:8080/verification"),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       8 * time.Second,
		WriteTimeout:      8 * time.Second,
		IdleTimeout:       15 * time.Second,
		MaxHeaderBytes:    4096,
		TLSConfig:         &tls.Config{MinVersion: tls.VersionTLS13},
		// Protocol errors may include attacker-controlled details. Do not log
		// request bodies, headers, security codes or TLS handshake diagnostics.
		ErrorLog: log.New(io.Discard, "", 0),
	}
	stop, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	stopped := make(chan struct{})
	go func() {
		<-stop.Done()
		ctx, done := context.WithTimeout(context.Background(), 8*time.Second)
		defer done()
		_ = server.Shutdown(ctx)
		close(stopped)
	}()
	if err := server.ListenAndServeTLS(cert, key); err != nil && err != http.ErrServerClosed {
		log.Fatal("Gateway could not start with the configured TLS certificate")
	}
	<-stopped
}
