"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { queryClientCommissionHistory } from "@/app/(dashboard)/payments/actions";
import type { ClientCommissionHistoryView } from "@/lib/services/clientCommissionHistoryService";
import { formatCents } from "@/lib/carriers/money";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ClientCommissionHistory({ transactionId }: { transactionId: string }) {
  const [history, setHistory] = useState<ClientCommissionHistoryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  function load(page = 1) {
    const current = ++request.current;
    setError(null);
    startTransition(async () => {
      try {
        const result = await queryClientCommissionHistory({ transactionId, page });
        if (current !== request.current) return;
        if (result.data) setHistory(result.data);
        else { setHistory(null); setError(result.error ?? "Client history is unavailable."); }
      } catch { if (current === request.current) { setHistory(null); setError("Could not load client history. Try again."); } }
    });
  }
  return <section className="mt-6 border-t pt-5" aria-labelledby="client-history-title" aria-busy={pending}>
    <h3 id="client-history-title" className="text-lg font-semibold">Client commission history</h3>
    <p className="mt-1 text-sm text-muted-foreground">Across all imported months for this carrier member ID and credited agent/writer. Other carriers and agent assignments are separate. Superseded entries are excluded.</p>
    {!history && <Button className="mt-3" type="button" variant="outline" disabled={pending} onClick={() => load()}>{pending ? "Loading history…" : "View client commission history"}</Button>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {history && <div className="mt-4 space-y-5" aria-live="polite">
      <p className="text-sm">{history.carrier} · Member ID {history.memberId}</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{ label: "Positive entries", cents: history.positiveCents }, { label: "Negative entries", cents: history.negativeCents }, { label: "Net carrier commission", cents: history.totalCents }].map((item) => <div className="rounded-md border p-3" key={item.label}><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className={item.cents < 0 ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>{formatCents(item.cents)}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">{history.count} commission {history.count === 1 ? "entry" : "entries"} from {history.statementCount} {history.statementCount === 1 ? "statement" : "statements"}. These are client-level commissions, not separate bank deposits or agent earnings. Categories are shown as reported; a negative entry alone does not prove a policy ended.</p>
      <div><h4 className="mb-2 font-medium">Commission by statement month</h4><ul className="grid gap-2 sm:grid-cols-2">{history.months.map((month) => <li key={month.month} className="rounded-md border p-3 text-sm"><span className="font-medium">{month.month} · {formatCents(month.cents)}</span><p className="text-xs text-muted-foreground">{month.entries} {month.entries === 1 ? "entry" : "entries"} · {month.statementCount} {month.statementCount === 1 ? "statement" : "statements"}</p></li>)}</ul></div>
      <div><h4 className="mb-2 font-medium">Statement entries</h4><p className="mb-2 text-xs text-muted-foreground">Newest statement month first. On a phone, swipe the table sideways.</p><Table>
        <TableHeader><TableRow><TableHead>Statement month</TableHead><TableHead>Category</TableHead><TableHead>Policy effective date</TableHead><TableHead className="text-right">Carrier commission</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
        <TableBody>{history.rows.map((row) => <TableRow key={row.id}><TableCell>{row.statementMonth}</TableCell><TableCell>{row.category}</TableCell><TableCell>{row.effectiveDate}</TableCell><TableCell className={row.cents < 0 ? "text-right text-destructive" : "text-right"}>{formatCents(row.cents)}</TableCell><TableCell>{row.canViewStatement ? <Link className="underline" href={`/statements/${row.statementId}`}>View statement</Link> : "Imported statement"}</TableCell></TableRow>)}</TableBody>
      </Table></div>
      <nav aria-label="Client history pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Showing entries {history.start}–{history.end} of {history.count}</span><div className="flex items-center gap-2"><Button type="button" variant="outline" disabled={pending || history.page <= 1} onClick={() => load(history.page - 1)}>Previous history</Button><span>{history.page} of {history.pages}</span><Button type="button" variant="outline" disabled={pending || history.page >= history.pages} onClick={() => load(history.page + 1)}>Next history</Button></div></nav>
    </div>}
  </section>;
}
