import { describe, expect, it, vi } from "vitest";
import { storeDevotedPair } from "../devotedSync";
import { sha256Hex } from "../safeError";
import type { Db, ConnectionRow } from "../db";
const connection = { id: "connection", agency_id: "agency", user_id: "owner" } as ConnectionRow;
const pdf = Buffer.from("%PDF-synthetic"), workbook = Buffer.from("synthetic-workbook");
function database(prior = false, corrupt = false, failWorkbook = false, disabled = false) {
  const objects = new Map<string, Uint8Array>();
  const upload = vi.fn(async (name: string, bytes: Uint8Array) => {
    if (failWorkbook && name.endsWith(".xlsx")) return { error: { statusCode: "500" } };
    if (objects.has(name)) return { error: { statusCode: "409" } };
    objects.set(name, bytes); return { error: null };
  });
  const download = vi.fn(async (name: string) => ({ data: new Blob([new Uint8Array(corrupt ? Buffer.from("corrupted") : objects.get(name)!)]), error: null }));
  const from = (name: string) => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ error: null, data: name === "carrier_connections" ? { status: disabled ? "disabled" : "active" } : prior ? { id: "imported" } : null }) }; return chain;
  };
  return { db: { from, storage: { from: () => ({ upload, download }) } } as unknown as Db, upload, objects };
}
describe("Devoted private inbox", () => {
  it("skips already imported pairs without writing or changing the ledger", async () => {
    const mock = database(true);
    expect(await storeDevotedPair(mock.db, connection, "2026-09-25", pdf, workbook)).toBe("duplicate");
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("preserves both files before committing a manifest and reuses identical sources", async () => {
    const mock = database();
    expect(await storeDevotedPair(mock.db, connection, "2026-09-25", pdf, workbook)).toBe("stored");
    expect([...mock.objects.keys()].map((key) => key.split(".").pop())).toEqual(["pdf", "xlsx", "json"]);
    expect(mock.upload.mock.calls[0][0]).toContain("agency/devoted-inbox/connection/");
    const manifest = JSON.parse(Buffer.from([...mock.objects.values()][2]).toString());
    expect(manifest.pdfHash).toBe(sha256Hex(pdf));
    expect(await storeDevotedPair(mock.db, connection, "2026-09-25", pdf, workbook)).toBe("duplicate");
    expect(mock.objects.size).toBe(3);
  });
  it("never publishes incomplete or corrupted pairs", async () => {
    for (const mock of [database(false, true), database(false, false, true)]) {
      await expect(storeDevotedPair(mock.db, connection, "2026-09-25", pdf, workbook)).rejects.toThrow();
      expect([...mock.objects.keys()].some((key) => key.endsWith(".json"))).toBe(false);
    }
  });
  it("stops when a connection was disconnected during sign-in", async () => {
    const mock = database(false, false, false, true);
    await expect(storeDevotedPair(mock.db, connection, "2026-09-25", pdf, workbook)).rejects.toThrow("removed");
    expect(mock.upload).not.toHaveBeenCalled();
  });
});
