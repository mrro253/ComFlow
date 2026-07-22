import type { NormalizedOpportunity } from "@/lib/commission-engine/types";
import type { CRMProviderId } from "@/types/domain";

/**
 * Abstraction every CRM integration must implement. Business logic (the
 * commission engine) only ever talks to this interface, never to a
 * provider's SDK/API directly - adding HubSpot, Salesforce, Zoho, or
 * Pipedrive later means writing a new adapter here, with zero changes to
 * `lib/commission-engine`.
 */
export interface ICRMProvider {
  readonly id: CRMProviderId;

  /**
   * Converts a provider-specific webhook payload into the shape the
   * commission engine understands. Returns `null` if the payload isn't a
   * relevant event (e.g. an update to a stage other than "Enrolled").
   */
  normalizeWebhookPayload(
    agencyId: string,
    payload: unknown
  ): NormalizedOpportunity | null;

  /**
   * Exchanges an OAuth `code` for tokens during the "Connect CRM" flow.
   * TODO: implement real OAuth for GoHighLevel; stubbed for MVP scaffold.
   */
  exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }>;

  /**
   * Fetches a single opportunity by id directly from the CRM API (used for
   * backfills/manual re-sync rather than relying solely on webhooks).
   * TODO: implement real API call for GoHighLevel.
   */
  getOpportunity(
    agencyId: string,
    opportunityId: string
  ): Promise<NormalizedOpportunity | null>;
}
