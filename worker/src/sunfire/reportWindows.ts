import { isoDate } from "./enrollment.js";

/** Non-overlapping inclusive ranges preserve the original report's coverage. */
export function splitReportWindow(window: { start: string; end: string }) {
  const start = Date.parse(`${isoDate(window.start)}T00:00:00Z`);
  const end = Date.parse(`${isoDate(window.end)}T00:00:00Z`);
  if (start > end) throw new Error("Invalid report date range.");
  if (start === end) return null;
  const day = 86400000;
  const midpoint = start + Math.floor((end - start) / day / 2) * day;
  const date = (value: number) => new Date(value).toISOString().slice(0, 10);
  return [
    { start: window.start, end: date(midpoint) },
    { start: date(midpoint + day), end: window.end },
  ];
}
