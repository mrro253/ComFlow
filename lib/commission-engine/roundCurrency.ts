/** Rounds to 2 decimal places (cents). Shared by every calculation function
 *  so rounding behavior is consistent and only defined once. */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
