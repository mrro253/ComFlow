import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSunfireMatches } from "@/lib/services/sunfireMatchService";
import { filterEnrollmentMatches } from "@/lib/enrollments/commissionMatches";
import { formatCurrency } from "@/lib/utils";
import { readConfirmedSunfireLinks } from "@/lib/repositories/sunfireLinkRepository";
import { linkPlan, isConfirmedLink } from "@/lib/enrollments/confirmedLinks";
import { digest } from "@/lib/carriers/digest";
import { confirmMatches } from "./actions";

export default async function SunfireMatchesPage({ searchParams }: { searchParams: Promise<{ collection?: string; filter?: string; q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.active || user.role !== "owner") redirect("/carriers");
  const params = await searchParams;
  let review;
  try { review = await getSunfireMatches(user, params.collection); }
  catch { return <div className="space-y-4"><h1 className="text-2xl font-semibold">SunFire commission candidates</h1><p>We couldn’t verify the complete comparison. A source may be unavailable, or the commission records may have changed while loading. No candidates were linked or records changed.</p><Link className="underline" href="/carriers/sunfire/matches">Retry current comparison</Link><p><Link className="underline" href="/carriers/sunfire">Back to collected enrollments</Link></p></div>; }
  const filter = params.filter ?? "all", query = (params.q ?? "").slice(0, 200);
  const plan = linkPlan(review.matches);
  const saved = review.current ? await readConfirmedSunfireLinks(user, review.current.hash) : [];
  const confirmed = new Set(plan.filter(link => isConfirmedLink(link, saved)).map(link => link.enrollmentCode));
  const pending = plan.filter(link => !confirmed.has(link.enrollmentCode));
  const visible = filterEnrollmentMatches(review.matches, filter, query).filter(row =>
    (filter !== "linked" || confirmed.has(row.enrollmentCode)) &&
    (filter !== "followup" || !confirmed.has(row.enrollmentCode) || row.chargebackEntries > 0));
  const counts = { strong: review.matches.filter(row => row.status === "strong").length, full: review.matches.filter(row => row.status === "full").length,
    chargebacks: review.matches.filter(row => row.chargebackEntries > 0).length, date: review.matches.filter(row => row.status === "date").length };
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">SunFire commission matches &amp; follow-up</h1><p className="mt-2 text-sm text-muted-foreground">Review enrollment evidence and confirm matching statement entries. A link records the relationship; it does not mark coverage active, mark commissions paid or change financial amounts.</p></div>
    <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href="/carriers">Carrier connections</Link><Link className="underline" href={review.current ? `/carriers/sunfire?collection=${review.current.hash}` : "/carriers/sunfire"}>Collected enrollments</Link></div>
    {!review.current ? <p className="rounded-lg border p-4">No complete SunFire collection is available. Collect enrollments first, then return here.</p> : <>
      <section className="rounded-lg border p-4 space-y-2"><h2 className="font-semibold">{review.matches.length} enrollments compared with {review.entryCount} statement entries from {review.statementCount} imported statements</h2><p className="text-sm">Full-ID candidates: {counts.full} · Shortened-ID candidates: {counts.strong} · Candidates with chargebacks: {counts.chargebacks} · Different effective dates: {counts.date}</p><p className="text-sm text-muted-foreground">Collection enrollment dates: {review.range?.start} through {review.range?.end}. A shortened Medicare ID plus a matching name, carrier and date supports a candidate; it does not establish a full-ID match. No matching entry does not prove a commission is missing.</p></section>
      <section className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <h2 className="font-semibold">Enrollment follow-up</h2>
        <p className="text-sm">{confirmed.size} linked enrollments · {counts.chargebacks} enrollments with chargebacks to investigate · {counts.date} with different effective dates · {review.matches.filter(row => ["unmatched", "no_statements"].includes(row.status)).length} with no matching imported commission yet</p>
        <p className="text-sm text-muted-foreground">These groups can overlap. No match is a reason to check the available statements, not proof that a commission is overdue. A chargeback does not by itself confirm policy termination.</p>
        {pending.length > 0 && <form action={confirmMatches} className="space-y-2">
          <input type="hidden" name="collection" value={review.current.hash} /><input type="hidden" name="plan" value={digest(plan)} />
          <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" type="submit">Link {pending.length} verified matches</button>
          <p className="text-sm text-muted-foreground">Requires matching name, carrier, effective date and full Medicare ID, or Ultimate’s five printed MBI characters. Shared or conflicting evidence stays unlinked. Chargeback entries remain identified separately.</p>
        </form>}
      </section>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <input type="hidden" name="collection" value={review.current.hash} />
        <label className="flex flex-col gap-1 text-sm">Find a client, carrier or plan<input name="q" defaultValue={query} maxLength={200} className="rounded-md border bg-background p-2" /></label>
        <label className="flex flex-col gap-1 text-sm">Show<select name="filter" defaultValue={filter} className="rounded-md border bg-background p-2"><option value="all">All enrollments</option><option value="linked">Linked enrollments</option><option value="followup">Needs follow-up</option><option value="strong">Strong shortened-ID candidates</option><option value="full">Full-ID candidates</option><option value="chargebacks">Candidates with chargebacks</option><option value="date">Different effective dates</option><option value="identity">Identity details need review</option><option value="unmatched">No supported match</option><option value="no_statements">Carrier statements not imported</option></select></label>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Apply filters</button><Link className="text-sm underline" href={`/carriers/sunfire/matches?collection=${review.current.hash}`}>Clear filters</Link>
      </form>
      <p className="text-sm text-muted-foreground">Showing {visible.length} of {review.matches.length} enrollments. Expand a client to inspect the statement evidence.</p>
      {visible.length === 0 && <p className="rounded-lg border p-4">No enrollments match these filters.</p>}
      {visible.map(match => <details className="rounded-lg border p-4" key={match.enrollmentCode}>
        <summary className="cursor-pointer space-y-1"><span className="font-semibold">{match.clientName}</span><span className="ml-2 text-sm">{match.carrier} · Proposed {match.proposedEffectiveDate}</span><span className="block text-sm">{match.label}{match.chargebackEntries > 0 && <strong className="ml-2 text-destructive">{match.chargebackEntries} chargeback {match.chargebackEntries === 1 ? "entry" : "entries"}</strong>}</span></summary>
        <div className="mt-4 space-y-3 text-sm"><p>{match.plan}</p><p>Medicare ID: {match.mbiDisplay}. Proposed effective date: {match.proposedEffectiveDate}.</p>
          {confirmed.has(match.enrollmentCode) ? <p className="font-medium text-success">Linked by owner confirmation. Current source evidence still agrees.</p> : saved.some(link => link.enrollmentCode === match.enrollmentCode) ? <p className="font-medium text-destructive">Previously confirmed evidence has changed. Review again; the earlier confirmation is retained in the audit trail.</p> : <p className="text-muted-foreground">Not linked.</p>}
          {match.sharedEvidence && <p className="rounded-md bg-muted p-3">A statement entry also appears under another SunFire enrollment. It cannot identify which submission generated the commission. Do not count it twice.</p>}
          {match.status === "date" && <p>The name and shortened Medicare ID agree, but the statement effective date differs from this enrollment. It may describe an earlier policy.</p>}
          {match.status === "identity" && <p>Some identity or enrollment details disagree. These entries are shown for investigation and are not confirmed matches.</p>}
          {match.chargebackEntries > 0 && <p className="rounded-md bg-destructive/10 p-3 text-destructive">Chargebacks are shown separately from commission entries. Their presence does not establish that this enrollment is currently paid or active.</p>}
          {match.evidence.length === 0 ? <p>{match.status === "no_statements" ? "No active imported statements for this carrier are available in the comparison." : "No verified statement entry supports this enrollment in the current imported sources."}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Statement evidence for {match.clientName}</caption><thead className="text-left"><tr>{["Statement", "Client on statement", "Statement effective date", "Entry type", "Reported amount", "Carrier notes", "Evidence"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{match.evidence.map(entry => <tr className="border-t" key={entry.entryId}><td className="p-2"><Link prefetch={false} className="underline" href={`/statements/${entry.statementId}`}>Open {entry.statementMonth} statement</Link><span className="block text-xs text-muted-foreground">{entry.statementFilename}</span></td><td className="p-2">{entry.clientName}</td><td className="p-2">{entry.effectiveDate}</td><td className="p-2">{entry.chargeback ? "Chargeback" : entry.category}</td><td className="p-2 whitespace-nowrap">{formatCurrency(entry.amountCents / 100)}</td><td className="p-2 min-w-48">{review.sourceNotes[entry.entryId] || "Not provided"}</td><td className="p-2">{entry.fullId ? "Full Medicare ID agrees" : entry.partialId ? "Five printed Medicare ID characters agree" : "Medicare ID does not establish a match"}; name {entry.name ? "agrees" : "needs review"}; effective date {entry.date ? "agrees" : "differs"}.</td></tr>)}</tbody></table></div>}
          <p className="text-xs text-muted-foreground">Links preserve the original statement entries and amounts. Chargebacks remain separate from positive commissions.</p>
        </div>
      </details>)}
    </>}
  </div>;
}
