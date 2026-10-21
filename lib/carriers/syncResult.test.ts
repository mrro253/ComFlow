import { expect, it } from "vitest";
import { readSyncResult, loginHelpMessage, type SyncResult } from "./syncResult";
import { connectionStatus } from "../reporting/connectionStatus";

const result: SyncResult = { version: 1, connectionId: "synthetic-connection", carrier: "Example", startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:01:00Z", outcome: "completed", counts: { found: 10, downloaded: 2, skipped: 8, failed: 0 } };
it("validates summary binding and counts", () => {
  expect(readSyncResult(result, result.connectionId, result.carrier)).toEqual(result);
  for (const value of [{ ...result, connectionId: "other" }, { ...result, carrier: "Other" }, { ...result, counts: null }, { ...result, counts: { ...result.counts, failed: -1 } }, { ...result, finishedAt: "invalid" }, { ...result, finishedAt: "2025-01-01" }]) {
    expect(readSyncResult(value, result.connectionId, result.carrier)).toBeNull();
  }
});
it("retains unknown counts on a stopped run instead of inventing zeros", () => {
  expect(readSyncResult({ ...result, outcome: "failed", counts: null }, result.connectionId, result.carrier)?.counts).toBeNull();
});
it("projects only allowlisted summary fields", () => {
  expect(readSyncResult({ ...result, rawError: "private", counts: { ...result.counts, filename: "private" } }, result.connectionId, result.carrier)).toEqual(result);
});
it("distinguishes verification from sign-in review and ordinary errors", () => {
  expect(connectionStatus("needs_attention", loginHelpMessage("verification")).label).toBe("Needs verification");
  expect(connectionStatus("needs_attention", loginHelpMessage("sign_in_review")).label).toBe("Review sign-in");
  expect(connectionStatus("needs_attention", "Wrong username or password").label).toBe("Needs attention");
  expect(connectionStatus("needs_attention", "Sync running. Signing in").label).toBe("Sync in progress");
  expect(connectionStatus("active", "Verification needed.").label).toBe("Connected");
});
