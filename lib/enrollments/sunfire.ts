import { sha256 } from "../carriers/digest";

export interface SunfireEnrollment {
  code: string; firstName: string; lastName: string; carrier: string;
  submittedDate: string; status: string; mbi: string; plan: string;
  proposedEffectiveDate: string; identityVerified: true; coverageConfirmed: false;
}
export interface SunfireCollection {
  version: 1; source: "SunFire Enrollments"; complete: true;
  agencyId: string; userId: string; connectionId: string;
  start: string; end: string; count: number; records: SunfireEnrollment[];
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const sunfireHashPattern = /^[a-f0-9]{64}$/;
export const SUNFIRE_MAX_BYTES = 10 * 1024 * 1024;
function invalid(): never { throw new Error("SunFire collection failed validation."); }
export function sunfireDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return invalid();
  return value;
}
export function sunfirePortalUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "www.sunfirematrix.com" || url.port || url.username || url.password || url.hash || url.search || !/^\/app\/agent\/[a-z0-9_-]+\/$/i.test(url.pathname)) return invalid();
    return url.href;
  } catch { return invalid(); }
}
function text(value: unknown, max = 1000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) return invalid();
  return value.trim();
}
export function validateSunfireCollection(value: unknown): SunfireCollection {
  if (!value || typeof value !== "object") return invalid();
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || data.source !== "SunFire Enrollments" || data.complete !== true ||
    ![data.agencyId, data.userId, data.connectionId].every((id) => typeof id === "string" && uuid.test(id))) return invalid();
  const start = sunfireDate(data.start), end = sunfireDate(data.end);
  if (start > end || !Array.isArray(data.records) || data.records.length > 10000 || data.count !== data.records.length) return invalid();
  const records = data.records.map((entry): SunfireEnrollment => {
    if (!entry || typeof entry !== "object") return invalid();
    const row = entry as Record<string, unknown>;
    const submittedDate = sunfireDate(row.submittedDate), mbi = text(row.mbi, 11);
    if (submittedDate < start || submittedDate > end || !/^[A-Z0-9]{11}$/.test(mbi) || row.identityVerified !== true || row.coverageConfirmed !== false) return invalid();
    return { code: text(row.code, 100), firstName: text(row.firstName, 200), lastName: text(row.lastName, 200), carrier: text(row.carrier, 200),
      submittedDate, status: text(row.status, 100), mbi, plan: text(row.plan), proposedEffectiveDate: sunfireDate(row.proposedEffectiveDate), identityVerified: true, coverageConfirmed: false };
  }).sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  if (new Set(records.map((row) => row.code)).size !== records.length) return invalid();
  return { version: 1, source: "SunFire Enrollments", complete: true, agencyId: data.agencyId as string, userId: data.userId as string, connectionId: data.connectionId as string, start, end, count: records.length, records };
}
export function sunfireCollectionBytes(value: unknown) { return Buffer.from(JSON.stringify(validateSunfireCollection(value)), "utf8"); }
export function sunfireCollectionHash(value: unknown) { return sha256(sunfireCollectionBytes(value)); }
export function sunfireStoragePath(binding: Pick<SunfireCollection, "agencyId" | "userId" | "connectionId">, hash: string) {
  if (![binding.agencyId, binding.userId, binding.connectionId].every((id) => uuid.test(id)) || !sunfireHashPattern.test(hash)) return invalid();
  return `${binding.agencyId}/sunfire-enrollments/${binding.userId}/${binding.connectionId}/${hash}.json`;
}
export function localDate(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
