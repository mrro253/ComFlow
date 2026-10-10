"use client";

import { useActionState, useState } from "react";
import {
  addCareerLevel,
  changeBonusesEnabled,
  changeLevelVisibility,
  saveCompensationRule,
  setLevelActive,
} from "@/app/(dashboard)/compensation/actions";
import { VISIBILITY_LABEL } from "@/lib/carriers/careerLevels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEVEL_VISIBILITIES, type CareerLevelRecord, type LevelVisibility } from "@/types/domain";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm";

function Result({ state }: { state: { error?: string; info?: string } | undefined }) {
  if (state?.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (state?.info) return <p className="text-sm text-success">{state.info}</p>;
  return null;
}

function VisibilitySelect({
  name = "visibility",
  defaultValue,
  id,
}: {
  name?: string;
  defaultValue: LevelVisibility;
  id?: string;
}) {
  return (
    <select id={id} name={name} className={SELECT_CLASS} defaultValue={defaultValue}>
      {LEVEL_VISIBILITIES.map((v) => (
        <option key={v} value={v}>
          {VISIBILITY_LABEL[v]}
        </option>
      ))}
    </select>
  );
}

export function AddLevelForm() {
  const [state, action, pending] = useActionState(addCareerLevel, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 border-t border-border p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="level-name">New level</Label>
          <Input id="level-name" name="name" placeholder="e.g. Associate Agent" required maxLength={60} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="level-visibility">Visibility</Label>
          <VisibilitySelect id="level-visibility" defaultValue="own" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add level"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        New levels go on top of the ladder. Names cannot be changed later (rates and policies refer to
        them), but a level can be turned off.
      </p>
      <Result state={state} />
    </form>
  );
}

export function LevelControls({ level }: { level: CareerLevelRecord }) {
  const [visState, visAction, visPending] = useActionState(changeLevelVisibility, undefined);
  const [activeState, activeAction, activePending] = useActionState(setLevelActive, undefined);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <form action={visAction} className="flex items-center gap-2">
          <input type="hidden" name="levelId" value={level.id} />
          <VisibilitySelect defaultValue={level.visibility} />
          <Button type="submit" size="sm" variant="outline" disabled={visPending}>
            Save
          </Button>
        </form>
        <form action={activeAction}>
          <input type="hidden" name="levelId" value={level.id} />
          <input type="hidden" name="active" value={level.active ? "false" : "true"} />
          <Button type="submit" size="sm" variant="ghost" disabled={activePending}>
            {level.active ? "Turn off" : "Turn on"}
          </Button>
        </form>
      </div>
      <Result state={visState ?? activeState} />
    </div>
  );
}

export function RuleForm({
  levels,
  products,
  categories,
}: {
  levels: string[];
  products: string[];
  categories: string[];
}) {
  const [method, setMethod] = useState<"FIXED" | "PERCENT">("FIXED");
  const [state, action, pending] = useActionState(saveCompensationRule, undefined);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="flex flex-col gap-3 border-t border-border p-6">
      <p className="text-sm font-medium">Set a rate</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-level">Career level</Label>
          <select id="rule-level" name="careerLevel" className={SELECT_CLASS} defaultValue="" required>
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-product">Product</Label>
          <Input id="rule-product" name="product" list="rule-products" placeholder="e.g. MAPD" required />
          <datalist id="rule-products">
            {products.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-category">Payment category</Label>
          <Input id="rule-category" name="commissionType" list="rule-categories" placeholder="e.g. T65, RENEWAL" required />
          <datalist id="rule-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-method">Paid as</Label>
          <select
            id="rule-method"
            name="method"
            className={SELECT_CLASS}
            value={method}
            onChange={(e) => setMethod(e.target.value as "FIXED" | "PERCENT")}
          >
            <option value="FIXED">Fixed dollar amount</option>
            <option value="PERCENT">Percent of annual premium</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-amount">{method === "FIXED" ? "Amount ($)" : "Percent (%)"}</Label>
          <Input
            id="rule-amount"
            name="amount"
            inputMode="decimal"
            placeholder={method === "FIXED" ? "300 or 12.50" : "75"}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-from">Starts on</Label>
          <Input id="rule-from" name="effectiveFrom" type="date" defaultValue={today} required />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A new rate starts on its date and ends the previous rate for the same level, product and
        category the day before. Business already written keeps the rate it was written under.
        Anything you leave blank stays &quot;Not configured&quot;, never zero.
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save rate"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function BonusToggle({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(changeBonusesEnabled, undefined);
  return (
    <form action={action} className="flex flex-col gap-2 p-6 pt-0">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <div>
        <Button type="submit" variant={enabled ? "outline" : "default"} disabled={pending}>
          {enabled ? "Turn bonuses off" : "Turn bonuses on"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}
