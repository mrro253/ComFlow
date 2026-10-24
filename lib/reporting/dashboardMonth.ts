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

/** Annual options come only from valid statement months in the caller's visible ledger. */
export function selectDashboardYear(visibleMonths: readonly string[], requested: unknown) {
  const { months } = selectDashboardMonth(visibleMonths, undefined);
  const years = [...new Set(months.map(month => month.slice(0, 4)))];
  const available = typeof requested === "string" && years.includes(requested);
  const year = available ? requested : years[0] ?? null;
  return { years, year, unavailable: requested !== undefined && !available,
    monthsOnFile: year ? months.filter(month => month.startsWith(`${year}-`)).length : 0 };
}

export function selectDashboardQuarter(visibleMonths: readonly string[], year: string | null, requested: unknown) {
  const { months } = selectDashboardMonth(visibleMonths, undefined);
  const yearMonths = months.filter(month => year !== null && month.startsWith(`${year}-`));
  const available = typeof requested === "string" && ["1", "2", "3", "4"].includes(requested);
  const quarter = available ? Number(requested) : yearMonths.length ? Math.ceil(Number(yearMonths[0].slice(5)) / 3) : 1;
  const start = `${year}-${String(quarter * 3 - 2).padStart(2, "0")}`;
  const end = `${year}-${String(quarter * 3).padStart(2, "0")}`;
  return { quarter, start, end, unavailable: requested !== undefined && !available,
    monthsOnFile: yearMonths.filter(month => month >= start && month <= end).length };
}
