"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { CAREER_LEVELS, type AgentType, type CareerLevel } from "@/types/domain";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm";

/**
 * Agent type (Career / Independent) and, for Career agents, their level.
 * Career agents are paid by the agency; Independent agents are paid directly by
 * the carrier and are only tracked here.
 */
export function AgentTypeFields({
  idPrefix,
  defaultType,
  defaultLevel,
  isManager,
}: {
  idPrefix: string;
  defaultType: AgentType | null;
  defaultLevel: CareerLevel | null;
  /** Managers may stay untyped; agents must pick one. */
  isManager: boolean;
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
          <option value="career">Career (paid by the agency)</option>
          <option value="independent">Independent (paid by the carrier)</option>
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
            {CAREER_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
