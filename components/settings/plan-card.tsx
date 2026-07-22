"use client";

import { Fragment, useActionState, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createCommissionPlanBonus,
  deleteCommissionPlanBonus,
  setCommissionPlanActive,
  setCommissionPlanDefault,
  updateCommissionPlanRates,
} from "@/app/(dashboard)/settings/planActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import type { CommissionPlanWithDetails } from "@/types/domain";

const ROLE_LABEL: Record<"agent" | "manager" | "owner", string> = {
  agent: "Agent",
  manager: "Manager override",
  owner: "Owner override",
};

const PAYABLE_ROLES = ["agent", "manager", "owner"] as const;

function rateFor(
  plan: CommissionPlanWithDetails,
  role: "agent" | "manager" | "owner",
  businessType: "new" | "renewal"
): number {
  return (
    plan.rates.find((r) => r.role === role && r.businessType === businessType)?.percent ?? 0
  );
}

export function PlanCard({
  plan,
  editable,
}: {
  plan: CommissionPlanWithDetails;
  editable: boolean;
}) {
  const [editingRates, setEditingRates] = useState(false);
  const [ratesState, ratesAction, ratesPending] = useActionState(
    updateCommissionPlanRates,
    undefined
  );
  const [, defaultAction, defaultPending] = useActionState(
    setCommissionPlanDefault,
    undefined
  );
  const [, activeAction, activePending] = useActionState(
    setCommissionPlanActive,
    undefined
  );

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{plan.name}</p>
          {plan.isDefault && <Badge>Default</Badge>}
          {!plan.active && <Badge variant="outline">Archived</Badge>}
        </div>

        {editable && (
          <div className="flex items-center gap-2">
            {!plan.isDefault && plan.active && (
              <form action={defaultAction}>
                <input type="hidden" name="planId" value={plan.id} />
                <Button type="submit" variant="outline" size="sm" disabled={defaultPending}>
                  Set as default
                </Button>
              </form>
            )}
            <form action={activeAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="active" value={(!plan.active).toString()} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={activePending || plan.isDefault}
                title={plan.isDefault ? "The default plan can't be archived" : undefined}
              >
                {plan.active ? "Archive" : "Reactivate"}
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rates
          </p>
          {editable && !editingRates && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setEditingRates(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>

        {editingRates ? (
          <form action={ratesAction} className="flex flex-col gap-3">
            <input type="hidden" name="planId" value={plan.id} />
            <div className="grid grid-cols-[1fr_repeat(2,minmax(0,6rem))] items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Role</span>
              <span className="text-xs font-medium text-muted-foreground">New %</span>
              <span className="text-xs font-medium text-muted-foreground">Renewal %</span>
              {PAYABLE_ROLES.map((role) => (
                <Fragment key={role}>
                  <Label htmlFor={`${plan.id}-${role}-new`}>{ROLE_LABEL[role]}</Label>
                  <Input
                    id={`${plan.id}-${role}-new`}
                    name={`${role}_new`}
                    type="number"
                    step="0.1"
                    min={0}
                    defaultValue={rateFor(plan, role, "new")}
                  />
                  <Input
                    id={`${plan.id}-${role}-renewal`}
                    name={`${role}_renewal`}
                    type="number"
                    step="0.1"
                    min={0}
                    defaultValue={rateFor(plan, role, "renewal")}
                  />
                </Fragment>
              ))}
            </div>
            {ratesState?.error && (
              <p className="text-sm text-destructive">{ratesState.error}</p>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={ratesPending}>
                {ratesPending ? "Saving..." : "Save rates"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingRates(false)}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-[1fr_repeat(2,minmax(0,6rem))] gap-x-4 gap-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Role</span>
            <span className="text-xs font-medium text-muted-foreground">New</span>
            <span className="text-xs font-medium text-muted-foreground">Renewal</span>
            {PAYABLE_ROLES.map((role) => (
              <Fragment key={role}>
                <span className="text-muted-foreground">{ROLE_LABEL[role]}</span>
                <span>{rateFor(plan, role, "new")}%</span>
                <span>{rateFor(plan, role, "renewal")}%</span>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <PlanBonuses plan={plan} editable={editable} />
      </div>
    </div>
  );
}

function PlanBonuses({
  plan,
  editable,
}: {
  plan: CommissionPlanWithDetails;
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [createState, createAction, createPending] = useActionState(
    createCommissionPlanBonus,
    undefined
  );
  const [deleteState, deleteAction] = useActionState(deleteCommissionPlanBonus, undefined);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Bonuses
        </p>
        {editable && !adding && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add bonus
          </Button>
        )}
      </div>

      {plan.bonuses.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          No bonus rules yet. Add one to reward hitting a monthly enrollment target.
        </p>
      )}

      {plan.bonuses.length > 0 && (
        <ul className="flex flex-col gap-2">
          {plan.bonuses.map((bonus) => (
            <li
              key={bonus.id}
              className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{ROLE_LABEL[bonus.role as "agent" | "manager" | "owner"]}</span>{" "}
                earns {formatCurrency(bonus.bonusAmount)} at {bonus.thresholdCount} enrollments/month
              </span>
              {editable && (
                <form action={deleteAction}>
                  <input type="hidden" name="bonusId" value={bonus.id} />
                  <Button type="submit" variant="ghost" size="sm" className="h-7 px-2">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleteState?.error && <p className="text-sm text-destructive">{deleteState.error}</p>}

      {adding && (
        <form
          action={createAction}
          className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 p-3"
        >
          <input type="hidden" name="planId" value={plan.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${plan.id}-bonus-role`}>Role</Label>
            <select
              id={`${plan.id}-bonus-role`}
              name="role"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              defaultValue="agent"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${plan.id}-bonus-threshold`}>Enrollments/month</Label>
            <Input
              id={`${plan.id}-bonus-threshold`}
              name="thresholdCount"
              type="number"
              min={1}
              step={1}
              defaultValue={10}
              className="w-32"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${plan.id}-bonus-amount`}>Bonus $</Label>
            <Input
              id={`${plan.id}-bonus-amount`}
              name="bonusAmount"
              type="number"
              min={0}
              step="1"
              defaultValue={500}
              className="w-32"
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={createPending}>
            {createPending ? "Adding..." : "Add"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          {createState?.error && (
            <p className="w-full text-sm text-destructive">{createState.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
