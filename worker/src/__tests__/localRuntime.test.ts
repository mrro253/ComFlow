import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { openLocalRuntime } from "../localRuntime";
const directories: string[] = [];
async function directory() { const path = await mkdtemp(join(tmpdir(), "comflow-runtime-synthetic-")); directories.push(path); return path; }
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });

it("prevents a second local worker and retains a durable interrupted-run journal", async () => {
  const path = await directory();
  const runtime = await openLocalRuntime(path);
  await expect(openLocalRuntime(path)).rejects.toThrow("already running");
  const run = { connectionId: "ed230000-0000-4000-8000-000000000123", startedAt: "2026-11-02T12:00:00Z" };
  await runtime.write(run); await runtime.close();
  const restarted = await openLocalRuntime(path);
  expect(await restarted.read()).toEqual(run);
  await restarted.write(null); expect(await restarted.read()).toBeNull();
  await restarted.close();
});
it("recovers a confirmed dead local lock without losing its journal", async () => {
  const path = await directory();
  await writeFile(join(path, "worker.lock"), JSON.stringify({ pid: 2147483647, host: hostname(), token: "synthetic-dead-lock" }));
  const runtime = await openLocalRuntime(path);
  expect(await runtime.read()).toBeNull();
  await runtime.close();
});
it("fails closed for a foreign-machine lock", async () => {
  const path = await directory(); const lock = { pid: 2147483647, host: "synthetic-other-machine", token: "synthetic-token" };
  await writeFile(join(path, "worker.lock"), JSON.stringify(lock));
  await expect(openLocalRuntime(path)).rejects.toThrow("requires attention");
  expect(JSON.parse(await readFile(join(path, "worker.lock"), "utf8"))).toEqual(lock);
});
it("does not accept a corrupt journal as an empty successful run", async () => {
  const path = await directory(); const runtime = await openLocalRuntime(path);
  await writeFile(join(path, "in-flight.json"), JSON.stringify({ connectionId: "invalid", startedAt: "invalid" }));
  await expect(runtime.read()).rejects.toThrow("Invalid interrupted-run");
  await runtime.close();
});
