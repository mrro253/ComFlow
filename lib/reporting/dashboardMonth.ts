/** Resolve a dashboard month using only statement months already visible to the user. */
export function selectDashboardMonth(visibleMonths: readonly string[], requested: unknown) {
  const months = [...new Set(visibleMonths)].filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)).sort().reverse();
  const available = typeof requested === "string" && months.includes(requested);
  return {
    months,
    month: available ? requested : months[0] ?? null,
    unavailable: requested !== undefined && !available,
  };
}
