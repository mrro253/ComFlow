import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleDollarSign, Copy, ExternalLink, FileText, UserX } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { formatCents } from "@/lib/carriers/money";
import type { StatementPreview } from "@/lib/carriers/buildStatementPreview";
import { splitWritingAgentName, summarizeUnmatchedAgents } from "@/lib/carriers/unmatchedWritingAgents";
import { principalOptions } from "@/lib/auth/principalOptions";
import { UnmatchedAgentRow } from "@/components/statements/unmatched-agents";
import {
  getStatement,
  listStatementsSupersededBy,
  listTransactionsForStatement,
} from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { listCareerLevels } from "@/lib/repositories/compensationSettingsRepository";
import { activeLevelNames } from "@/lib/carriers/careerLevels";
import { buildPreviewForStatement } from "@/lib/services/statementService";
import { ApproveImportForm } from "@/components/statements/approve-import-form";
import { STATEMENT_STATUS_BADGE } from "@/components/statements/status";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const MAX_ROWS_SHOWN = 300;

const DISPOSITION_LABEL = {
  new: { label: "New", variant: "default" },
  "already-imported": { label: "Already imported", variant: "secondary" },
  informational: { label: "Informational", variant: "outline" },
  review: { label: "Needs review", variant: "destructive" },
} as const;

