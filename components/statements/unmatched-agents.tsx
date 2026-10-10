"use client";

import { useActionState, useId, useState } from "react";
import { UserPlus } from "lucide-react";
import { createWritingAgent, matchWritingAgent } from "@/app/(dashboard)/statements/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AgentTypeFields } from "@/components/users/agent-type-fields";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm";

export interface UnmatchedAgentView {
  name: string;
  code: "no-match" | "ambiguous";
  writingAgentId: string | null;
  rowCount: number;
  amount: string;
  firstName: string;
  lastName: string;
}

export interface TeamOption {
  id: string;
  name: string;
}

export function UnmatchedAgentRow({
  statementId,
  agent,
  team,
}: {
  statementId: string;
  agent: UnmatchedAgentView;
  team: TeamOption[];
}) {
  const uid = useId();
  const [creating, setCreating] = useState(false);
  const [matchState, matchAction, matching] = useActionState(matchWritingAgent, undefined);
  const [createState, createAction, creatingPending] = useActionState(createWritingAgent, undefined);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{agent.name}</p>
          <p className="text-xs text-muted-foreground">
            {agent.rowCount} payment{agent.rowCount === 1 ? "" : "s"} - {agent.amount}
            {agent.writingAgentId ? ` - carrier ID ${agent.writingAgentId}` : ""}
          </p>
        </div>
        <Badge variant="destructive">
          {agent.code === "ambiguous" ? "Several teammates share this name" : "No teammate with this name"}
        </Badge>
      </div>

      <form action={matchAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="statementId" value={statementId} />
        <input type="hidden" name="name" value={agent.name} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`match-${uid}`}>Assign to an existing teammate</Label>
          <select id={`match-${uid}`} name="userId" className={SELECT_CLASS} defaultValue="" required>
            <option value="" disabled>
              Choose...
            </option>
            {team.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={matching}>
          {matching ? "Saving..." : "Assign"}
        </Button>
        {!creating && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" />
            Create a new agent
          </Button>
        )}
      </form>
      {matchState?.error && <p className="text-sm text-destructive">{matchState.error}</p>}
      {matchState?.info && <p className="text-sm text-success">{matchState.info}</p>}

      {creating && (
        <form action={createAction} className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
          <input type="hidden" name="statementId" value={statementId} />
          <input type="hidden" name="name" value={agent.name} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`first-${uid}`}>First name</Label>
              <Input id={`first-${uid}`} name="firstName" defaultValue={agent.firstName} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`last-${uid}`}>Last name</Label>
              <Input id={`last-${uid}`} name="lastName" defaultValue={agent.lastName} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`email-${uid}`}>Email</Label>
              <Input id={`email-${uid}`} name="email" type="email" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`payee-${uid}`}>Carrier payee ID (optional)</Label>
              <Input
                id={`payee-${uid}`}
                name="payeeId"
                defaultValue={agent.writingAgentId ?? ""}
                placeholder="e.g. W1234"
              />
            </div>
          </div>
          <AgentTypeFields
            idPrefix={`create-${uid}`}
            defaultType={null}
            defaultLevel={null}
            isManager={false}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={creatingPending}>
              {creatingPending ? "Adding..." : "Add agent and assign"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
          {createState?.error && <p className="text-sm text-destructive">{createState.error}</p>}
          {createState?.info && (
            <p className="rounded-md bg-secondary p-3 text-sm">
              {createState.info}
              {createState.temporaryPassword && (
                <>
                  {" "}
                  Temporary password: <code className="font-medium">{createState.temporaryPassword}</code>
                </>
              )}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
