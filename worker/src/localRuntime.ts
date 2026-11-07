import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import type { InterruptedRun } from "./schedule.js";

/** Linux start ticks distinguish a restarted container's reused process ID. */
async function processStart(pid: number): Promise<string | undefined> {
  if (process.platform !== "linux") return undefined;
  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
  const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  if (!/^\d+$/.test(start ?? "")) throw new Error("Could not verify worker process identity.");
  return start;
}

/** One worker on one local machine. State contains operational IDs/timestamps only. */
export async function openLocalRuntime(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, "worker.lock");
  const journalPath = join(directory, "in-flight.json");
  const token = randomUUID();
  const started = await processStart(process.pid);
  for (let attempt = 0; ; attempt++) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), token, started })); await handle.sync(); }
      finally { await handle.close(); }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new Error("Could not acquire local worker lock.");
      // Only remove a verified dead process lock. Unknown/corrupt/foreign locks fail closed.
      const lock = JSON.parse(await readFile(lockPath, "utf8")) as { pid: number; host: string; token: string; started?: string };
      if (attempt > 0 || lock.host !== hostname() || !Number.isSafeInteger(lock.pid) || lock.pid <= 0 || typeof lock.token !== "string") throw new Error("Another worker or an unreadable lock requires attention.");
      let dead = false;
      try { process.kill(lock.pid, 0); } catch (probe) { dead = (probe as NodeJS.ErrnoException).code === "ESRCH"; }
      // Container entrypoint holds a namespace-independent kernel lock on /state.
      // Without that guard, an unfamiliar live PID must continue to fail closed.
      if (!dead && process.platform === "linux" && process.env.COMFLOW_CONTAINER_LOCKED === "1" && typeof lock.started === "string") {
        dead = await processStart(lock.pid) !== lock.started;
      }
      if (!dead) throw new Error("A worker is already running for this database on this machine.");
      // Serialize stale-lock removal; a competing recovery must not unlink a new live lock.
      const recoveryPath = join(directory, "worker-recovery.lock");
      let recovery;
      try { recovery = await open(recoveryPath, "wx", 0o600); }
      catch { throw new Error("Worker recovery is already in progress; retry later."); }
      try {
        const current = JSON.parse(await readFile(lockPath, "utf8"));
        if (current.token !== lock.token) throw new Error("Worker lock changed; retry later.");
        await unlink(lockPath);
      } finally { await recovery.close(); await unlink(recoveryPath); }
    }
  }
  return {
    async read(): Promise<InterruptedRun | null> {
      let text: string;
      try { text = await readFile(journalPath, "utf8"); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new Error("Could not read interrupted-run state.");
      }
      const run = JSON.parse(text) as InterruptedRun | null;
      if (run !== null && (typeof run.connectionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(run.connectionId) || typeof run.startedAt !== "string" || !Number.isFinite(Date.parse(run.startedAt)))) throw new Error("Invalid interrupted-run state; no automatic recovery performed.");
      return run;
    },
    async write(run: InterruptedRun | null) {
      const temporary = join(directory, `journal-${token}.tmp`);
      const handle = await open(temporary, "w", 0o600);
      try { await handle.writeFile(JSON.stringify(run)); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, journalPath);
    },
    async close() {
      const lock = JSON.parse(await readFile(lockPath, "utf8"));
      if (lock.token !== token) throw new Error("Worker lock ownership changed.");
      await unlink(lockPath);
    },
  };
}
