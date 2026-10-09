import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { canManageCarrierLogin } from "@/lib/auth/carrierAccess";
import { listSupportedCarriers } from "@/lib/carriers";
import { listVisibleConnections } from "@/lib/repositories/carrierConnectionRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { ConnectCarrierForm } from "@/components/carriers/connect-carrier-form";
import { ConnectionActions } from "@/components/carriers/connection-actions";
import { Badge } from "@/components/ui/badge";
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
        <h1 className="text-2xl font-semibold tracking-tight">Carrier connections</h1>
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
            ? "Connect your agency's carrier portal login so statements are pulled automatically."
            : "Connect your carrier portal login so your statements are pulled automatically. Your carrier pays you directly; this only lets us show what you were paid."}
        </p>
      </div>

      {listSupportedCarriers().map((carrier) => {
        const connection = mine.find((c) => c.carrier === carrier);
        const connected = connection && connection.status !== "disabled";
        const status = connection ? STATUS[connection.status] : null;
        return (
          <Card key={carrier}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>{carrier}</CardTitle>
                <CardDescription>
                  {connection?.lastSuccessfulSyncAt
                    ? `Last successful sync ${formatDate(connection.lastSuccessfulSyncAt)}`
                    : "Never synced"}
                </CardDescription>
              </div>
              {status && <Badge variant={status.variant}>{status.label}</Badge>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {connection?.lastError && connection.status === "needs_attention" && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{connection.lastError}</p>
              )}
              {connected && connection && (
                <ConnectionActions connectionId={connection.id} syncPending={connection.syncRequestedAt !== null} />
              )}
              <div className={connected ? "border-t border-border pt-4" : ""}>
                <ConnectCarrierForm carrier={carrier} replacing={Boolean(connected)} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Your login is encrypted before it is stored and is only used by the statement downloader.
                  It is never shown again.
                </p>
              </div>
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
