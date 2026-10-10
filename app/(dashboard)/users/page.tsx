import { Crown, UserCog, Users as UsersIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listDirectReports, listUsersForAgency } from "@/lib/repositories/userRepository";
import { listPlansForAgency } from "@/lib/repositories/commissionPlanRepository";
import { StatCard } from "@/components/dashboard/stat-card";
import { TeamGroup } from "@/components/users/team-group";
import { AddUserForm } from "@/components/settings/add-user-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/utils";
import type { AppUser } from "@/types/domain";

/**
 * Org-chart view: who reports to whom. Owners see the whole agency and
 * can create teammates and edit their role/manager assignment right
 * here; Managers see themselves + their direct reports, read-only (per
 * the MVP spec's role scoping). Agents have no use for this page - they
 * only ever see their own commissions - so they're redirected to
 * /dashboard.
 *
 * Team structure lives entirely in CommissionFlow, not the CRM, so this
 * page (plus the "Team" list in Settings) is the only way to populate it.
 */
export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "agent") redirect("/dashboard");

  if (user.role === "manager") {
    const [reports, plans] = await Promise.all([
      listDirectReports(user.id),
      listPlansForAgency(user.agencyId),
    ]);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader description="You and the agents who report to you." />
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Your role" value="Manager" icon={UserCog} />
          <StatCard label="Direct reports" value={String(reports.length)} icon={UsersIcon} />
        </div>
        <TeamGroup manager={user} agents={reports} plans={plans} />
      </div>
    );
  }

  const [allUsers, plans] = await Promise.all([
    listUsersForAgency(user.agencyId),
    listPlansForAgency(user.agencyId),
  ]);
  const managers = allUsers.filter((u) => u.role === "manager");
  const agents = allUsers.filter((u) => u.role === "agent");
  // Agents can report directly to the Owner too (small agencies often
  // skip the Manager tier), so the Owner counts as an eligible manager
  // in the "reports to" dropdowns - matches the convention already used
  // in Settings' team management.
  const managerOptions = [user, ...managers];
  const managerIds = new Set(managerOptions.map((m) => m.id));
  const unassignedAgents = agents.filter(
    (a) => !a.managerId || !managerIds.has(a.managerId)
  );
  const ownersDirectReports = agents.filter((a) => a.managerId === user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader description="Your agency's full reporting structure." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Owners" value="1" icon={Crown} />
        <StatCard label="Managers" value={String(managers.length)} icon={UserCog} />
        <StatCard label="Agents" value={String(agents.length)} icon={UsersIcon} />
      </div>

      <OwnerCard owner={user} />

      {ownersDirectReports.length > 0 && (
        <TeamGroup
          manager={user}
          agents={ownersDirectReports}
          editable
          allManagers={managerOptions}
          plans={plans}
        />
      )}

      {managers.map((manager) => (
        <TeamGroup
          key={manager.id}
          manager={manager}
          agents={agents.filter((a) => a.managerId === manager.id)}
          editable
          allManagers={managerOptions}
          plans={plans}
        />
      ))}

      {unassignedAgents.length > 0 && (
        <TeamGroup
          manager={null}
          agents={unassignedAgents}
          editable
          allManagers={managerOptions}
          plans={plans}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add teammate</CardTitle>
          <CardDescription>
            Create a Manager or Agent account. Team structure is managed here, never imported from a CRM.
          </CardDescription>
        </CardHeader>
        <AddUserForm managers={managerOptions} />
      </Card>
    </div>
  );
}

function PageHeader({ description }: { description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function OwnerCard({ owner }: { owner: AppUser }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <Avatar>
          <AvatarFallback>{initials(owner.firstName, owner.lastName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <CardTitle className="text-base">
            {owner.firstName} {owner.lastName}
          </CardTitle>
          <CardDescription>{owner.email}</CardDescription>
        </div>
        <Badge>Owner</Badge>
      </CardHeader>
      <CardContent className="border-t border-border pt-4 text-sm text-muted-foreground">
        Sees every commission across the agency and receives an override on every enrolled sale.
      </CardContent>
    </Card>
  );
}
