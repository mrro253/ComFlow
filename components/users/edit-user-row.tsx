"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";
import { editUser } from "@/app/(dashboard)/users/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AgentTypeFields } from "@/components/users/agent-type-fields";
import { initials } from "@/lib/utils";
import type { AppUser, CommissionPlan, Role } from "@/types/domain";

const ROLE_BADGE: Record<Role, "default" | "secondary" | "outline"> = {
  owner: "default",
  manager: "secondary",
  agent: "outline",
};

/**
 * A single teammate row on the Users page that toggles into an inline
 * edit form (name, role, manager reassignment, comp plan) for Owners.
 * Read-only for everyone else - `editable` gates whether the Edit button
 * renders at all, so this component is safe to reuse in both editable
 * and view-only contexts.
 */
export function EditUserRow({
  user,
  managers,
  plans,
  principals = [],
  editable,
}: {
  user: AppUser;
  /** Candidate managers for the "reports to" dropdown - never includes `user` itself. */
  managers: AppUser[];
  /** Available (active) commission plans for the "comp plan" dropdown. */
  plans: CommissionPlan[];
  /** Teammates who can be this agent's principal if they are captive (never includes `user`). */
  principals?: { id: string; name: string }[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(editUser, undefined);
  const [role, setRole] = useState<"manager" | "agent">(
    user.role === "manager" ? "manager" : "agent"
  );

  const assignedPlan = plans.find((p) => p.id === user.commissionPlanId);
  const defaultPlan = plans.find((p) => p.isDefault);
  const planLabel = assignedPlan
    ? assignedPlan.name
    : defaultPlan
      ? `${defaultPlan.name} (default)`
      : "No plan configured";

  if (!editable || !editing) {
    return (
      <div className="flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10px]">
              {initials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium leading-tight">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.agentType && (
            <span className="text-xs text-muted-foreground">
              {user.agentType === "career"
                ? (user.careerLevel ?? "Career")
                : user.agentType === "captive"
                  ? "Captive"
                  : "Independent"}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{planLabel}</span>
          <Badge variant={ROLE_BADGE[user.role]}>{user.role}</Badge>
          {editable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3"
    >
      <input type="hidden" name="userId" value={user.id} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`firstName-${user.id}`}>First name</Label>
          <Input id={`firstName-${user.id}`} name="firstName" defaultValue={user.firstName} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`lastName-${user.id}`}>Last name</Label>
          <Input id={`lastName-${user.id}`} name="lastName" defaultValue={user.lastName} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`role-${user.id}`}>Role</Label>
          <select
            id={`role-${user.id}`}
            name="role"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as "manager" | "agent")}
          >
            <option value="agent">Agent</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`managerId-${user.id}`}>Reports to</Label>
          <select
            id={`managerId-${user.id}`}
            name="managerId"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            defaultValue={user.managerId ?? ""}
            disabled={role === "manager"}
          >
            <option value="">No manager</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <AgentTypeFields
        idPrefix={`edit-${user.id}`}
        defaultType={user.agentType}
        defaultLevel={user.careerLevel}
        isManager={role === "manager"}
        principals={principals}
        defaultPrincipalId={user.principalId}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`payeeId-${user.id}`}>Carrier payee ID (optional)</Label>
        <Input
          id={`payeeId-${user.id}`}
          name="payeeId"
          defaultValue={user.payeeId ?? ""}
          placeholder="e.g. W1234"
        />
        <p className="text-xs text-muted-foreground">
          Used on carrier statements to tell apart teammates who share a name.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`commissionPlanId-${user.id}`}>Comp plan</Label>
        <select
          id={`commissionPlanId-${user.id}`}
          name="commissionPlanId"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          defaultValue={user.commissionPlanId ?? ""}
        >
          <option value="">{defaultPlan ? `${defaultPlan.name} (default)` : "Agency default"}</option>
          {plans
            .filter((p) => p.active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? " (default)" : ""}
              </option>
            ))}
        </select>
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
