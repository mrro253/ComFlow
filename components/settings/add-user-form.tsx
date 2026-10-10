"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import { addUser } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AgentTypeFields } from "@/components/users/agent-type-fields";
import type { AppUser } from "@/types/domain";

export function AddUserForm({ managers }: { managers: AppUser[] }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"agent" | "manager">("agent");
  const [state, formAction, isPending] = useActionState(addUser, undefined);

  if (!open) {
    return (
      <CardFooter>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Add teammate
        </Button>
      </CardFooter>
    );
  }

  return (
    <form action={formAction}>
      <CardContent className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" required />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              name="role"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as "agent" | "manager")}
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="managerId">Reports to</Label>
            <select
              id="managerId"
              name="managerId"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              defaultValue=""
            >
              <option value="">No manager</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.firstName} {manager.lastName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <AgentTypeFields idPrefix="add" defaultType={null} defaultLevel={null} isManager={role === "manager"} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="payeeId">Carrier payee ID (optional)</Label>
          <Input id="payeeId" name="payeeId" placeholder="e.g. W1234" />
          <p className="text-xs text-muted-foreground">
            Used on carrier statements to tell apart teammates who share a name.
          </p>
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state?.temporaryPassword && (
          <p className="rounded-md bg-secondary p-3 text-sm">
            Account created. Temporary password:{" "}
            <code className="font-medium">{state.temporaryPassword}</code>
            <br />
            <span className="text-muted-foreground">
              TODO: replace with an emailed invite once outbound email is configured.
            </span>
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding..." : "Add teammate"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </CardFooter>
    </form>
  );
}
