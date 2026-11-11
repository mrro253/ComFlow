export interface EnrollmentListRow {
  code: string; firstName: string; lastName: string; carrier: string;
  submittedDate: string; status: string;
}
export interface EnrollmentDetail {
  code: string; firstName: string; lastName: string; mbi: string;
  plan: string; proposedEffectiveDate: string;
}
export class EnrollmentReadError extends Error {}
const fail = () => { throw new EnrollmentReadError("Enrollment validation failed; no identity link was accepted."); };

export function isoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fail();
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return fail();
  return value;
}
export function proposedDate(value: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return isoDate(m ? `${m[3]}-${m[1]}-${m[2]}` : value.trim());
}
export function enrollmentWindows(start: string, end: string) {
  isoDate(start); isoDate(end);
  if (start > end) return fail();
  const result: { start: string; end: string }[] = [];
  for (let cursor = start; cursor <= end;) {
    const nextMonth = new Date(`${cursor.slice(0, 7)}-01T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const last = new Date(nextMonth.getTime() - 86400000).toISOString().slice(0, 10);
    result.push({ start: cursor, end: last < end ? last : end });
    cursor = nextMonth.toISOString().slice(0, 10);
    if (result.length > 120) return fail();
  }
  return result;
}
export function detailUrl(href: string, portal: string, code: string) {
  const base = new URL(portal), url = new URL(href, base);
  if (url.origin !== base.origin || url.pathname !== base.pathname || url.username || url.password) return fail();
  const m = /^#\/enrollment\/SF_([^/]+)\/view(?:\?|$)/.exec(url.hash);
  if (!m || Buffer.from(decodeURIComponent(m[1]), "base64").toString("utf8") !== code) return fail();
  return url.href;
}
const name = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
export function verifyEnrollment(row: EnrollmentListRow, detail: EnrollmentDetail) {
  if (!row.code || row.code !== detail.code.trim() || !row.firstName.trim() || !row.lastName.trim() ||
      name(row.firstName) !== name(detail.firstName) || name(row.lastName) !== name(detail.lastName) || !row.carrier.trim() || !detail.plan.trim()) return fail();
  const mbi = detail.mbi.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z0-9]{11}$/.test(mbi)) return fail();
  return { ...row, mbi, plan: detail.plan.trim(), proposedEffectiveDate: proposedDate(detail.proposedEffectiveDate),
    identityVerified: true as const, coverageConfirmed: false as const };
}
export type CollectedEnrollment = ReturnType<typeof verifyEnrollment>;
export function rememberEnrollment(rows: Map<string, EnrollmentListRow>, row: EnrollmentListRow) {
  const prior = rows.get(row.code);
  if (prior && JSON.stringify(prior) !== JSON.stringify(row)) return fail();
  rows.set(row.code, row);
}
