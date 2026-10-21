"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { queryPayments } from "@/app/(dashboard)/payments/actions";
import type { PaymentLedgerView } from "@/lib/services/paymentLedgerService";
import type { PaymentFilters } from "@/lib/reporting/paymentQuery";
import { formatCents } from "@/lib/carriers/money";
import { AssignPaymentForm } from "@/components/payments/assign-payment-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Payment = PaymentLedgerView["rows"][number];
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

export function PaymentLedger({ initial, role }: { initial: PaymentLedgerView; role: string }) {
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState(initial.filters);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Payment | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const isOwner = role === "owner";
  useEffect(() => { setView(initial); setDraft(initial.filters); }, [initial]);
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  function run(filters: PaymentFilters) {
    setError(null); setSelected(null);
    startTransition(async () => {
      try {
        const response = await queryPayments(filters);
        if (response.data) { setView(response.data); setDraft(response.data.filters); }
        else setError(response.error ?? "Could not load payments.");
      } catch { setError("Could not load payments. Try again."); }
    });
  }
  function submit(event: FormEvent) { event.preventDefault(); run({ ...draft, page: 1 }); }
  function clear() {
    run({ search: "", month: "all", carrier: "all", agent: "all", category: "all", from: "", to: "", unassigned: false, page: 1, pageSize: view.filters.pageSize });
  }
  const personName = (id: string | null) => id ? (view.options.agents.find((person) => person.id === id)?.name ?? "Team member") : "Unassigned";
  return (
    <div className="flex flex-col gap-6" aria-busy={pending}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Search carrier payments and open a client to see their statement details.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Find payments</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-sm sm:col-span-2">Search clients
                <Input type="search" autoComplete="off" spellCheck={false} maxLength={160} placeholder="Client name or member ID" value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Statement month
                <select className={selectClass} value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })}>
                  <option value="all">All months</option>{view.options.months.map((month) => <option key={month}>{month}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Carrier
                <select className={selectClass} value={draft.carrier} onChange={(e) => setDraft({ ...draft, carrier: e.target.value })}>
                  <option value="all">All carriers</option>{view.options.carriers.map((carrier) => <option key={carrier}>{carrier}</option>)}
                </select>
              </label>
              {role !== "agent" && <label className="grid gap-1 text-sm">Agent
                <select className={selectClass} value={draft.agent} onChange={(e) => setDraft({ ...draft, agent: e.target.value })}>
                  <option value="all">All visible agents</option>{view.options.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </label>}
              <label className="grid gap-1 text-sm">Payment category
                <select className={selectClass} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  <option value="all">All categories</option>{view.options.categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Effective from
                <Input type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Effective through
                <Input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </label>
              {isOwner && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.unassigned} onChange={(e) => setDraft({ ...draft, unassigned: e.target.checked })} />Unassigned only</label>}
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
                <Button type="submit">{pending ? "Loading…" : "Apply filters"}</Button>
                <Button type="button" variant="outline" onClick={clear}>Clear filters</Button>
              </div>
            </fieldset>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          {view.warning && <p role="status" className="mt-3 text-sm text-muted-foreground">{view.warning}</p>}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3" aria-live="polite">
        <Card><CardHeader><CardTitle>Paid by carrier</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{formatCents(view.totalCents)}</p><p className="text-xs text-muted-foreground">All matching payments, across every page</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Matching payments</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{view.count}</p></CardContent></Card>
        {isOwner && <Card><CardHeader><CardTitle>Unassigned</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{view.unassignedCount}</p></CardContent></Card>}
      </div>
      {view.categories.length > 0 && <Card>
        <CardHeader><CardTitle>By payment category</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">{view.categories.map((category) => <div key={category.type} className="min-w-40 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">{category.type}</p><p className={category.cents < 0 ? "font-semibold text-destructive" : "font-semibold"}>{formatCents(category.cents)}</p><p className="text-xs text-muted-foreground">{category.count} payments</p>
        </div>)}</CardContent>
      </Card>}
      <Card>
        <CardHeader><CardTitle>Payment detail</CardTitle><p className="text-sm text-muted-foreground">Click a client to open all statement fields.</p></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Client / member ID</TableHead><TableHead>Carrier</TableHead><TableHead>Category</TableHead><TableHead>Effective</TableHead><TableHead>Month</TableHead>{role !== "agent" && <TableHead>Credited to</TableHead>}<TableHead className="text-right">Amount</TableHead>{isOwner && <TableHead>Assign</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {!view.rows.length && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No matching payments. Try changing or clearing the filters.</TableCell></TableRow>}
              {view.rows.map((row) => <TableRow key={row.id}>
                <TableCell><button type="button" disabled={pending} onClick={() => setSelected(row)} className="text-left font-medium underline-offset-4 hover:underline focus-visible:underline">{row.sourceDetails?.clientName || "View payment details"}</button><p className="text-xs text-muted-foreground">{row.memberId}</p></TableCell>
                <TableCell>{row.carrier}</TableCell><TableCell>{row.commissionType}</TableCell><TableCell>{row.effectiveDate}</TableCell><TableCell>{row.statementMonth}</TableCell>
                {role !== "agent" && <TableCell>{personName(row.userId)}</TableCell>}
                <TableCell className={row.amountCents < 0 ? "text-right font-medium text-destructive" : "text-right font-medium"}>{formatCents(row.amountCents)}</TableCell>
                {isOwner && <TableCell>{!row.userId && <AssignPaymentForm transactionId={row.id} team={view.team} canRemember={row.writingAgentName !== null} />}</TableCell>}
              </TableRow>)}
            </TableBody>
          </Table>
          <nav aria-label="Payment pagination" className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <p role="status" className="text-sm">Showing {view.start}–{view.end} of {view.count} payments</p>
            <label className="flex items-center gap-2 text-sm">Rows per page<select aria-label="Rows per page" className={selectClass} value={view.filters.pageSize} disabled={pending} onChange={(e) => run({ ...view.filters, pageSize: Number(e.target.value), page: 1 })}>{[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
            <div className="flex items-center gap-3"><Button type="button" variant="outline" disabled={pending || view.page <= 1} onClick={() => run({ ...view.filters, page: view.page - 1 })}>Previous</Button><span className="text-sm">Page {view.page} of {view.pages}</span><Button type="button" variant="outline" disabled={pending || view.page >= view.pages} onClick={() => run({ ...view.filters, page: view.page + 1 })}>Next</Button></div>
          </nav>
        </CardContent>
      </Card>
      <dialog ref={dialog} aria-labelledby="payment-details-title" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} className="m-auto max-h-[85vh] w-[min(95vw,48rem)] overflow-y-auto rounded-lg border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50">
        {selected && <>
          <div className="flex items-start justify-between gap-4"><h2 id="payment-details-title" className="text-xl font-semibold">{selected.sourceDetails?.clientName || "Payment details"}</h2><Button type="button" variant="outline" onClick={() => setSelected(null)}>Close</Button></div>
          <p className="mt-2 text-sm">{selected.carrier} · {selected.statementMonth} · {selected.commissionType} · {formatCents(selected.amountCents)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Credited to {personName(selected.userId)}{selected.writingUserId ? ` · Written by ${personName(selected.writingUserId)}` : ""}</p>
          {selected.sourceDetails ? <>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">{selected.sourceDetails.fields.map((field, index) => <div key={index}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="break-words text-sm">{field.value || "Not provided"}</dd></div>)}</dl>
            <p className="mt-5 break-words text-xs text-muted-foreground">{selected.sourceDetails.statementFilename} · Source row {selected.sourceDetails.sourceRow}</p>
          </> : <p className="mt-4 text-sm">Source details unavailable. Member ID: {selected.memberId}; effective date: {selected.effectiveDate}. Your payment record is unchanged.</p>}
          {isOwner && <Link href={`/statements/${selected.statementId}`} className="mt-4 inline-block text-sm underline">View source statement</Link>}
        </>}
      </dialog>
    </div>
  );
}