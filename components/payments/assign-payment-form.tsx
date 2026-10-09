"use client";

import { useActionState } from "react";
import { assignPayment } from "@/app/(dashboard)/payments/actions";
import { Button } from "@/components/ui/button";

export function AssignPaymentForm({
  transactionId,
  team,
  canRemember,
}: {
  transactionId: string;
  team: { id: string; name: string }[];
  /** Only offer "remember" when the statement printed a writing-agent name to remember. */
  canRemember: boolean;
}) {
  const [state, formAction, isPending] = useActionState(assignPayment, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="transactionId" value={transactionId} />
      <select
        name="userId"
        required
        defaultValue=""
        className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
      >
        <option value="" disabled>
          Assign to...
        </option>
        {team.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      {canRemember && (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" name="rememberAlias" /> remember name
        </label>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "..." : "Assign"}
      </Button>
      {state?.error && <span className="w-full text-right text-xs text-destructive">{state.error}</span>}
      {state?.info && <span className="w-full text-right text-xs text-success">{state.info}</span>}
    </form>
  );
}
