import { describe, expect, it } from "vitest";
import { scheduledConnectionDue, needsInterruptionNotice } from "../schedule";
import type { ConnectionRow } from "../db";

const now = new Date("2026-11-02T12:00:00Z");
const connection = { id: "ed230000-0000-4000-8000-000000000123", status: "active", carrier: "Ultimate Health Plans", sync_requested_at: null, last_sync_at: "2026-11-01T12:00:00Z", last_successful_sync_at: "2026-11-01T12:00:00Z", last_error: null } as ConnectionRow;
describe("rolling daily schedule", () => {
  it("becomes due at 24 hours and catches up once after downtime", () => {
    expect(scheduledConnectionDue(connection, now)).toBe(true);
    expect(scheduledConnectionDue({ ...connection, last_sync_at: "2026-11-02T11:59:00Z" }, now)).toBe(false);
    expect(scheduledConnectionDue({ ...connection, last_sync_at: "2026-10-01T12:00:00Z" }, now)).toBe(true);
  });
  it("never schedules paused UHC, unknown carriers or login/disabled/pending states", () => {
    for (const carrier of ["UnitedHealthcare", "Unknown"]) expect(scheduledConnectionDue({ ...connection, carrier }, now)).toBe(false);
    for (const status of ["pending", "disabled", "needs_attention"] as const) expect(scheduledConnectionDue({ ...connection, status }, now)).toBe(false);
    expect(scheduledConnectionDue({ ...connection, sync_requested_at: now.toISOString() }, now)).toBe(false);
  });
  it("does not spin on invalid or future timestamps", () => {
    for (const last_sync_at of ["invalid", "2027-01-01T00:00:00Z"]) expect(scheduledConnectionDue({ ...connection, last_sync_at }, now)).toBe(false);
    expect(scheduledConnectionDue(connection, new Date("invalid"))).toBe(false);
  });
});
describe("interrupted run recovery", () => {
  const run = { connectionId: connection.id, startedAt: "2026-11-02T11:00:00Z" };
  const claimed = { ...connection, last_sync_at: run.startedAt, last_error: "Sync running. Opening portal." };
  it("marks an unfinished claimed run without replaying a login", () => {
    expect(needsInterruptionNotice(claimed, run)).toBe(true);
    expect(needsInterruptionNotice({ ...claimed, last_error: "Verification needed. Enter code." }, run)).toBe(true);
  });
  it("preserves finished success, failures, disabled connections and newer requests", () => {
    for (const row of [{ ...claimed, last_successful_sync_at: run.startedAt }, { ...claimed, last_error: "Wrong username or password" }, { ...claimed, status: "disabled" as const }, { ...claimed, sync_requested_at: now.toISOString() }, connection]) expect(needsInterruptionNotice(row, run)).toBe(false);
  });
  it("rejects another connection and an invalid journal date", () => {
    expect(needsInterruptionNotice(claimed, { ...run, connectionId: "other" })).toBe(false);
    expect(needsInterruptionNotice(claimed, { ...run, startedAt: "invalid" })).toBe(false);
  });
});
