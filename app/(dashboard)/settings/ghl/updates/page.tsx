import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { GhlPolicyPreview } from "@/components/settings/ghl-policy-preview";
export default async function GhlPolicyUpdatesPage(){
  await requireRole(["owner","agent"]);
  return <div className="max-w-6xl space-y-5"><Link className="text-sm underline" href="/settings/ghl">Back to GHL setup</Link><h1 className="text-2xl font-semibold">GHL policy update preview</h1>
    <p>See existing GHL policy information beside each linked enrollment and review draft reference/history notes. This page only reads contacts assigned to your GHL user. It cannot send updates or notes.</p>
    <p className="text-sm text-muted-foreground">Paid enrollments are assumed Active based on their reported commissions. This is a payment-based assumption, not carrier-verified coverage. Missing payments and chargebacks do not imply Inactive. Newer or different existing GHL policies and multiple applications are protected from automatic replacement. This preview sends nothing.</p>
    <GhlPolicyPreview/>
  </div>;
}
