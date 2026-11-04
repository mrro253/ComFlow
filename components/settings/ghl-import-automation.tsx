"use client";
import Link from "next/link";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {ghlAutomationState,setGhlImportAutomation} from "@/app/(dashboard)/settings/ghl/automationActions";
type State=Awaited<ReturnType<typeof ghlAutomationState>>;
export function GhlImportAutomation({initial}:{initial:State}){
 const [state,setState]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function toggle(){setBusy(true);try{const r=await setGhlImportAutomation(!state.enabled);if(r.error)setMessage(r.error);else{setState(await ghlAutomationState());setMessage("Saved. This applies to future statement imports; existing statements were not queued.");}}catch{setMessage("The setting could not be confirmed. Refresh before trying again.");}finally{setBusy(false);}}
 return <section className="rounded-lg border p-5 space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Automatic GHL updates after statement imports</h2><span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{state.enabled?"On":"Off"}</span></div><p>ComFlow links verified contacts, creates missing contacts, and sends supported policy updates with history notes. Only your credited commissions and contacts assigned to your GHL User ID are processed.</p><div className="flex flex-wrap gap-3"><Link className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href="/settings/ghl/results">View GHL sync results</Link><Button variant="outline" disabled={busy} onClick={toggle}>{state.enabled?"Turn off automatic GHL updates":"Turn on automatic GHL updates"}</Button></div><p className="text-sm text-muted-foreground">Results show completed work, automatic retries, and anything left unchanged. Processing continues through the ComFlow worker when this page is closed.</p>{message&&<p role="status">{message}</p>}</section>;
}
