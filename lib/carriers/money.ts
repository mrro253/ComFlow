/**
 * Carrier statements print money as "1,234.56", "-28.92", "(10.00)" for
 * negatives, or "-" for zero. All math downstream uses integer cents so
 * amounts are never subject to floating-point error.
 */
const MONEY_FORMAT =
  /^(?:\(\d{1,3}(?:,\d{3})*\.\d{2}\)|\(\d+\.\d{2}\)|-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2})$/;

export function parseMoneyToCents(value: string): number {
  if (value === "-") return 0;
  if (!MONEY_FORMAT.test(value)) throw new Error("Invalid money amount");

  const negative = value.startsWith("(") || value.startsWith("-");
  const [dollars, centsPart] = value.replace(/[(),-]/g, "").split(".");
  const result = Number(dollars) * 100 + Number(centsPart);
  if (!Number.isSafeInteger(result)) {
    throw new Error("Amount exceeds supported precision");
  }
  return negative ? -result : result;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}
