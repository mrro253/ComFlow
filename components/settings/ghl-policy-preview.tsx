"use client";
import { useState } from "react";
import { previewPolicyUpdates,type PolicyUpdateState } from "@/app/(dashboard)/settings/ghl/updates/actions";
import { Button } from "@/components/ui/button";
export function GhlPolicyPreview(){
  const [state,setState]=useState<PolicyUpdateState>({}),[pending,setPending]=useState(false);
  async function run(){if(pending)return;setPending(true);setState({});try{setState(await previewPolicyUpdates());}catch{setState({error:"Preview unavailable. Please try again."});}finally{setPending(false);}}
  return <div className="space-y-5"><Button onClick={run} disabled={pending}>{pending?"Reading current GHL policy fields…":"Run read-only policy preview"}</Button>
    <div aria-live="polite">{state.error&&<p role="alert">{state.error}</p>}{state.rows&&<div className="rounded-lg border p-4 space-y-2"><p className="font-semibold">{state.rows.length} linked enrollments compared · 0 policy field changes ready</p><p className="text-sm">{state.skipped} unlinked enrollments excluded. Existing GHL values are preserved. Draft notes below are for review only and have not been saved.</p></div>}</div>
    {state.rows?.map(row=><article className="rounded-lg border p-5 space-y-4" key={row.code}><div><h2 className="font-semibold">{row.name}</h2><p className="text-sm">{row.carrier} · Application {row.code}</p></div>
      <p className="rounded-md bg-muted p-3 text-sm">{row.reason}</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Policy field</th><th className="p-2">Currently in GHL</th><th className="p-2">Enrollment information</th><th className="p-2">Preview decision</th></tr></thead><tbody>{row.fields.map(field=><tr key={field.label} className="border-b align-top"><th className="p-2 font-medium">{field.label}</th><td className="p-2 break-words">{field.current}</td><td className="p-2 break-words">{field.enrollment}</td><td className="p-2">{field.decision}</td></tr>)}</tbody></table></div>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Enrollment reference note — draft only</summary><p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3">{row.noteDraft}</p></details>
      <details className="text-sm"><summary className="cursor-pointer font-medium">History note for a future approved change — draft only</summary><p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3">{row.historyDraft}</p></details>
    </article>)}
  </div>;
}
