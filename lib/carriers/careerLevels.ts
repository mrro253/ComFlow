import type { CareerLevelRecord } from "@/types/domain";

/** Trimmed, single-spaced. Case is kept as typed but compared case-insensitively. */
export function normalizeLevelName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export type NewLevelPlan = { ok: true; name: string; rank: number } | { ok: false; error: string };

/**
 * New levels go on top of the ladder (highest rank + 1). Names are unique per agency
 * ignoring case, and are never renamed afterwards (rules and rate locks refer to them).
 */
export function planNewLevel(existing: readonly Pick<CareerLevelRecord, "name" | "rank">[], rawName: string): NewLevelPlan {
  const name = normalizeLevelName(rawName);
  if (!name) return { ok: false, error: "Enter a level name." };
  if (name.length > 60) return { ok: false, error: "Level names can be at most 60 characters." };
  if (existing.some((level) => level.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "You already have a level with that name." };
  }
  const rank = existing.reduce((max, level) => Math.max(max, level.rank), 0) + 1;
  return { ok: true, name, rank };
}

export const VISIBILITY_LABEL = {
  own: "Sees only their own business",
  direct_reports: "Also sees their direct reports' business",
} as const;

/** Active levels in ladder order (lowest first). */
export function activeLevelNames(levels: readonly CareerLevelRecord[]): string[] {
  return levels
    .filter((level) => level.active)
    .sort((a, b) => a.rank - b.rank)
    .map((level) => level.name);
}
