"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { reviewDevotedFiles } from "@/app/(dashboard)/statements/devoted/actions";
import { formatCents } from "@/lib/carriers/money";
import { Button } from "@/components/ui/button";

type ReviewResult = Awaited<ReturnType<typeof reviewDevotedFiles>>;
export function DevotedReviewForm({ importEnabled, savedPair }: { importEnabled: boolean; savedPair?: { connectionId: string; pairHash: string } }) {
  const [state, setState] = useState<Partial<ReviewResult>>({});
  const [pending, start] = useTransition();
  const result = state.result;
  function submit(form: FormData) { start(async () => { try { setState(await reviewDevotedFiles(form)); } catch { setState({ error: "Review failed. Please try again." }); } }); }
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = (event.nativeEvent as SubmitEvent).submitter;
    form.set("operation", button instanceof HTMLButtonElement ? button.value : "preview");
    submit(form);
  }} className="space-y-5 rounded-lg border bg-card p-4" aria-busy={pending}>
    {savedPair && <><input type="hidden" name="pairHash" value={savedPair.pairHash} /><input type="hidden" name="connectionId" value={savedPair.connectionId} /><p className="text-sm">Downloaded PDF and matching workbook selected. Preview verifies their saved fingerprints.</p></>}
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
      {!savedPair && <><label className="grid gap-2 text-sm">Statement PDF<input required type="file" name="pdf" accept=".pdf" onChange={() => setState({})} /></label>
      <label className="grid gap-2 text-sm">Matching workbook<input required type="file" name="workbook" accept=".xlsx,.xls" onChange={() => setState({})} /></label></>}
      <Button name="operation" value="preview" type="submit">{pending ? "Checking sources…" : "Preview pair"}</Button>
    </fieldset>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state.importedId && <p role="status">Import completed. <Link className="underline" href={`/statements/${state.importedId}`}>Open statement</Link></p>}
    {result && <section className="space-y-4" aria-live="polite">
      <h2 className="font-semibold">Both sources reconciled</h2>
      <p>Pay date: {result.pair.payDate}. Payment period: {result.pair.periodStart} through {result.pair.periodEnd}.</p>
      <p>{result.pair.statement.transactions.length} commission entry; total {formatCents(result.pair.statement.statementTotalCents)}. Bank deposit not verified.</p>
      <p className="text-sm">Source status: PDF and workbook verified. Category: RENEWAL (printed as Renewal - Monthly).</p>
      {result.plan.assignments.map((a, i) => <p key={i} className="text-sm">Writing-agent assignment: {a.status === "assigned" ? `Matched (${a.entityType === "personal" ? "personal production" : a.agentType ?? "team member"})` : "Unassigned; match the writing agent in Users before import if needed"}</p>)}
      {result.plan.duplicate && <p>This pair is already imported. No new entries will be added.</p>}
      {result.plan.blockers.map((b) => <p role="alert" key={b}>{b}</p>)}
      <dl className="grid gap-3 sm:grid-cols-2">{result.pair.fields.map((f) => <div key={f.label} className="min-w-0"><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="break-words text-sm">{f.value || "Not provided"}</dd></div>)}</dl>
      <input name="digest" type="hidden" value={result.digest} />
      {result.plan.replaces.length > 0 && <label className="flex gap-2 text-sm"><input name="replace" value="yes" type="checkbox" required />I reviewed this correction and approve replacing the earlier statement for this payee/pay date. Earlier records are retained as superseded.</label>}
      <p className="text-sm">{importEnabled ? "Approval rechecks the files, assignments and duplicate context before saving anything." : "Import disabled pending Marshall’s review. Preview has not saved or imported anything."}</p>
      {importEnabled && <Button type="submit" name="operation" value="import" disabled={pending || result.plan.duplicate || Boolean(result.plan.blockers.length)}>Approve and import reviewed pair</Button>}
    </section>}
  </form>;
}
