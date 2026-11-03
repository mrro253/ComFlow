import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { GhlContactPreview } from "@/components/settings/ghl-contact-preview";
export default async function GhlContactPreviewPage(){
  await requireRole(["owner","agent"]);
  return <div className="max-w-3xl space-y-5"><Link className="text-sm underline" href="/settings/ghl">Back to GHL setup</Link><h1 className="text-2xl font-semibold">GHL contact-matching preview</h1>
    <p>Compare your accessible enrollments with contacts assigned to your verified GHL user. This preview does not link records, import contacts, update policy status or create notes.</p>
    <p className="text-sm text-muted-foreground">Contact Matched in GHL means the enrollment name and full MBI agree with a GHL contact. No Contact Found in GHL means this search did not find one among your assigned contacts; the client may have a different name or be assigned to another user. Each application stays separate, and nothing is linked yet.</p>
    <GhlContactPreview/>
  </div>;
}
