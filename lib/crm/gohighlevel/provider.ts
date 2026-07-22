import type { NormalizedOpportunity } from "@/lib/commission-engine/types";
import { ENROLLED_STAGE } from "@/lib/commission-engine/types";
import type { ICRMProvider } from "@/lib/crm/types";

/**
 * GoHighLevel adapter - the only CRM provider supported in the MVP.
 *
 * TODO: This is a scaffold. Real implementation still needed:
 *  - OAuth 2.0 authorization code exchange (`exchangeCodeForTokens`)
 *  - Webhook signature verification
 *  - Mapping GHL's actual "Opportunity Stage Changed" webhook shape and
 *    custom field for sale amount
 *  - Pagination-aware `getOpportunity` call against the GHL REST API
 */
export class GoHighLevelProvider implements ICRMProvider {
  readonly id = "gohighlevel" as const;

  normalizeWebhookPayload(
    agencyId: string,
    payload: unknown
  ): NormalizedOpportunity | null {
    // GoHighLevel's real webhook shape is nested under `opportunity` with
    // fields like `pipelineStageId`. We accept a simplified flat shape here
    // so the rest of the architecture (route handler -> commission engine)
    // can be exercised end-to-end before the real mapping is implemented.
    const body = payload as {
      opportunityId?: string;
      stageName?: string;
      monetaryValue?: number;
      assignedUserId?: string;
      // TODO: GoHighLevel doesn't have a first-class "new vs renewal"
      // concept - this assumes the agency maps it to a custom field named
      // `businessType` on the opportunity. Defaults to "new" until that
      // mapping is confirmed with a real GHL account.
      businessType?: "new" | "renewal";
    } | null;

    if (!body?.opportunityId || !body?.assignedUserId) {
      return null;
    }

    return {
      opportunityId: body.opportunityId,
      agencyId,
      agentUserId: body.assignedUserId,
      stage: body.stageName ?? "",
      saleAmount: body.monetaryValue ?? 0,
      businessType: body.businessType ?? "new",
    };
  }

  async exchangeCodeForTokens(
    _code: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // TODO: POST to GoHighLevel's OAuth token endpoint.
    throw new Error("GoHighLevel OAuth is not implemented yet.");
  }

  async getOpportunity(
    _agencyId: string,
    _opportunityId: string
  ): Promise<NormalizedOpportunity | null> {
    // TODO: call GET /opportunities/:id on the GoHighLevel API.
    throw new Error("GoHighLevel getOpportunity is not implemented yet.");
  }
}

/** Re-exported for readability at call sites that only need the constant. */
export { ENROLLED_STAGE };
