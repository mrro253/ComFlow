import { EnrollmentStatusRefresh } from "./enrollment-status-refresh";
import Link from "next/link";
import type { CurrentUser } from "@/types/domain";
import { listEnrollmentStatuses } from "@/lib/services/enrollmentStatusService";
import { formatCents } from "@/lib/carriers/money";
import { commissionStatusLabels } from "@/lib/enrollments/commissionStatus";

export async function EnrollmentStatusList({ user, query = "", filter = "", collection }: { user: CurrentUser; query?: string; filter?: string; collection?: string }) {
  let sales;
  try { sales = await listEnrollmentStatuses(user, collection); }
  catch { return <div className="rounded-lg border p-6"><h1 className="text-2xl font-semibold">Enrollments</h1><p className="mt-3">Commission status could not be verified. Please try again shortly.</p><p className="mt-2 text-sm text-muted-foreground">No enrollment has been marked unpaid because of this check.</p></div>; }
  const q = query.trim().slice(0, 200).toLowerCase();
  const visible = sales.filter(sale => (!q || `${sale.clientName} ${sale.carrier} ${sale.plan}`.toLowerCase().includes(q)) && (!commissionStatusLabels.includes(filter as typeof commissionStatusLabels[number]) || sale.commission.label === filter));
  return <div className="space-y-5"><EnrollmentStatusRefresh />
    <div><h1 className="text-2xl font-semibold">Enrollments</h1><p className="mt-2 text-sm text-muted-foreground">See which enrollments have a commission on file. Status updates automatically after statements are imported; this view checks for updates every minute. No review or approval is needed from you.</p></div>
    <Link className="inline-block text-sm underline" href="/dashboard?view=overview">View commission totals</Link>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{commissionStatusLabels.map(label => <Link key={label} href={`/sales?status=${encodeURIComponent(label)}${collection ? `&collection=${collection}` : ""}`} className="rounded-lg border bg-card p-4"><span className="block text-sm">{label}</span><strong className="text-2xl">{sales.filter(sale => sale.commission.label === label).length}</strong></Link>)}</div>
    <form className="flex flex-wrap gap-3" method="get">{collection && <input type="hidden" name="collection" value={collection} />}<input aria-label="Find an enrollment" name="q" defaultValue={query} placeholder="Find a client or carrier" maxLength={200} className="rounded-md border bg-background p-2" /><select aria-label="Commission status" name="status" defaultValue={filter} className="rounded-md border bg-background p-2"><option value="">All enrollments</option>{commissionStatusLabels.map(label => <option key={label}>{label}</option>)}</select><button className="rounded-md border px-4 py-2">Search</button><Link className="p-2 text-sm underline" href="/sales">Show all</Link></form>
    <p className="text-sm text-muted-foreground">{visible.length} enrollments · Based on imported statements, not bank deposits. Not paid yet can mean a statement is missing or payment is still pending.</p>
    {!sales.length && <p className="rounded-lg border p-4">{user.role === "agent" ? "No enrollments are available for your account yet." : "No enrollments have been collected yet."}</p>}
    {sales.length > 0 && !visible.length && <p>No enrollments match this search.</p>}
    {visible.map(sale => <div key={`${sale.ownerId}/${sale.collectionHash}/${sale.code}`} className="rounded-lg border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{sale.clientName}</h2><p className="text-sm">{sale.carrier}</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold ${sale.commission.label === "Paid" ? "bg-green-100 text-green-900" : sale.commission.label === "Charged back" ? "bg-red-100 text-red-900" : "bg-muted text-foreground"}`}>{sale.commission.label}</span></div><p className="mt-2 text-sm">{sale.plan} · Proposed effective date {sale.proposedEffectiveDate}</p><p className="mt-2 text-sm text-muted-foreground">{sale.commission.reason}</p>{sale.explanation && <p className="mt-2 text-sm">{sale.explanation}</p>}<details className="mt-3 text-sm"><summary className="cursor-pointer">Commission details</summary><p className="mt-2">Commission reported: {formatCents(sale.commission.paidCents)} · Reversed: {formatCents(sale.commission.chargedBackCents)}</p>{sale.commission.evidence.map(row => <p className="mt-2" key={row.entryId}>{row.statementMonth} · {row.category} · {formatCents(row.amountCents)}</p>)}<p className="mt-2 text-muted-foreground">Enrollment {sale.code}</p></details></div>)}
    <p className="text-sm text-muted-foreground">Collection still uses Sync now. Scheduled collection is not enabled.</p>
    {user.role === "owner" && <details className="border-t pt-3 text-sm"><summary className="cursor-pointer">Agency administration</summary><Link href="/sales?view=manage" className="mt-3 inline-block underline">Correct enrollment information or manage access</Link></details>}
  </div>;
}
