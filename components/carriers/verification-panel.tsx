"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { VerificationState } from "@/lib/carriers/verificationProtocol";

export function VerificationPanel({ connectionId }: { connectionId: string }) {
  const [state, setState] = useState<VerificationState>({ status: "waiting" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let alive = true; const abort = new AbortController();
    async function poll() {
      try {
        const response = await fetch("/api/carriers/verification", { method: "POST", cache: "no-store", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId, action: "state" }) });
        const data = await response.json();
        if (alive && response.ok) { setState(data); if (data.status === "ready" || data.status === "unavailable") setShown(true); if (data.status !== "ready") setCode(""); }
        else if (alive) { setError(data.error ?? "Verification unavailable"); setState({ status: "unavailable" }); }
      } catch { if (alive) setError("Could not check verification. Refresh this page to check again."); }
    }
    if (!busy) void poll();
    const timer = setInterval(() => { if (!busy && !document.hidden) void poll(); }, 4000);
    return () => { alive = false; abort.abort(); clearInterval(timer); };
  }, [connectionId, busy, refresh]);
  async function send(action: "sms" | "call" | "resend" | "code") {
    if (busy || state.status !== "ready") return;
    setBusy(true); setError(""); const submitted = code; setCode("");
    try {
      const response = await fetch("/api/carriers/verification", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId, sessionId: state.sessionId, action, ...(action === "code" ? { code: submitted } : {}) }) });
      if (!response.ok) throw new Error();
      setState({ status: "waiting" });
    } catch { setError("We could not confirm that action. Check the status before trying again; it was not automatically repeated."); }
    finally { setBusy(false); setRefresh(v => v + 1); }
  }
  if (!shown && !error) return null;
  return <section aria-label="Carrier security verification" className="rounded-lg border p-4 space-y-3">
    <h3 className="font-medium">Carrier security check</h3>
    <p className="text-sm text-muted-foreground">Complete verification here. Statement collection stays in the background.</p>
    {state.status === "waiting" && <p role="status">Waiting for the carrier. Collection resumes automatically after verification.</p>}
    {state.status === "unavailable" && <p role="status">This security check is not supported yet. Your carrier browser remains hidden.</p>}
    {state.status === "ready" && <>
      <div className="flex flex-wrap gap-2">{state.choices?.map(choice => <Button key={choice} variant="outline" disabled={busy} onClick={() => void send(choice)}>{choice === "sms" ? "Send code by text" : choice === "call" ? "Receive a call" : "Resend code"}</Button>)}</div>
      {state.acceptsCode && <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void send("code"); }}>
        <label className="flex flex-col gap-1 text-sm">Security code<input className="rounded-md border p-2" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0,10))} minLength={4} maxLength={10} required disabled={busy} /></label>
        <Button type="submit" disabled={busy || code.length < 4}>Verify code</Button>
      </form>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