export default async function StatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/dashboard");

  const { id } = await params;
  const statement = await getStatement(id);
  if (!statement) notFound();

  const status = STATEMENT_STATUS_BADGE[statement.status];
  const header = (
    <div className="flex flex-col gap-2">
      <Link href="/statements" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All statements
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {statement.originalFilename ?? "Portal statement"}
        </h1>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {statement.carrier} - {statement.source === "portal" ? "pulled from the carrier portal" : "manual upload"} -
          received {formatDate(statement.createdAt)}
        </p>
        {statement.storagePath && (
          <a
            href={`/api/statements/${statement.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View PDF
          </a>
        )}
      </div>
    </div>
  );

  if (statement.status === "imported" || statement.status === "superseded") {
    const [rows, team, replaced] = await Promise.all([
      listTransactionsForStatement(statement.id),
      listUsersForAgency(user.agencyId),
      listStatementsSupersededBy(statement.id),
    ]);
    const nameById = new Map(team.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return (
      <div className="flex flex-col gap-6">
        {header}
        {statement.status === "superseded" && (
          <p className="rounded-md bg-secondary p-3 text-sm">
            This statement was replaced by a corrected version
            {statement.supersededBy && (
              <>
                {" "}
                (<Link href={`/statements/${statement.supersededBy}`} className="font-medium underline">view corrected statement</Link>)
              </>
            )}
            . It is kept for reference and is not included in the dashboard or reports.
          </p>
        )}
        {replaced.length > 0 && (
          <p className="rounded-md bg-secondary p-3 text-sm">
            This corrected statement replaced{" "}
            {replaced.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ", "}
                <Link href={`/statements/${r.id}`} className="font-medium underline">
                  {r.originalFilename ?? "an earlier statement"}
                </Link>
              </span>
            ))}
            . Only this version is reported.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Statement month" value={statement.statementMonth ?? "—"} icon={FileText} />
          <StatCard label="Payments imported" value={String(statement.transactionCount ?? 0)} icon={Copy} />
          <StatCard
            label="Statement total"
            value={formatCents(statement.statementTotalCents ?? 0)}
            icon={CircleDollarSign}
            hint={
              statement.carriedBalanceCents
                ? `Includes ${formatCents(statement.carriedBalanceCents)} carried balance`
                : undefined
            }
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Imported payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective</TableHead>
                  <TableHead>Member ID</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.effectiveDate}</TableCell>
                    <TableCell className="text-muted-foreground">{row.memberId}</TableCell>
                    <TableCell>{row.commissionType}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.userId ? (nameById.get(row.userId) ?? "Team member") : "Unassigned"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCents(row.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  let preview: StatementPreview | null = null;
  let errorMessage: string | null = null;
  try {
    preview = await buildPreviewForStatement(user, statement);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "The statement could not be read.";
  }

  if (!preview) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>This statement could not be processed</CardTitle>
            <CardDescription>
              Nothing was imported. Statements are rejected rather than partially read when the
              numbers do not add up.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-destructive">{errorMessage}</CardContent>
        </Card>
      </div>
    );
  }

  const [team, careerLevels] = await Promise.all([
    listUsersForAgency(user.agencyId),
    listCareerLevels(user.agencyId),
  ]);
  const nameById = new Map(team.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const levels = activeLevelNames(careerLevels);
  const shown = preview.rows.slice(0, MAX_ROWS_SHOWN);

  const unmatched = summarizeUnmatchedAgents(preview.rows).map((agent) => ({
    name: agent.name,
    code: agent.code,
    writingAgentId: agent.writingAgentId,
    rowCount: agent.rowCount,
    amount: formatCents(agent.totalCents),
    ...splitWritingAgentName(agent.name),
  }));
  const teamOptions = team
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }));
  const { correction } = preview;

  return (
    <div className="flex flex-col gap-6">
      {header}

      {correction.kind === "duplicate" && (
        <p className="rounded-md bg-secondary p-3 text-sm">
          This has the same file name and identical payments as{" "}
          <Link href={`/statements/${correction.of.id}`} className="font-medium underline">
            {correction.of.filename ?? "an earlier statement"}
          </Link>
          , which is already imported. It is a duplicate, so nothing here will be imported again.
        </p>
      )}
      {correction.kind === "supersede" && (
        <p className="rounded-md bg-secondary p-3 text-sm">
          This has the same file name as{" "}
          {correction.replaces.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link href={`/statements/${r.id}`} className="font-medium underline">
                {r.filename ?? "an earlier statement"}
              </Link>
            </span>
          ))}{" "}
          but different payments, so it is treated as the corrected version. Approving will import this
          statement and move the earlier one to Superseded (kept for reference, removed from reports).
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Statement month" value={preview.statement.statementMonth} icon={FileText} />
        <StatCard
          label="New payments"
          value={String(preview.counts.new)}
          icon={Copy}
          hint={`${preview.counts["already-imported"]} already imported`}
        />
        <StatCard
          label="New amount"
          value={formatCents(preview.newTotalCents)}
          icon={CircleDollarSign}
          hint={`Statement total ${formatCents(preview.statement.statementTotalCents)}`}
        />
        <StatCard
          label="Unassigned"
          value={String(preview.unassignedNewCount)}
          icon={UserX}
          hint="Can be assigned after import"
        />
      </div>

      {unmatched.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Writing agents to match</CardTitle>
            <CardDescription>
              These names are not matched to anyone yet, so their payments would stay unassigned. Pick
              the teammate they belong to, or create a new agent. The match is remembered for future
              statements.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {unmatched.map((agent) => (
              <UnmatchedAgentRow
                key={agent.name}
                statementId={statement.id}
                agent={agent}
                team={teamOptions}
                principals={principalOptions(team)}
                levels={levels}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Review and approve</CardTitle>
          <CardDescription>
            This is a preview. Importing records what the carrier paid; it never pays anyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {preview.blockers.map((blocker) => (
            <p key={blocker} className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {blocker}
            </p>
          ))}
          <ApproveImportForm
            statementId={statement.id}
            newCount={preview.counts.new}
            disabled={!preview.canImport || preview.counts.new === 0}
          />
          {preview.counts.new === 0 && preview.canImport && (
            <p className="text-sm text-muted-foreground">
              Every payment on this statement is already in the system.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments on this statement</CardTitle>
          {preview.rows.length > MAX_ROWS_SHOWN && (
            <CardDescription>
              Showing the first {MAX_ROWS_SHOWN} of {preview.rows.length}. All will be imported.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Effective</TableHead>
                <TableHead>Member ID</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Writing agent</TableHead>
                <TableHead>Will be assigned to</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => {
                const tx = row.transaction;
                const disposition = DISPOSITION_LABEL[row.disposition];
                return (
                  <TableRow key={tx.transactionKey}>
                    <TableCell>{tx.effectiveDateIso}</TableCell>
                    <TableCell className="text-muted-foreground">{tx.memberId}</TableCell>
                    <TableCell>{tx.type}</TableCell>
                    <TableCell className="text-muted-foreground">{tx.writingAgent ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.classification.status === "assigned"
                        ? (nameById.get(row.classification.userId) ?? "Team member")
                        : "Unassigned"}
                    </TableCell>
                    <TableCell title={row.reason}>
                      <Badge variant={disposition.variant}>{disposition.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCents(tx.amountCents)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
