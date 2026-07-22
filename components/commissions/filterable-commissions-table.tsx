"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TransactionsTable, type TransactionRow } from "@/components/dashboard/transactions-table";
import type { BusinessType, CommissionRole } from "@/types/domain";

type RoleFilter = CommissionRole | "all";
type BusinessTypeFilter = BusinessType | "all";
type DateFilter = "all" | "30d" | "90d" | "6m";

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "agent", label: "Agent commission" },
  { value: "manager", label: "Manager override" },
  { value: "owner", label: "Owner override" },
  { value: "bonus", label: "Bonus" },
];

const BUSINESS_TYPE_OPTIONS: { value: BusinessTypeFilter; label: string }[] = [
  { value: "all", label: "New business & renewals" },
  { value: "new", label: "New business" },
  { value: "renewal", label: "Renewals" },
];

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" },
];

const DATE_FILTER_DAYS: Record<Exclude<DateFilter, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "6m": 182,
};

/**
 * Client-side filter bar + table for the Commissions page. Filtering
 * happens in-memory over the already-fetched (RLS-scoped) transaction
 * list rather than round-tripping to the server - the MVP page size
 * (up to 200 rows) makes that unnecessary complexity for now.
 */
export function FilterableCommissionsTable({
  transactions,
  showRecipient,
}: {
  transactions: TransactionRow[];
  showRecipient: boolean;
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [businessType, setBusinessType] = useState<BusinessTypeFilter>("all");
  const [recipient, setRecipient] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateFilter>("all");

  const recipients = useMemo(
    () => Array.from(new Set(transactions.map((tx) => tx.recipientName))).sort(),
    [transactions]
  );

  const filtered = useMemo(() => {
    const cutoff =
      dateRange === "all" ? null : Date.now() - DATE_FILTER_DAYS[dateRange] * 24 * 60 * 60 * 1000;
    const needle = search.trim().toLowerCase();

    return transactions.filter((tx) => {
      if (role !== "all" && tx.role !== role) return false;
      if (businessType !== "all" && tx.businessType !== businessType) return false;
      if (recipient !== "all" && tx.recipientName !== recipient) return false;
      if (cutoff !== null && new Date(tx.createdAt).getTime() < cutoff) return false;
      if (needle) {
        const haystack = `${tx.opportunityId} ${tx.recipientName}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [transactions, role, businessType, recipient, dateRange, search]);

  const hasActiveFilters =
    search !== "" ||
    role !== "all" ||
    businessType !== "all" ||
    recipient !== "all" ||
    dateRange !== "all";

  function clearFilters() {
    setSearch("");
    setRole("all");
    setBusinessType("all");
    setRecipient("all");
    setDateRange("all");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <Label htmlFor="commission-search">Search</Label>
            <Input
              id="commission-search"
              placeholder="Opportunity ID or agent name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commission-type">Type</Label>
            <select
              id="commission-type"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleFilter)}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commission-business-type">Business</Label>
            <select
              id="commission-business-type"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value as BusinessTypeFilter)}
            >
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {showRecipient && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commission-agent">Agent</Label>
              <select
                id="commission-agent"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              >
                <option value="all">All agents</option>
                {recipients.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commission-date">Date range</Label>
            <select
              id="commission-date"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateFilter)}
            >
              {DATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      <TransactionsTable
        transactions={filtered}
        showRecipient={showRecipient}
        title="All commissions"
        description={`Showing ${filtered.length} of ${transactions.length} commission record${
          transactions.length === 1 ? "" : "s"
        }`}
      />
    </div>
  );
}
