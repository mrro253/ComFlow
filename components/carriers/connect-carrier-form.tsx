"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { saveCarrierCredentials } from "@/app/(dashboard)/carriers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConnectCarrierForm({ carrier, replacing }: { carrier: string; replacing: boolean }) {
  const [state, formAction, isPending] = useActionState(saveCarrierCredentials, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" autoComplete="off">
      <input type="hidden" name="carrier" value={carrier} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`username-${carrier}`}>{carrier} username</Label>
          <Input id={`username-${carrier}`} name="username" required autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`password-${carrier}`}>{carrier} password</Label>
          <Input id={`password-${carrier}`} name="password" type="password" required autoComplete="new-password" />
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.info && <p className="text-sm text-success">{state.info}</p>}
      <div>
        <Button type="submit" disabled={isPending}>
          <KeyRound className="h-4 w-4" />
          {isPending ? "Saving..." : replacing ? "Replace login" : "Save login"}
        </Button>
      </div>
    </form>
  );
}
