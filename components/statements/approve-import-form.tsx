"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { approveStatementImport } from "@/app/(dashboard)/statements/actions";
import { Button } from "@/components/ui/button";

export function ApproveImportForm({
  statementId,
  newCount,
  disabled,
}: {
  statementId: string;
  newCount: number;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(approveStatementImport, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="statementId" value={statementId} />
      <div>
        <Button type="submit" disabled={disabled || isPending}>
          <CheckCircle2 className="h-4 w-4" />
          {isPending ? "Importing..." : `Approve and import ${newCount} payment${newCount === 1 ? "" : "s"}`}
        </Button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.info && <p className="text-sm text-success">{state.info}</p>}
    </form>
  );
}
