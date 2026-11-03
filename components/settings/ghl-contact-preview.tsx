"use client";
import { useState } from "react";
import { previewGhlContacts,type ContactPreviewState } from "@/app/(dashboard)/settings/ghl/preview/actions";
import { Button } from "@/components/ui/button";
export function GhlContactPreview() {
  const [state,setState]=useState<ContactPreviewState>({});const [pending,setPending]=useState(false);
  async function run(){if(pending)return;setPending(true);setState({});try{setState(await previewGhlContacts());}catch{setState({error:"Preview unavailable. Try again."});}finally{setPending(false);}}
  return <div className="space-y-4">
    <Button onClick={run} disabled={pending}>{pending?"Comparing enrollments with GHL…":"Run read-only preview"}</Button>
    <div aria-live="polite">{state.error&&<p role="alert">{state.error}</p>}{state.warning&&<p className="rounded-md bg-muted p-3 text-sm">{state.warning}</p>}{state.rows&&<p className="mt-3">{state.rows.length} enrollments checked. No links or updates saved.</p>}</div>
    {state.rows?.length===0&&<p>No enrollments are available to your ComFlow account.</p>}
    {state.rows?.map(row=><article className="rounded-lg border p-4 space-y-2" key={row.code}>
      <h2 className="font-semibold">{row.name}</h2><p className="font-medium">{row.status}</p>
      <p className="text-sm">{row.carrier} · {row.plan} · Proposed effective date: {row.effectiveDate}</p>
      <p className="text-sm text-muted-foreground">Application: {row.code}</p>
      {row.candidates.length>0&&<ul className="text-sm space-y-1">{row.candidates.map((candidate,i)=><li key={i}>GHL: {candidate.name} · {candidate.evidence}</li>)}</ul>}
    </article>)}
  </div>;
}
