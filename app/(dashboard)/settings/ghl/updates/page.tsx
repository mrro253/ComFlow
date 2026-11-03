import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { GhlPolicyPreview } from "@/components/settings/ghl-policy-preview";
export default async function GhlPolicyUpdatesPage(){
  await requireRole(["owner","agent"]);
  return <div className="max-w-6xl space-y-5"><Link className="text-sm underline" href="/settings/ghl">Back to GHL setup</Link><h1 className="text-2xl font-semibold">GHL policy update preview</h1>
    <p>See existing GHL policy information beside each linked enrollment and review draft reference/history notes. This page only reads contacts assigned to your GHL user. It cannot send updates or notes.</p>
    <p className="text-sm text-muted-foreground">Current policy fields need confirmed current coverage. A submitted application, proposed effective date, commission payment or chargeback does not establish coverage status. Existing values stay unchanged when evidence is missing or multiple applications could apply.</p>
    <GhlPolicyPreview/>
  </div>;
}
