import { describe, expect, it } from "vitest";
import { sunfireCollectionHash, sunfirePortalUrl, sunfireStoragePath, validateSunfireCollection } from "../sunfire";
import { syntheticSunfireCollection } from "../__fixtures__/sunfireCollection";
describe("private SunFire source validation", () => {
  it("accepts only agency starting URLs on the exact HTTPS SunFire host", () => {
    expect(sunfirePortalUrl("https://www.sunfirematrix.com/app/agent/example/")).toContain("/example/");
    for (const url of ["http://www.sunfirematrix.com/app/agent/example/", "https://www.sunfirematrix.com.evil.invalid/app/agent/example/", "https://auth.sunfirematrix.com/u/login?state=secret", "https://www.sunfirematrix.com/app/agent/example/#/reporting", "https://user:password@www.sunfirematrix.com/app/agent/example/", "https://www.sunfirematrix.com:444/app/agent/example/"]) expect(() => sunfirePortalUrl(url)).toThrow();
  });
  it("deduplicates identical snapshots independently of source row order while binding the owner", () => {
    const source = syntheticSunfireCollection(); source.records.push({ ...source.records[0], code: "SYNTHETIC002" }); source.count = 2;
    const hash = sunfireCollectionHash(source);
    expect(sunfireCollectionHash({ ...source, records: [...source.records].reverse() })).toBe(hash);
    expect(sunfireCollectionHash({ ...source, userId: "44444444-4444-4444-8444-444444444444" })).not.toBe(hash);
    expect(sunfireStoragePath(source, hash)).toContain(`${source.agencyId}/sunfire-enrollments/${source.userId}/${source.connectionId}/`);
    expect(() => sunfireStoragePath(source, "../other")).toThrow();
  });
  it("rejects partial collections, inconsistent counts, duplicate codes and unverified identities", () => {
    const source = syntheticSunfireCollection();
    for (const change of [{ complete: false }, { count: 2 }, { records: [source.records[0], source.records[0]], count: 2 }, { start: "2026-02-30" }, { records: [{ ...source.records[0], identityVerified: false }] }, { records: [{ ...source.records[0], mbi: "***MK73" }] }, { records: [{ ...source.records[0], submittedDate: "2025-01-01" }] }, { records: [{ ...source.records[0], coverageConfirmed: true }] }]) expect(() => validateSunfireCollection({ ...source, ...change })).toThrow();
  });
});
