"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { saveCarrierCredentials } from "@/app/(dashboard)/carriers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConnectCarrierForm({ carrier, replacing }: { carrier: string; replacing: boolean }) {
  const [state, formAction, isPending] = useActionState(saveCarrierCredentials, undefined);
  const sunfire = carrier === "SunFire";

  return (
    <form action={formAction} className="flex flex-col gap-4" autoComplete="off">
      <p className="text-sm text-muted-foreground">{sunfire ? "Sync enrollments uses your saved SunFire login. Complete any verification in the worker window. It collects enrollment details for review without changing commission records." : "Sync now uses your saved login automatically. If the carrier asks for verification or sign-in review, complete that request in the worker browser. Your session stays in memory while the worker runs."}</p>
      <input type="hidden" name="carrier" value={carrier} />
      {sunfire && <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2"><Label htmlFor="sunfire-portal">Your agency’s SunFire portal URL</Label><Input id="sunfire-portal" name="portalUrl" type="url" required placeholder="https://www.sunfirematrix.com/app/agent/your-agency/" /><p className="text-xs text-muted-foreground">Use your normal starting link, before the sign-in redirect.</p></div>
        <div className="flex flex-col gap-2"><Label htmlFor="sunfire-start">Collect enrollments starting</Label><Input id="sunfire-start" name="enrollmentStart" type="date" required defaultValue={`${new Date().getFullYear()}-01-01`} /><p className="text-xs text-muted-foreground">Each sync checks this date through today.</p></div>
      </div>}
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
