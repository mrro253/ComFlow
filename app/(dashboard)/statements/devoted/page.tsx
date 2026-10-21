import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { DevotedReviewForm } from "@/components/statements/devoted-review-form";
export default async function DevotedReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner" || process.env.DEVOTED_REVIEW_ENABLED !== "true") redirect("/statements");
  return <div className="mx-auto max-w-4xl space-y-5"><h1 className="text-2xl font-semibold">Devoted paired statement review</h1><p className="text-sm text-muted-foreground">Review one PDF and its matching workbook. Preview does not save sources or import commission records. This review build supports the verified single-row monthly-renewal layout only. Other layouts stop for review.</p><DevotedReviewForm importEnabled={process.env.DEVOTED_IMPORT_REVIEW_ENABLED === "true"} /></div>;
}
