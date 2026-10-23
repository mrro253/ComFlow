import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { canManageStatements } from "@/lib/auth/statementAccess";
import { getStatementWorklists } from "@/lib/services/statementWorklistService";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { listSupportedCarriers } from "@/lib/carriers";

import { statementCoverage } from "@/lib/reporting/statementCoverage";
import { formatCents } from "@/lib/carriers/money";
import { UploadStatementForm } from "@/components/statements/upload-statement-form";
import { STATEMENT_STATUS_BADGE } from "@/components/statements/status";

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ year?: string; view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageStatements(user)) redirect("/dashboard");
  const [work, team, params] = await Promise.all([getStatementWorklists(user), listUsersForAgency(user.agencyId), searchParams]);
  const statements = work.statements;
  const view = params.view === "imported" ? "imported" : "attention";
  const rows = view === "imported" ? work.imported : work.needsAttention;
  const names = new Map(team.map(row => [row.id, `${row.firstName} ${row.lastName}`]));
  const independents = user.role === "owner" ? team.filter(row => row.agentType === "independent" && row.role !== "owner" && row.active).map(row => ({ id: row.id, name: `${row.firstName} ${row.lastName}` })) : [];
  const currentYear = new Date().getUTCFullYear();
  const years = [...new Set([currentYear, ...statements.flatMap(row => row.statementMonth ? [Number(row.statementMonth.slice(0, 4))] : [])])].filter(year => Number.isInteger(year) && year >= 2000 && year <= 2099).sort((a,b) => b-a);
  const year = years.includes(Number(params.year)) ? Number(params.year) : currentYear;
  const coverage = statementCoverage(statements.filter(row => !work.duplicates.has(row.id)), year);
  const archive = statements.filter(row => row.status === "superseded" || row.supersededAt || work.duplicates.has(row.id));
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Statements</h1><p className="mt-2 text-sm text-muted-foreground">Review exceptions here. Imported statements are already included in your commission activity.</p></div>
    <nav aria-label="Statement views" className="flex flex-wrap gap-3">
      <Link aria-current={view === "attention" ? "page" : undefined} className={`rounded-md border px-4 py-2 text-sm ${view === "attention" ? "bg-primary text-primary-foreground" : "bg-card"}`} href="/statements">Needs attention ({work.needsAttention.length + work.downloadedPairs.length})</Link>
      <Link aria-current={view === "imported" ? "page" : undefined} className={`rounded-md border px-4 py-2 text-sm ${view === "imported" ? "bg-primary text-primary-foreground" : "bg-card"}`} href="/statements?view=imported">Imported statements ({work.imported.length})</Link>
    </nav>
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-lg font-semibold">{view === "attention" ? "Statements needing a decision" : "Already included in commissions"}</h2>
      <p className="text-sm text-muted-foreground">{view === "attention" ? "Open a statement to see what needs checking. Nothing is imported or replaced from this list." : "No action is needed for these statements. Open one when you want to see its details."}</p>
      {view === "attention" && work.downloadedPairs.map(pair => <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3" key={pair.pairHash}><p>Devoted Health · Statement dated {pair.payDate}</p><Link className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" href={`/statements/devoted?connection=${pair.connectionId}&pair=${pair.pairHash}`}>Review statement pair</Link></div>)}
      {rows.length === 0 ? view === "attention" && work.downloadedPairs.length > 0 ? null : <p className="rounded-md bg-muted/30 p-4">{view === "attention" ? "No statements need review in the files currently on record." : "No imported statements yet."}</p> : <ul className="divide-y">{rows.map(row => <li className="flex flex-wrap items-center justify-between gap-3 py-4" key={row.id}>
        <div className="min-w-0 flex-1"><h3 className="font-medium">{row.carrier} · {row.statementMonth ?? "Month to be checked"}</h3><p className="text-sm text-muted-foreground">{row.userId ? names.get(row.userId) ?? "Agent" : "Agency"} · {work.duplicates.has(row.id) ? "Already imported copy" : STATEMENT_STATUS_BADGE[row.status].label}{row.statementTotalCents !== null ? ` · Statement total ${formatCents(row.statementTotalCents)}` : ""}</p><p className="mt-1 break-all text-xs text-muted-foreground">{row.originalFilename ?? "Portal statement"}</p></div>
        <Link className={`rounded-md px-4 py-2 text-sm ${view === "attention" ? "bg-primary text-primary-foreground" : "border"}`} href={`/statements/${row.id}`}>{view === "attention" ? "Review statement" : "Open statement"}</Link>
      </li>)}</ul>}
    </section>
    <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Upload a statement manually</summary><div className="mt-4 space-y-3"><p className="text-sm text-muted-foreground">Use this only when you need to supply a file yourself. Files collected from connected portals appear here too.</p><UploadStatementForm carriers={listSupportedCarriers()} independents={independents} ownBookOnly={user.role !== "owner"} />{user.role === "owner" && process.env.DEVOTED_REVIEW_ENABLED === "true" && <Link className="block text-sm underline" href="/statements/devoted">Upload a Devoted PDF and spreadsheet pair</Link>}</div></details>
    {view === "imported" && <>
      <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Statement coverage by month</summary><div className="mt-4 space-y-4"><form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="view" value="imported" /><label className="grid gap-1 text-sm">Year<select name="year" defaultValue={year} className="rounded-md border bg-background p-2">{years.map(value => <option key={value}>{value}</option>)}</select></label><button className="rounded-md border px-3 py-2 text-sm" type="submit">Show year</button></form><p className="text-sm text-muted-foreground">None on file means no saved statement; it does not mean a payment is missing. Verified identical-content PDF copies and superseded records are excluded.</p>{coverage.map(group => <section key={JSON.stringify([group.carrier,group.userId])}><h3 className="font-medium">{group.carrier} · {group.userId ? names.get(group.userId) ?? "Agent" : "Agency"}</h3><ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{group.months.map((status,index) => <li className="rounded border p-2 text-sm" key={index}>{new Date(Date.UTC(year,index,1)).toLocaleString("en-US",{month:"short",timeZone:"UTC"})}: {status}</li>)}</ul></section>)}</div></details>
      <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Older and already imported copies ({archive.length})</summary><ul className="mt-3 space-y-2">{archive.map(row => <li key={row.id}><Link className="text-sm underline" href={`/statements/${work.duplicates.get(row.id) ?? row.id}`}>{row.carrier} · {row.statementMonth ?? "Month not verified"} · {work.duplicates.has(row.id) ? "Same printed content already imported" : "Replaced by a newer statement"}</Link></li>)}</ul></details>
    </>}
  </div>;
}
