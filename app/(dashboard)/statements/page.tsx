import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listSupportedCarriers } from "@/lib/carriers";
import { formatCents } from "@/lib/carriers/money";
import { listStatements } from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { STATEMENT_STATUS_BADGE } from "@/components/statements/status";
import { UploadStatementForm } from "@/components/statements/upload-statement-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { canManageStatements } from "@/lib/auth/statementAccess";

export default async function StatementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageStatements(user)) redirect("/dashboard");

  const [statements, team] = await Promise.all([listStatements(), listUsersForAgency(user.agencyId)]);
  const independents =
    user.role === "owner"
      ? team
          .filter((u) => u.agentType === "independent" && u.role !== "owner" && u.active)
          .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))
      : [];
  const nameById = new Map(team.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
        <p className="text-sm text-muted-foreground">
          Carrier commission statements are the source of truth for what was actually paid.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a statement</CardTitle>
          <CardDescription>
            Upload a carrier PDF manually. Statements pulled from carrier portals appear here too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadStatementForm
            carriers={listSupportedCarriers()}
            independents={independents}
            ownBookOnly={user.role !== "owner"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>For</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Payments</TableHead>
                <TableHead className="text-right">Statement total</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    No statements yet. Upload a PDF above to get started.
                  </TableCell>
                </TableRow>
              )}
              {statements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link href={`/statements/${s.id}`} className="hover:underline">
                      {s.originalFilename ?? "Portal statement"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.carrier}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.userId ? (nameById.get(s.userId) ?? "Agent") : "Agency"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.statementMonth ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.source === "portal" ? "Carrier portal" : "Manual upload"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATEMENT_STATUS_BADGE[s.status].variant}>{STATEMENT_STATUS_BADGE[s.status].label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{s.transactionCount ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {s.statementTotalCents === null ? "—" : formatCents(s.statementTotalCents)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
