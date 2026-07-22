import { GoHighLevelProvider } from "@/lib/crm/gohighlevel/provider";
import type { ICRMProvider } from "@/lib/crm/types";
import type { CRMProviderId } from "@/types/domain";

export type { ICRMProvider } from "@/lib/crm/types";

const providers: Record<CRMProviderId, () => ICRMProvider> = {
  gohighlevel: () => new GoHighLevelProvider(),
};

/**
 * Factory for resolving a CRM adapter by provider id. This is the only
 * place that needs to change when a new CRM is added - callers (webhook
 * route, sync jobs, business logic) never construct a provider directly.
 */
export function getCRMProvider(provider: string): ICRMProvider {
  const factory = providers[provider as CRMProviderId];
  if (!factory) {
    throw new Error(`Unsupported CRM provider: ${provider}`);
  }
  return factory();
}
