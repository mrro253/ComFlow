import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { GhlContactPreview } from "@/components/settings/ghl-contact-preview";
export default async function GhlContactPreviewPage(){
  await requireRole(["owner","agent"]);
  return <div className="max-w-3xl space-y-5"><Link className="text-sm underline" href="/settings/ghl">Back to GHL setup</Link><h1 className="text-2xl font-semibold">GHL contact-matching preview</h1>
    <p>Compare your accessible enrollments with contacts assigned to your verified GHL user. This preview does not link records, import contacts, update policy status or create notes.</p>
    <p className="text-sm text-muted-foreground">Name candidates need identity confirmation. No candidate found means no matching full name was found in this search; it does not prove that the client is absent from GHL. Each application stays separate.</p>
    <GhlContactPreview/>
  </div>;
}
