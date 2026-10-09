import { ultimatePortal } from "./ultimate.js";
import type { CarrierPortal } from "./types.js";

/** Add a carrier by implementing CarrierPortal and listing it here. */
const PORTALS: readonly CarrierPortal[] = [ultimatePortal];

export function getPortal(carrier: string): CarrierPortal | null {
  return PORTALS.find((portal) => portal.carrier === carrier) ?? null;
}
