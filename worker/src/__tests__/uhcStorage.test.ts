import { describe, expect, it, vi } from "vitest";
import { storeUhcPair } from "../uhcStorage";
import { sha256Hex } from "../safeError";
import { UHC_TEXT_HEADER } from "../carriers/uhcMetadata";
import type { Db, ConnectionRow } from "../db";
const mock = vi.hoisted(() => ({ store: vi.fn() }));
vi.mock("../db.js", () => ({ storeStatement: mock.store }));
const connection = { id: "connection", agency_id: "agency", user_id: "owner" } as ConnectionRow;
const pair = { pdf: Buffer.from("%PDF-synthetic"), text: Buffer.from(UHC_TEXT_HEADER.join(",") + "\n"), filename: "commission_statement_999001_2026-01-01.pdf", statementMonth: "2026-01", payeeHash: sha256Hex(Buffer.from("999001")) };
function database(fail = false) {
  const objects = new Map<string, Uint8Array>();
  const upload = vi.fn(async (key: string, bytes: Uint8Array) => { if (fail && key.endsWith(".txt")) return { error: { statusCode: "500" } }; objects.set(key, bytes); return { error: null }; });
  const download = async (key: string) => ({ data: new Blob([new Uint8Array(objects.get(key)!)]), error: null });
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ error: null, data: { status: "active" } }) };
  return { db: { from: () => query, storage: { from: () => ({ upload, download }) } } as unknown as Db, objects, upload };
}
describe("UHC sync source preservation", () => {
  it("preserves both sources before registering the PDF, and includes revision hash in identity", async () => {
    mock.store.mockResolvedValue("duplicate"); const db = database();
    expect(await storeUhcPair(db.db, connection, null, pair)).toBe("duplicate");
    expect([...db.objects.keys()].map((key) => key.split(".").pop())).toEqual(["pdf", "txt", "json"]);
    expect(mock.store.mock.calls.at(-1)?.[1]).toMatchObject({ carrier: "UnitedHealthcare", filename: pair.filename, carrierStatementId: `${pair.payeeHash}:2026-01:${sha256Hex(pair.pdf)}` });
  });
  it("does not register incomplete sources or mismatched payee identity", async () => {
    mock.store.mockClear(); const db = database(true);
    await expect(storeUhcPair(db.db, connection, null, pair)).rejects.toThrow("preserve");
    await expect(storeUhcPair(database().db, connection, null, { ...pair, payeeHash: "0".repeat(64) })).rejects.toThrow("payee");
    expect(mock.store).not.toHaveBeenCalled(); expect([...db.objects.keys()].some((key) => key.endsWith(".json"))).toBe(false);
  });
});
