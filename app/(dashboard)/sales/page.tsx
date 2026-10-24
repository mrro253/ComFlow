import { EnrollmentStatusList } from "@/components/dashboard/enrollment-status-list";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listEditableSales } from "@/lib/services/saleDispositionService";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { policyStatuses } from "@/lib/enrollments/saleDisposition";
import { saveDisposition, saveSaleAssignment } from "./actions";
import Link from "next/link";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ collection?: string; q?: string; view?: string; status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.active || !["owner", "agent"].includes(user.role)) redirect("/dashboard");
  const params = await searchParams;
  if (params.view !== "manage" || user.role !== "owner") return <EnrollmentStatusList user={user} query={params.q} filter={params.status} collection={params.collection} />;
  const sales = await listEditableSales(user, params.collection);
  const team = user.role === "owner" ? (await listUsersForAgency(user.agencyId)).filter(row => row.active && (row.role === "agent" || row.id === user.id)) : [];
  const query = (params.q ?? "").trim().slice(0, 200).toLowerCase();
  const visible = sales.filter(row => !query || `${row.clientName} ${row.code} ${row.carrier}`.toLowerCase().includes(query));
  return <div className="space-y-5">
    <div><Link href="/sales" className="text-sm underline">Back to enrollment commissions</Link><h1 className="text-2xl font-semibold">Manage enrollment records</h1><p className="mt-2 text-sm text-muted-foreground">These enrollment records are for reference. You do not need to set a status or add a note for every sale. Items requiring review appear under Needs attention.</p></div>
    <p className="text-sm text-muted-foreground">{user.role === "owner" ? "Agent access is managed by the agency. Routine sales do not need manual updates." : "Only sales your agency has assigned to you are shown."}</p>
    <form method="get" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="view" value="manage" />{params.collection && <input type="hidden" name="collection" value={params.collection} />}
      <label className="flex flex-col gap-1 text-sm">Find a client, carrier or enrollment code<input name="q" defaultValue={params.q ?? ""} maxLength={200} className="rounded-md border bg-background p-2" /></label>
      <button type="submit" className="rounded-md border px-4 py-2 text-sm">Search sales</button><Link className="text-sm underline" href={params.collection ? `/sales?collection=${params.collection}` : "/sales"}>Clear search</Link>
    </form>
    <p className="text-sm text-muted-foreground">Showing {visible.length} of {sales.length} sales. Unknown means coverage has not been confirmed here; no manual update is required.</p>
    {visible.length === 0 && <p className="rounded-lg border p-4">{"No sales match this search."}</p>}
    {visible.map(sale => <details className="rounded-lg border bg-card p-4" key={`${sale.ownerId}/${sale.collectionHash}/${sale.code}`}>
      <summary className="cursor-pointer"><span className="font-semibold">{sale.clientName}</span><span className="ml-2 text-sm">{sale.carrier}</span><span className="mt-1 block text-sm">Policy disposition: {sale.disposition?.status ?? "Unknown"}</span></summary>
      <div className="mt-4 space-y-4 text-sm">
        <p>{sale.plan} · Proposed effective date {sale.proposedEffectiveDate} · Enrollment {sale.code}</p>
        {sale.disposition && <div className="rounded-md bg-muted/40 p-3"><p className="whitespace-pre-wrap">{sale.disposition.note}</p><p className="mt-1 text-xs text-muted-foreground">Recorded by {sale.disposition.actorName}</p></div>}
        <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">Correct this information</summary><form action={saveDisposition} className="mt-3 space-y-3">
          <input type="hidden" name="owner" value={sale.ownerId} /><input type="hidden" name="collection" value={sale.collectionHash} /><input type="hidden" name="code" value={sale.code} />
          <label className="flex max-w-sm flex-col gap-1">Policy disposition<select name="status" defaultValue={sale.disposition?.status ?? "Unknown"} className="rounded-md border bg-background p-2">{policyStatuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="flex flex-col gap-1">Explanation<textarea name="note" required maxLength={2000} className="min-h-24 rounded-md border bg-background p-2" /></label>
          <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" type="submit">Save disposition</button>
          <p className="text-xs text-muted-foreground">A required explanation and who changed the disposition are retained in history. Follow-up outcomes such as no commission expected are managed separately.</p>
        </form></details>
        {user.role === "owner" && <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">Manage agent access</summary><form action={saveSaleAssignment} className="mt-3 space-y-2">
          <input type="hidden" name="collection" value={sale.collectionHash} /><input type="hidden" name="code" value={sale.code} />
          <label className="flex max-w-sm flex-col gap-1">Assigned agent<select name="agent" defaultValue={sale.assignedAgentId ?? ""} className="rounded-md border bg-background p-2"><option value="">Unassigned — owner only</option>{team.map(agent => <option key={agent.id} value={agent.id}>{agent.firstName} {agent.lastName}</option>)}</select></label>
          <button type="submit" className="rounded-md border px-4 py-2">Save assignment</button>
        </form></details>}
        <details className="border-t pt-3"><summary className="cursor-pointer font-medium">Change history ({sale.history.length})</summary>
          <ul className="mt-3 space-y-3">{sale.history.map(event => <li key={event.id} className="rounded-md bg-muted/30 p-3"><p>{event.kind === "disposition" ? `Disposition: ${event.status}` : event.agentId ? "Agent assignment updated" : "Agent assignment removed"} · {event.actorName}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(event.recordedAt))} Eastern</p>{event.kind === "disposition" && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}</li>)}</ul>
        </details>
      </div>
    </details>)}
  </div>;
}
