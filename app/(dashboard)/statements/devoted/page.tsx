import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { DevotedReviewForm } from "@/components/statements/devoted-review-form";
import { listDevotedInbox } from "@/lib/repositories/devotedInboxRepository";
export default async function DevotedReviewPage({ searchParams }: { searchParams: Promise<{ connection?: string; pair?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner" || process.env.DEVOTED_REVIEW_ENABLED !== "true") redirect("/statements");
  const inbox = await listDevotedInbox(user);
  const params = await searchParams;
  const selected = inbox.find((pair) => pair.connectionId === params.connection && pair.pairHash === params.pair);
  return <div className="mx-auto max-w-4xl space-y-5"><h1 className="text-2xl font-semibold">Devoted paired statement review</h1><p className="text-sm text-muted-foreground">Sync saves PDF and workbook pairs privately. Preview checks both sources; commission records change only after approval. Supports the verified single-row monthly-renewal layout; other layouts stop for review.</p>
    <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Downloaded pairs awaiting review ({inbox.length})</h2>{inbox.length === 0 ? <p className="text-sm">No new downloaded pairs. Already imported pairs are excluded.</p> : <ul className="space-y-2">{inbox.map((pair) => <li key={pair.pairHash}><Link className="underline" href={`/statements/devoted?connection=${pair.connectionId}&pair=${pair.pairHash}`}>Review statement dated {pair.payDate}</Link></li>)}</ul>}<Link className="text-sm underline" href="/carriers">Carrier connections</Link></section>
    <DevotedReviewForm key={selected?.pairHash ?? "upload"} savedPair={selected} importEnabled={process.env.DEVOTED_IMPORT_REVIEW_ENABLED === "true"} />
    {selected && <Link className="text-sm underline" href="/statements/devoted">Upload a different pair</Link>}
  </div>;
}
