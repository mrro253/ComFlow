"use client";

import Link from "next/link";
import { ClientCommissionHistory } from "@/components/payments/client-commission-history";
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
const selectClass = "min-h-11 w-full rounded-md border border-input bg-background px-2 text-sm";

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
        else setError(response.error ?? "Could not load commission entries.");
      } catch { setError("Could not load commission entries. Try again."); }
    });
  }
  function submit(event: FormEvent) { event.preventDefault(); run({ ...draft, page: 1 }); }
  function clear() {
    run({ search: "", month: "all", carrier: "all", agent: "all", category: "all", product: "all", from: "", to: "", unassigned: false, page: 1, pageSize: view.filters.pageSize });
  }
  const personName = (id: string | null) => id ? (view.options.agents.find((person) => person.id === id)?.name ?? "Team member") : "Unassigned";
  return (
    <div className="flex flex-col gap-6" aria-busy={pending}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Commission activity</h1>
        <p className="text-sm text-muted-foreground">Review commission entries from carrier statements. Open a client to see the details.</p>
      </div>
      <p className="rounded-md border bg-secondary/40 p-3 text-sm">One carrier payment can cover several commission entries. Compare your bank deposit with the total on your carrier statement; bank deposits are not verified here.</p>
      <Card>
        <CardHeader><CardTitle>Find commission entries</CardTitle></CardHeader>
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
              <label className="grid gap-1 text-sm">Product type
                <select className={selectClass} value={draft.product} onChange={(e) => setDraft({ ...draft, product: e.target.value })}>
                  <option value="all">All product types</option>{view.options.products.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Commission category
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
          <p className="mt-3 text-xs text-muted-foreground">Product types use confirmed carrier mappings or verified statement fields. Unconfirmed products stay Unknown.</p>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          {view.warning && <p role="status" className="mt-3 text-sm text-muted-foreground">{view.warning}</p>}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3" aria-live="polite">
        <Card><CardHeader><CardTitle>Commission total</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{formatCents(view.totalCents)}</p><p className="text-xs text-muted-foreground">Sum of matching entries across every page. Filters and amounts added or deducted from previous statements can make this different from a statement total.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Commission entries</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{view.count}</p><p className="text-xs text-muted-foreground">Client-level lines, not separate bank deposits</p></CardContent></Card>
        {isOwner && <Card><CardHeader><CardTitle>Unassigned entries</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{view.unassignedCount}</p></CardContent></Card>}
      </div>
      {view.categories.length > 0 && <Card>
        <CardHeader><CardTitle>Entries by commission category</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">{view.categories.map((category) => <div key={category.type} className="min-w-40 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">{category.type}</p><p className={category.cents < 0 ? "font-semibold text-destructive" : "font-semibold"}>{formatCents(category.cents)}</p><p className="text-xs text-muted-foreground">{category.count} {category.count === 1 ? "entry" : "entries"}</p>
        </div>)}</CardContent>
      </Card>}
      <Card>
        <CardHeader><CardTitle>Commission entry details</CardTitle><p className="text-sm text-muted-foreground">Open a client to see all statement fields. On a phone, swipe the table sideways for more columns.</p></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Client / member ID</TableHead><TableHead>Carrier</TableHead><TableHead>Product type</TableHead><TableHead>Category</TableHead><TableHead>Policy effective date</TableHead><TableHead>Statement month</TableHead>{role !== "agent" && <TableHead>Credited to</TableHead>}<TableHead className="text-right">Carrier commission</TableHead>{isOwner && <TableHead>Assign</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {!view.rows.length && <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">No matching commission entries. Try changing or clearing the filters.</TableCell></TableRow>}
              {view.rows.map((row) => <TableRow key={row.id}>
                <TableCell><button type="button" disabled={pending} onClick={() => setSelected(row)} className="text-left font-medium underline-offset-4 hover:underline focus-visible:underline">{row.sourceDetails?.clientName || "View commission entry"}</button><p className="text-xs text-muted-foreground">{row.memberId}</p></TableCell>
                <TableCell>{row.carrier}</TableCell><TableCell>{row.product.label}</TableCell><TableCell>{row.commissionType}</TableCell><TableCell>{row.effectiveDate}</TableCell><TableCell>{row.statementMonth}</TableCell>
                {role !== "agent" && <TableCell>{personName(row.userId)}</TableCell>}
                <TableCell className={row.amountCents < 0 ? "text-right font-medium text-destructive" : "text-right font-medium"}>{formatCents(row.amountCents)}</TableCell>
                {isOwner && <TableCell>{!row.userId && <AssignPaymentForm transactionId={row.id} team={view.team} canRemember={row.writingAgentName !== null} />}</TableCell>}
              </TableRow>)}
            </TableBody>
          </Table>
          <nav aria-label="Commission entry pagination" className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <p role="status" className="text-sm">Showing entries {view.start}–{view.end} of {view.count}</p>
            <label className="flex items-center gap-2 text-sm">Entries per page<select aria-label="Entries per page" className={selectClass} value={view.filters.pageSize} disabled={pending} onChange={(e) => run({ ...view.filters, pageSize: Number(e.target.value), page: 1 })}>{[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
            <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" disabled={pending || view.page <= 1} onClick={() => run({ ...view.filters, page: view.page - 1 })}>Previous</Button><span className="text-sm">Page {view.page} of {view.pages}</span><Button type="button" variant="outline" disabled={pending || view.page >= view.pages} onClick={() => run({ ...view.filters, page: view.page + 1 })}>Next</Button></div>
          </nav>
        </CardContent>
      </Card>
      <dialog ref={dialog} aria-labelledby="payment-details-title" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} className="m-auto max-h-[85vh] w-[min(95vw,48rem)] overflow-y-auto rounded-lg border bg-background p-4 sm:p-6 text-foreground shadow-xl backdrop:bg-black/50">
        {selected && <>
          <div className="flex items-start justify-between gap-4"><h2 id="payment-details-title" className="min-w-0 break-words text-xl font-semibold">{selected.sourceDetails?.clientName || "Commission entry details"}</h2><Button type="button" variant="outline" onClick={() => setSelected(null)}>Close</Button></div>
          <p className="mt-2 text-sm">{selected.carrier} · {selected.statementMonth} · {selected.commissionType} · {formatCents(selected.amountCents)}</p>
          <p className="mt-2 text-sm">Product type: {selected.product.label}{selected.product.reportedValue ? ` · As reported: ${selected.product.reportedValue}` : ` · ${selected.product.reason}`}</p>
          <p className="mt-2 text-sm text-muted-foreground">Credited to {personName(selected.userId)}{selected.writingUserId ? ` · Written by ${personName(selected.writingUserId)}` : ""}</p>
          <ClientCommissionHistory key={selected.id} transactionId={selected.id} />
          <h3 className="mt-6 text-lg font-semibold">Selected entry’s statement details</h3>
          {selected.sourceDetails ? <>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">{selected.sourceDetails.fields.map((field, index) => <div key={index} className="min-w-0"><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="break-words text-sm">{field.value || "Not provided"}</dd></div>)}</dl>
            <p className="mt-5 break-words text-xs text-muted-foreground">{selected.sourceDetails.statementFilename} · Source row {selected.sourceDetails.sourceRow}</p>
          </> : <p className="mt-4 text-sm">Source details unavailable. Member ID: {selected.memberId}; effective date: {selected.effectiveDate}. Your commission entry is unchanged.</p>}
          {isOwner && <Link href={`/statements/${selected.statementId}`} className="mt-4 inline-block text-sm underline">View source statement</Link>}
        </>}
      </dialog>
    </div>
  );
}