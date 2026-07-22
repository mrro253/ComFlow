"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { createCommissionPlan } from "@/app/(dashboard)/settings/planActions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlanCard } from "@/components/settings/plan-card";
import type { CommissionPlanWithDetails } from "@/types/domain";

export function CompPlansSection({
  plans,
  editable,
}: {
  plans: CommissionPlanWithDetails[];
  editable: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [state, formAction, isPending] = useActionState(createCommissionPlan, undefined);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Commission plans</CardTitle>
          <CardDescription>
            Named plans with independent New Business / Renewal rates per role, plus
            monthly enrollment bonuses. Every agent and manager uses their assigned
            plan (or the agency default if unassigned) whenever an opportunity is
            enrolled.
          </CardDescription>
        </div>
        {editable && !creating && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New plan
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {creating && (
          <form
            action={formAction}
            className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 p-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-plan-name">Plan name</Label>
              <Input
                id="new-plan-name"
                name="name"
                placeholder="e.g. Senior Agent Plan"
                required
                className="w-64"
              />
            </div>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Creating..." : "Create plan"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            {state?.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
          </form>
        )}

        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No commission plans yet.</p>
        ) : (
          plans.map((plan) => <PlanCard key={plan.id} plan={plan} editable={editable} />)
        )}
      </CardContent>
    </Card>
  );
}
