import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EditUserRow } from "@/components/users/edit-user-row";
import { initials } from "@/lib/utils";
import type { AppUser, CommissionPlan } from "@/types/domain";

/**
 * One manager + their direct-report agents, rendered as a single card.
 * Used to build the hierarchy view on the Users page: one `TeamGroup` per
 * manager (plus one with `manager={null}` for agents with no manager
 * assigned yet).
 */
export function TeamGroup({
  manager,
  agents,
  editable = false,
  allManagers = [],
  plans = [],
  principals = [],
  levels = [],
}: {
  manager: AppUser | null;
  agents: AppUser[];
  /** Owner-only: shows an Edit control on each agent row for reassigning role/manager/plan. */
  editable?: boolean;
  /** Every manager in the agency - used to populate "reports to" dropdowns. */
  allManagers?: AppUser[];
  /** Every commission plan in the agency - used to populate the "comp plan" dropdown. */
  plans?: CommissionPlan[];
  /** Teammates who can be a captive agent's principal. */
  principals?: { id: string; name: string }[];
  /** Active career levels for this agency. */
  levels?: string[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        {manager ? (
          <>
            <Avatar>
              <AvatarFallback>{initials(manager.firstName, manager.lastName)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">
                {manager.firstName} {manager.lastName}
              </CardTitle>
              <CardDescription>
                {manager.email} &middot; {manager.role === "owner" ? "Owner" : "Manager"}
              </CardDescription>
            </div>
          </>
        ) : (
          <div>
            <CardTitle className="text-base text-muted-foreground">Unassigned agents</CardTitle>
            <CardDescription>No manager assigned yet.</CardDescription>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1 border-t border-border pt-4">
        {agents.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No agents reporting here yet.</p>
        )}
        {agents.map((agent) => (
          <EditUserRow
            key={agent.id}
            user={agent}
            managers={allManagers.filter((m) => m.id !== agent.id)}
            plans={plans}
            principals={principals.filter((p) => p.id !== agent.id)}
            levels={levels}
            editable={editable}
          />
        ))}
      </CardContent>
    </Card>
  );
}
