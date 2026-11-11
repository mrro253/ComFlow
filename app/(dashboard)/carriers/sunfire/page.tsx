import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSunfireReview } from "@/lib/services/sunfireCollectionService";
import { formatDate } from "@/lib/utils";

export default async function SunfireReviewPage({ searchParams }: { searchParams: Promise<{ collection?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.active || user.role !== "owner") redirect("/carriers");
  const params = await searchParams;
  let review;
  try { review = await getSunfireReview(user, params.collection); }
  catch { return <div className="space-y-4"><h1 className="text-2xl font-semibold">SunFire enrollments</h1><p>We couldn’t verify this collection. No client or commission records have changed.</p><Link className="underline" href="/carriers/sunfire">Recent SunFire collections</Link></div>; }
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">SunFire enrollments</h1><p className="mt-2 text-sm text-muted-foreground">Collected enrollment details for review. Proposed effective dates and SunFire submission status do not confirm active coverage or commission eligibility. Nothing on this page changes client or commission records.</p></div>
    <Link href="/carriers" className="text-sm underline">Back to carrier connections</Link>
    <p><Link className="font-medium underline" href={review.current ? `/carriers/sunfire/matches?collection=${review.current.hash}` : "/carriers/sunfire/matches"}>Review commission candidates and chargebacks</Link></p>
    {review.collections.length === 0 ? <p className="rounded-lg border p-5">No complete enrollment collections yet. Save your SunFire login in Carrier connections, then choose Sync enrollments.</p> : <>
      <section className="rounded-lg border p-4 space-y-2"><h2 className="font-semibold">Verified enrollment details ({review.rows.length})</h2><p className="text-sm">Enrollment dates checked: {review.range?.start} through {review.range?.end}</p><p className="text-sm text-muted-foreground">Full MBIs are preserved in the private source. Only the last four characters are shown here.</p></section>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr>{["Client", "Carrier", "Plan", "Proposed effective date", "Medicare ID (MBI)", "Submitted", "Submission status"].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{review.rows.map((row) => <tr className="border-t" key={row.code}><td className="p-3 font-medium">{row.firstName} {row.lastName}</td><td className="p-3">{row.carrier}</td><td className="min-w-64 p-3">{row.plan}</td><td className="p-3">{row.proposedEffectiveDate}</td><td className="p-3 whitespace-nowrap">{row.mbiDisplay}</td><td className="p-3">{row.submittedDate}</td><td className="p-3">{row.status}</td></tr>)}</tbody></table></div>
      <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Recent collections (up to 50)</summary><ul className="mt-3 space-y-2">{review.collections.map((collection) => <li key={collection.hash}><Link className="text-sm underline" href={`/carriers/sunfire?collection=${collection.hash}`}>{collection.hash === review.current?.hash ? "Viewing: " : "View collection: "}{collection.collectedAt ? formatDate(collection.collectedAt) : "Date unavailable"}</Link></li>)}</ul></details>
    </>}
  </div>;
}
