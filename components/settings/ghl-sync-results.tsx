"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {ghlAutomationState,resumeGhlImportJob} from "@/app/(dashboard)/settings/ghl/automationActions";
import {GhlSyncResult} from "./ghl-sync-result";
type State=Awaited<ReturnType<typeof ghlAutomationState>>;
export function GhlSyncResults({initial}:{initial:State}){
 const [state,setState]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const pending=state.enabled&&state.jobs.some(j=>["queued","running"].includes(j.state));
 useEffect(()=>{if(!pending)return;let active=true;const timer=setInterval(()=>{void ghlAutomationState().then(s=>{if(active)setState(s);}).catch(()=>{if(active)setMessage("Results could not refresh. Your saved work is kept.");});},15000);return()=>{active=false;clearInterval(timer);};},[pending]);
 async function refresh(){setBusy(true);try{setState(await ghlAutomationState());setMessage("");}catch{setMessage("Results are unavailable. Try again shortly.");}finally{setBusy(false);}}
 async function resume(id:string){setBusy(true);try{const r=await resumeGhlImportJob(id);if(r.error)setMessage(r.error);else{setState(await ghlAutomationState());setMessage("Processing is queued again. Saved work will be checked first.");}}catch{setMessage("Could not resume. Refresh and check your connection.");}finally{setBusy(false);}}
 return <div className="space-y-5"><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={refresh}>Refresh results</Button><Link className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium" href="/settings/ghl">GHL connection settings</Link></div>{message&&<p role="status">{message}</p>}{pending&&<p className="text-sm text-muted-foreground">Results refresh automatically while processing is pending.</p>}{!state.jobs.length?<div className="rounded-xl border p-6 space-y-2"><h2 className="font-semibold">No statement sync results yet</h2><p>Your next statement import will appear here when automatic GHL processing is on. Existing imported statements have not been queued again.</p><p className="text-sm text-muted-foreground">Automatic processing is {state.enabled?"on":"off"} for your account.</p></div>:<><p className="text-sm text-muted-foreground">Your latest {state.jobs.length} import runs. Only your account’s results are shown.</p>{state.jobs.map(j=><GhlSyncResult key={j.id} job={j} enabled={state.enabled}>{j.state==="needs_attention"&&state.enabled&&<Button disabled={busy} variant="outline" onClick={()=>resume(j.id)}>Resume processing</Button>}</GhlSyncResult>)}</>}</div>;
}
