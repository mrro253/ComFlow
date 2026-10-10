import { describe, expect, it } from "vitest";
import {
  buildWritingAgentOwners,
  productionEntityFor,
  withSavedAliases,
  type OwnerCandidate,
  type ProductionEntityRef,
} from "@/lib/carriers/writingAgentOwners";

const entities: ProductionEntityRef[] = [
  { id: "ent-agency", entityType: "agency", userId: null },
  { id: "ent-owner", entityType: "personal", userId: "owner" },
];

const user = (overrides: Partial<OwnerCandidate> & { id: string }): OwnerCandidate => ({
  firstName: "Pat",
  lastName: "Sample",
  role: "agent",
  agentType: "career",
  active: true,
  ...overrides,
});

describe("productionEntityFor", () => {
  it("keeps owner production personal and career production in the agency", () => {
    expect(productionEntityFor({ id: "owner", role: "owner", agentType: "independent" }, entities)?.id).toBe("ent-owner");
    expect(productionEntityFor({ id: "a", role: "agent", agentType: "career" }, entities)?.id).toBe("ent-agency");
  });

  it("leaves independent agents and untyped managers without an entity", () => {
    expect(productionEntityFor({ id: "i", role: "agent", agentType: "independent" }, entities)).toBeNull();
    expect(productionEntityFor({ id: "m", role: "manager", agentType: null }, entities)).toBeNull();
  });
});

describe("buildWritingAgentOwners", () => {
  it("registers both name orders per active user", () => {
    const owners = buildWritingAgentOwners([user({ id: "a" })], entities);
    expect(owners.get("PAT SAMPLE")?.[0].userId).toBe("a");
    expect(owners.get("SAMPLE PAT")?.[0].userId).toBe("a");
    expect(owners.get("PAT SAMPLE")?.[0].entityType).toBe("agency");
  });

  it("ignores inactive users", () => {
    expect(buildWritingAgentOwners([user({ id: "a", active: false })], entities).size).toBe(0);
  });

  it("keeps every teammate who shares a name so none is silently chosen", () => {
    const owners = buildWritingAgentOwners(
      [user({ id: "first", payeeId: "W1" }), user({ id: "second", payeeId: "W2" })],
      entities
    );
    expect(owners.get("PAT SAMPLE")?.map((o) => o.userId)).toEqual(["first", "second"]);
    expect(owners.get("PAT SAMPLE")?.map((o) => o.payeeId)).toEqual(["W1", "W2"]);
  });
});

describe("withSavedAliases", () => {
  it("lets a saved alias win and normalizes it", () => {
    const users = [user({ id: "a" }), user({ id: "b", firstName: "Lee", lastName: "Other" })];
    const base = buildWritingAgentOwners(users, entities);
    const merged = withSavedAliases(base, [{ alias: "sample,  p", userId: "b" }], users, entities);
    expect(merged.get("SAMPLE P")?.map((o) => o.userId)).toEqual(["b"]);
    expect(merged.get("PAT SAMPLE")?.map((o) => o.userId)).toEqual(["a"]);
  });

  it("skips saved aliases for unknown or inactive users", () => {
    const users = [user({ id: "a", active: false })];
    const merged = withSavedAliases(new Map(), [{ alias: "X Y", userId: "a" }, { alias: "Z", userId: "ghost" }], users, entities);
    expect(merged.size).toBe(0);
  });
});

describe("captive agents", () => {
  const principal = user({ id: "boss", firstName: "Bo", lastName: "Boss", agentType: "career" });
  const captive = user({
    id: "cap",
    firstName: "Cal",
    lastName: "Captive",
    agentType: "captive",
    principalId: "boss",
    payeeId: "w9",
  });

  it("credits a captive agent's production to the principal and records the writer", () => {
    const owners = buildWritingAgentOwners([principal, captive], entities);
    expect(owners.get("CAL CAPTIVE")).toEqual([
      {
        userId: "boss",
        agentType: "career",
        productionEntityId: "ent-agency",
        entityType: "agency",
        payeeId: "W9",
        writingUserId: "cap",
      },
    ]);
  });

  it("uses the owner's personal entity when the owner is the principal", () => {
    const owner = user({ id: "owner", role: "owner", firstName: "Own", lastName: "Er", agentType: null });
    const owners = buildWritingAgentOwners([owner, { ...captive, principalId: "owner" }], entities);
    expect(owners.get("CAL CAPTIVE")?.[0]).toMatchObject({ userId: "owner", entityType: "personal", writingUserId: "cap" });
  });

  it("leaves the name unmatched when the principal is missing, inactive, or captive", () => {
    expect(buildWritingAgentOwners([captive], entities).has("CAL CAPTIVE")).toBe(false);
    expect(buildWritingAgentOwners([{ ...principal, active: false }, captive], entities).has("CAL CAPTIVE")).toBe(false);
    const chained = [{ ...principal, agentType: "captive" as const, principalId: "x" }, captive];
    expect(buildWritingAgentOwners(chained, entities).has("CAL CAPTIVE")).toBe(false);
  });

  it("keeps saved aliases for a captive agent credited to the principal", () => {
    const users = [principal, captive];
    const merged = withSavedAliases(new Map(), [{ alias: "captive, c", userId: "cap" }], users, entities);
    expect(merged.get("CAPTIVE C")?.[0]).toMatchObject({ userId: "boss", writingUserId: "cap" });
  });
});

