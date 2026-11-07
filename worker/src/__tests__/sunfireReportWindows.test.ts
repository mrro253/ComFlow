import { expect, it } from "vitest";
import { splitReportWindow } from "../sunfire/reportWindows";

it("narrows reports without gaps or repeated boundary dates", () => {
  const pending = [{ start: "2026-01-01", end: "2026-01-31" }];
  const days: string[] = [];
  while (pending.length) {
    const window = pending.shift()!;
    const split = splitReportWindow(window);
    if (split) pending.unshift(...split);
    else days.push(window.start);
  }
  expect(days).toEqual(Array.from({ length: 31 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`));
});

it("handles leap days and stops subdividing a single day", () => {
  expect(splitReportWindow({ start: "2024-02-28", end: "2024-03-01" })).toEqual([
    { start: "2024-02-28", end: "2024-02-29" },
    { start: "2024-03-01", end: "2024-03-01" },
  ]);
  expect(splitReportWindow({ start: "2026-01-01", end: "2026-01-01" })).toBeNull();
  expect(() => splitReportWindow({ start: "2026-02-30", end: "2026-03-01" })).toThrow();
});
