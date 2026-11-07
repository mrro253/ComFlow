import { connectionPresentation, connectionSyncBusy } from "@/lib/reporting/connectionStatus";
import { listStatementCoverage } from "@/lib/repositories/statementRepository";
import { listDevotedInbox } from "@/lib/repositories/devotedInboxRepository";
import { SyncProgressRefresh } from "@/components/carriers/sync-progress-refresh";
import { loadSyncResult } from "@/lib/repositories/syncResultRepository";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { canManageCarrierLogin } from "@/lib/auth/carrierAccess";
import Link from "next/link";
import { connectionCarriers } from "@/lib/carriers/connectionCarriers";
import { listVisibleConnections } from "@/lib/repositories/carrierConnectionRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { ConnectCarrierForm } from "@/components/carriers/connect-carrier-form";
import { ConnectionActions, RemoveCarrierLogin } from "@/components/carriers/connection-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export default async function CarriersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "manager") redirect("/dashboard");

  if (!canManageCarrierLogin(user)) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Carrier &amp; enrollment connections</h1>
        <Card>
          <CardHeader>
            <CardTitle>Your agency handles this for you</CardTitle>
            <CardDescription>
              As a Career agent your carrier commissions are paid to your agency, which pulls the
              statements. Your payments appear under Payments once they are imported.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const [connections, team] = await Promise.all([listVisibleConnections(), listUsersForAgency(user.agencyId)]);
  const nameById = new Map(team.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const mine = connections.filter((c) => c.userId === user.id);
  const others = connections.filter((c) => c.userId !== user.id);
  const isOwner = user.role === "owner";
  const [statements, devotedInbox] = await Promise.all([
    listStatementCoverage(),
    isOwner && process.env.DEVOTED_REVIEW_ENABLED === "true" ? listDevotedInbox(user) : [],
  ]);
  const summaries = new Map(await Promise.all(mine.filter(c => c.carrier !== "SunFire").map(async c => [c.id, await loadSyncResult(c.id, user.agencyId)] as const)));

  return (
    <div className="flex flex-col gap-6">
      <SyncProgressRefresh active={mine.some(connectionSyncBusy)} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Carrier connections</h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Connect carrier portals for commission statements and SunFire for enrollment details."
            : "Save your carrier login, then choose Sync now whenever you want to retrieve statements."}
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <ol className="grid gap-3 sm:grid-cols-3">
          <li><strong>1. Connect</strong><p className="mt-1 text-muted-foreground">Save each login once.</p></li>
          <li><strong>2. Sync</strong><p className="mt-1 text-muted-foreground">Choose Sync now. Only a security check needs a window; progress updates here.</p></li>
          <li><strong>3. View results</strong><p className="mt-1 text-muted-foreground">Downloaded statements are saved for review. Imported commissions appear on the dashboard.</p></li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">For this test environment, keep the downloader running on this computer. Collection starts only when you request it.</p>
      </div>

      {connectionCarriers(isOwner).map((carrier) => {
        const connection = mine.find((c) => c.carrier === carrier);
        const connected = connection && connection.status !== "disabled";
        const status = connection ? connectionPresentation(connection) : null;
        const summary = connection ? summaries.get(connection.id) : null;
        const busy = connection ? connectionSyncBusy(connection) : false;
        const imported = statements.filter(s => s.carrier === carrier && s.status === "imported").length;
        const awaiting = statements.filter(s => s.carrier === carrier && !["imported", "superseded"].includes(s.status)).length + (carrier === "Devoted Health" ? devotedInbox.length : 0);
        const reviewHref = carrier === "Devoted Health" ? "/statements/devoted" : "/statements";
        return (
          <Card key={carrier}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>{carrier}</CardTitle>
                {carrier === "SunFire" && <p className="mt-1 text-sm font-medium">Enrollment source</p>}
                <CardDescription>
                  {connection?.lastSuccessfulSyncAt
                    ? `Last successful sync ${formatDate(connection.lastSuccessfulSyncAt)}`
                    : connected ? connection.lastSyncAt ? "No successful sync yet" : "Login saved · ready for your first sync" : "Connect your login to get started"}
                </CardDescription>
              </div>
              {status && <Badge variant={status.variant}>{status.label}</Badge>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {status?.notice && <p role="status" aria-live="polite" className={status.variant === "destructive" ? "rounded-md bg-destructive/10 p-3 text-sm text-destructive" : "rounded-md bg-muted/40 p-3 text-sm"}>{status.notice}</p>}
              {connected && connection && <ConnectionActions connectionId={connection.id} syncPending={connection.syncRequestedAt !== null} syncBusy={busy} enrollmentSource={carrier === "SunFire"} />}
              {connected && carrier !== "SunFire" && <div className="rounded-md border p-4 text-sm">
                <p className="font-medium">{busy ? "Previous download result" : "Last download result"}{summary ? ` · ${formatDate(summary.finishedAt)}` : ""}</p>
                <div className="mt-2 space-y-2">
                  {summary ? <>
                    <p>{summary.outcome === "completed" ? "Download check finished" : "Sync stopped before a complete result"}</p>
                    {summary.counts ? <ul className="grid grid-cols-2 gap-2"><li>{summary.counts.found} statements found</li><li>{summary.counts.downloaded} downloads saved</li><li>{summary.counts.skipped} previously saved</li><li>{summary.counts.failed} downloads failed</li></ul> : <p>Complete counts are unavailable. Saved files remain available for review.</p>}
                  </> : <p className="text-muted-foreground">No completed download result yet.</p>}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
                  <p><strong>{imported}</strong> imported statements on your dashboard</p>
                  <Button asChild variant="outline" size="sm"><Link href={awaiting ? reviewHref : "/statements"}>{awaiting ? `Review saved statements (${awaiting})` : "View statements"}</Link></Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Downloads and imports are separate. These statement counts are not bank deposits.</p>
              </div>}
              {carrier === "SunFire" && (
                <>
                  <p className="text-sm text-muted-foreground">Collect enrollment details from SunFire, then compare them with your imported commissions. Nothing is linked automatically.</p>
                  {connection && (
                    <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 lg:grid-cols-2">
                      <div className="flex flex-col items-start gap-2">
                        <Button asChild variant="outline" className="h-auto min-h-10 whitespace-normal text-left">
                          <Link href="/carriers/sunfire">View enrollments</Link>
                        </Button>
                        <p className="text-sm text-muted-foreground">See the clients, plans and proposed effective dates collected from SunFire.</p>
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <Button asChild className="h-auto min-h-10 whitespace-normal text-left">
                          <Link href="/carriers/sunfire/matches">Review commission matches</Link>
                        </Button>
                        <p className="text-sm text-muted-foreground">Compare possible matches and check chargebacks before linking anything.</p>
                      </div>
                    </div>
                  )}
                </>
              )}
              <details open={!connected} className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{connected ? "Login settings" : "Connect this account"}</summary><div className="mt-4 space-y-4">
              <div className={connected ? "border-t border-border pt-4" : ""}>
                <ConnectCarrierForm carrier={carrier} replacing={Boolean(connected)} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Your login is encrypted before it is stored and is only used by the {carrier === "SunFire" ? "enrollment collector" : "statement downloader"}.
                  It is never shown again.
                </p>
              </div>
              {connected && connection && <RemoveCarrierLogin connectionId={connection.id} busy={busy} />}
              </div></details>
            </CardContent>
          </Card>
        );
      })}

      {isOwner && others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Team connections</CardTitle>
            <CardDescription>Independent agents who connected their own carrier logins.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last successful sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {others.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{nameById.get(c.userId) ?? "Agent"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.carrier}</TableCell>
                    <TableCell>
                      <Badge variant={connectionPresentation(c).variant}>{connectionPresentation(c).label}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {c.lastSuccessfulSyncAt ? formatDate(c.lastSuccessfulSyncAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
