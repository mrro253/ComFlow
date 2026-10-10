"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import type { AgentType, CareerLevel } from "@/types/domain";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm";

/**
 * Agent type (Career / Independent / Captive) and, for Career agents, their
 * level, or for Captive agents, their principal. Career agents are paid by the
 * agency; Independent agents are paid directly by the carrier and are only
 * tracked here; a Captive (LOA) agent's production is credited to the principal
 * agent, who pays them directly.
 */
export function AgentTypeFields({
  idPrefix,
  levels,
  defaultType,
  defaultLevel,
  isManager,
  principals = [],
  defaultPrincipalId = null,
}: {
  idPrefix: string;
  /** The agency's own career levels (a teammate's current level is included even if turned off). */
  levels: string[];
  defaultType: AgentType | null;
  defaultLevel: CareerLevel | null;
  /** Managers may stay untyped; agents must pick one. */
  isManager: boolean;
  /** Teammates who can be a captive agent's principal (never captive themselves). */
  principals?: { id: string; name: string }[];
  defaultPrincipalId?: string | null;
}) {
  const [type, setType] = useState<AgentType | "">(defaultType ?? "");

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-agentType`}>Agent type</Label>
        <select
          id={`${idPrefix}-agentType`}
          name="agentType"
          className={SELECT_CLASS}
          value={type}
          onChange={(e) => setType(e.target.value as AgentType | "")}
          required={!isManager}
        >
          <option value="">{isManager ? "None" : "Choose..."}</option>
          <option value="career" disabled={levels.length === 0}>
            Career (paid by the agency)
          </option>
          <option value="independent">Independent (paid by the carrier)</option>
          {!isManager && (
            <option value="captive">Captive / LOA (paid by their principal agent)</option>
          )}
        </select>
      </div>
      {type === "career" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-careerLevel`}>Career level</Label>
          <select
            id={`${idPrefix}-careerLevel`}
            name="careerLevel"
            className={SELECT_CLASS}
            defaultValue={defaultLevel ?? ""}
            required
          >
            <option value="" disabled>
              Choose...
            </option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      )}
      {type === "captive" && !isManager && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-principalId`}>Principal agent</Label>
          <select
            id={`${idPrefix}-principalId`}
            name="principalId"
            className={SELECT_CLASS}
            defaultValue={defaultPrincipalId ?? ""}
            required
          >
            <option value="" disabled>
              Choose...
            </option>
            {principals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
