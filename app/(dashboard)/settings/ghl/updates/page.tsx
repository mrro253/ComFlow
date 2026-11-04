import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { GhlPolicyPreview } from "@/components/settings/ghl-policy-preview";
export default async function GhlPolicyUpdatesPage(){
  await requireRole(["owner","agent"]);
  return <div className="max-w-6xl space-y-5"><Link className="text-sm underline" href="/settings/ghl">Back to GHL setup</Link><h1 className="text-2xl font-semibold">GHL policy update preview</h1>
    <p>Compare linked enrollments with current GHL policy fields. Previewing only reads contacts assigned to your GHL user. For a manual change, separately review and approve one contact&apos;s proposed status or plan details and the exact history note. Only the listed fields can change.</p>
    <p className="text-sm text-muted-foreground">Paid enrollments are assumed Active based on their reported commissions. This is a payment-based assumption, not carrier-verified coverage. Missing payments and chargebacks do not imply Inactive. Newer or different existing GHL policies and multiple applications are protected from automatic replacement. When automatic import processing is on, new imports apply supported changes and save history notes.</p>
    <Link className="inline-flex rounded-md border px-4 py-2 font-medium" href="/settings/ghl/statements">Check original statements against GHL — no SunFire enrollment required</Link><Link className="inline-flex rounded-md border px-4 py-2 font-medium" href="/settings/ghl/results">View GHL sync results</Link><GhlPolicyPreview/>
  </div>;
}
