"use client";
import { useState } from "react";
import { previewGhlContacts,type ContactPreviewState } from "@/app/(dashboard)/settings/ghl/preview/actions";
import { Button } from "@/components/ui/button";
const labels={
  "MBI agreement":"Contact Matched in GHL",
  "Name candidate":"Contact found — MBI not confirmed",
  "Multiple candidates":"Multiple contacts found — identity not confirmed",
  "Identity conflict":"Contact found — MBI does not match",
  "No candidate found":"No Contact Found in GHL",
  "Search incomplete":"Search incomplete — result not confirmed",
  "Name differs":"Contact found — full MBI matches, name differs",
} as const;
export function GhlContactPreview() {
  const [state,setState]=useState<ContactPreviewState>({});const [pending,setPending]=useState(false);
  const matched=state.rows?.filter(row=>row.status==="MBI agreement").length??0;
  const notFound=state.rows?.filter(row=>row.status==="No candidate found").length??0;
  async function run(broader=false){if(pending)return;setPending(true);setState({});try{setState(await previewGhlContacts(broader));}catch{setState({error:"Preview unavailable. Try again."});}finally{setPending(false);}}
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3"><Button onClick={()=>run()} disabled={pending}>{pending?"Comparing enrollments with GHL…":"Run read-only preview"}</Button>{notFound>0&&!state.investigated&&<Button onClick={()=>run(true)} disabled={pending} variant="outline">Investigate contacts not found</Button>}</div>
    <div aria-live="polite">{state.error&&<p role="alert">{state.error}</p>}{state.warning&&<p className="rounded-md bg-muted p-3 text-sm">{state.warning}</p>}{state.rows&&<p className="mt-3">{state.rows.length} enrollments checked. No links or updates saved.</p>}</div>
    {state.rows&&<div className="grid gap-3 sm:grid-cols-3">
      <p className="rounded-lg border p-4"><strong className="block text-2xl">{matched}</strong>Contact Matched in GHL<span className="mt-1 block text-sm text-muted-foreground">Enrollments with matching names and full MBIs. Not linked yet.</span></p>
      <p className="rounded-lg border p-4"><strong className="block text-2xl">{notFound}</strong>No Contact Found in GHL<span className="mt-1 block text-sm text-muted-foreground">Enrollments without a contact found in this search of your assigned contacts.</span></p>
      <p className="rounded-lg border p-4"><strong className="block text-2xl">{state.rows.length-matched-notFound}</strong>Enrollments needing confirmation<span className="mt-1 block text-sm text-muted-foreground">Unconfirmed identity or incomplete search.</span></p>
    </div>}
    {state.rows?.length===0&&<p>No enrollments are available to your ComFlow account.</p>}
    {state.rows?.map(row=><article className="rounded-lg border p-4 space-y-2" key={row.code}>
      <h2 className="font-semibold">{row.name}</h2><p className="font-medium">{labels[row.status]}</p>
      {row.investigation&&<p className="rounded-md bg-muted p-3 text-sm">{row.investigation}</p>}
      <p className="text-sm">{row.carrier} · {row.plan} · Proposed effective date: {row.effectiveDate}</p>
      <p className="text-sm text-muted-foreground">Application: {row.code}</p>
      {row.candidates.length>0&&<ul className="text-sm space-y-1">{row.candidates.map((candidate,i)=><li key={i}>GHL contact: {candidate.name} · {candidate.evidence==="Full MBI agrees"?"Full MBI matches":candidate.evidence==="Name only"?"Name matches; MBI not confirmed":"MBI does not match"}</li>)}</ul>}
    </article>)}
  </div>;
}
