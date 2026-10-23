import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { canManageCarrierLogin } from "@/lib/auth/carrierAccess";
import Link from "next/link";
import { connectionCarriers } from "@/lib/carriers/connectionCarriers";
import { listVisibleConnections } from "@/lib/repositories/carrierConnectionRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { ConnectCarrierForm } from "@/components/carriers/connect-carrier-form";
import { ConnectionActions } from "@/components/carriers/connection-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const STATUS = {
  pending: { label: "Saved - not synced yet", variant: "secondary" },
  active: { label: "Connected", variant: "success" },
  needs_attention: { label: "Needs attention", variant: "destructive" },
  disabled: { label: "Disconnected", variant: "outline" },
} as const;

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Carrier connections</h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Connect carrier portals for commission statements and SunFire for enrollment details."
            : "Connect your carrier portal login so your statements are pulled automatically. Your carrier pays you directly; this only lets us show what you were paid."}
        </p>
      </div>

      {connectionCarriers(isOwner).map((carrier) => {
        const connection = mine.find((c) => c.carrier === carrier);
        const connected = connection && connection.status !== "disabled";
        const status = connection?.status === "needs_attention" && connection.lastError?.startsWith("Sync running.")
          ? { label: "Sync in progress", variant: "secondary" as const }
          : connection ? STATUS[connection.status] : null;
        return (
          <Card key={carrier}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>{carrier}</CardTitle>
                {carrier === "SunFire" && <p className="mt-1 text-sm font-medium">Enrollment source</p>}
                <CardDescription>
                  {connection?.lastSuccessfulSyncAt
                    ? `Last successful sync ${formatDate(connection.lastSuccessfulSyncAt)}`
                    : "Never synced"}
                </CardDescription>
              </div>
              {status && <Badge variant={status.variant}>{status.label}</Badge>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
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
              {carrier === "UnitedHealthcare" && <p className="text-sm text-muted-foreground">Sync downloads available PDF and text reports. Keep the local worker running; complete verification in its browser and open Commissions &gt; Statements and More. New PDFs appear in <Link className="underline" href="/statements">Statements for review</Link>. Existing imported entries stay unchanged.</p>}
              {carrier === "Devoted Health" && <p className="text-sm text-muted-foreground">Sync saves PDF and spreadsheet pairs for review. Keep the local worker running; complete any Devoted verification in its browser window. <Link className="underline" href="/statements/devoted">Review downloaded Devoted statements</Link></p>}
              {connection?.lastError && connection.status === "needs_attention" && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{connection.lastError}</p>
              )}
              <details open={!connected || Boolean(connection?.status === "needs_attention" && !connection.syncRequestedAt && !connection.lastError?.startsWith("Sync running."))} className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{connected ? "Connection settings" : "Connect this account"}</summary><div className="mt-4 space-y-4">{connected && connection && (
                <div className={carrier === "SunFire" ? "border-t pt-4" : undefined}>
                  {carrier === "SunFire" && <p className="mb-2 text-sm font-medium">Update enrollment data</p>}
                  <ConnectionActions connectionId={connection.id} syncPending={connection.syncRequestedAt !== null} enrollmentSource={carrier === "SunFire"} />
                </div>
              )}
              <div className={connected ? "border-t border-border pt-4" : ""}>
                <ConnectCarrierForm carrier={carrier} replacing={Boolean(connected)} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Your login is encrypted before it is stored and is only used by the {carrier === "SunFire" ? "enrollment collector" : "statement downloader"}.
                  It is never shown again.
                </p>
              </div>
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
                      <Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
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
