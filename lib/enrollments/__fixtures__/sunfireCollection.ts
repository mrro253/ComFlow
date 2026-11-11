import type { SunfireCollection } from "../sunfire";
export const syntheticSunfireCollection = (): SunfireCollection => ({
  version: 1, source: "SunFire Enrollments", complete: true,
  agencyId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", connectionId: "33333333-3333-4333-8333-333333333333",
  start: "2026-01-01", end: "2026-10-21", count: 1,
  records: [{ code: "SYNTHETIC001", firstName: "Example", lastName: "Person", carrier: "Example Carrier", submittedDate: "2026-01-20", status: "completed", mbi: "1EG4TE5MK73", plan: "Example Plan", proposedEffectiveDate: "2026-02-01", identityVerified: true, coverageConfirmed: false }],
});
