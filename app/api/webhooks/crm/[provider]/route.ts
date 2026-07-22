import { NextResponse, type NextRequest } from "next/server";
import { getCRMProvider } from "@/lib/crm";
import { processEnrolledOpportunity } from "@/lib/commission-engine";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CRM webhook entrypoint: `/api/webhooks/crm/gohighlevel?agencyId=...`
 *
 * TODO before production:
 *  - Verify the request signature per-provider instead of trusting the body
 *  - Resolve `agencyId` from a signed connection lookup rather than a query
 *    param (a stored per-agency webhook secret/token, set when the CRM is
 *    connected in Settings)
 *  - Add idempotency (dedupe on opportunityId + stage) so retried webhooks
 *    don't double-pay commissions
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const agencyId = request.nextUrl.searchParams.get("agencyId");

  if (!agencyId) {
    return NextResponse.json({ error: "Missing agencyId" }, { status: 400 });
  }

  let crm;
  try {
    crm = getCRMProvider(provider);
  } catch {
    return NextResponse.json(
      { error: `Unsupported CRM provider: ${provider}` },
      { status: 400 }
    );
  }

  const payload = await request.json().catch(() => null);
  const opportunity = crm.normalizeWebhookPayload(agencyId, payload);

  if (!opportunity) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Webhooks run outside a user session, so commission writes go through
  // the admin client (bypassing RLS) rather than requireRole().
  const admin = createAdminClient();
  const transactions = await processEnrolledOpportunity(opportunity, admin);

  return NextResponse.json({ ok: true, transactions: transactions ?? [] });
}
