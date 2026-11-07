// Local arithmetic only: does not use AWS credentials or make network calls.
import { readFile } from "node:fs/promises";
const plan = JSON.parse(await readFile(new URL("../worker/hosting/aws-pilot-costs.json", import.meta.url), "utf8"));
let total = 0;
for (const item of plan.items) {
  if (!Number.isFinite(item.quantity) || item.quantity < 0 || !Number.isFinite(item.rate) || item.rate < 0) throw new Error("Invalid cost assumptions");
  const amount = item.quantity * item.rate;
  total += amount;
  console.log(`${item.name}: $${amount.toFixed(2)}`);
}
console.log(`\nEstimated ${plan.region} monthly total: $${total.toFixed(2)} USD (${plan.hoursPerMonth} hours).`);
const hourlyRates = plan.items.filter(item => item.unit === "hours").reduce((sum, item) => sum + item.rate, 0);
console.log(`31-day month with 744 server/IP hours: $${(total + (744 - plan.hoursPerMonth) * hourlyRates).toFixed(2)} USD.`);
console.log(`Planning budget: $${plan.recommendedBudgetUsd}/month before tax; not a spending cap.`);
console.log("Rows are rounded for display; totals use unrounded values. Domain registration and existing website/database costs are separate.");
