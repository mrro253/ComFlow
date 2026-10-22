import { EnrollmentReadError } from "./enrollment.js";

export function uniqueFieldValue(values: string[], label: string) {
  const populated = values.map((value) => value.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!populated.length || new Set(populated).size !== 1) throw new EnrollmentReadError(`Required field ${label} is empty or has conflicting values.`);
  return populated[0];
}
