/**
 * Carrier portal abstraction for the worker. Each carrier implements `CarrierPortal`;
 * the worker only knows this interface. Parsing the PDF is NOT the worker's job -
 * it only fetches the files. The web app parses them (lib/carriers/*).
 */

export interface CarrierLogin {
  username: string;
  password: string;
}

export interface PortalStatement {
  /** Stable id for "have we already downloaded this one?" (carrier-specific). */
  carrierStatementId: string;
  filename: string;
  pdf: Buffer;
}

export interface PullOptions {
  years: number[];
  /** True when this statement id was already downloaded for this connection. */
  isKnown(carrierStatementId: string): boolean;
  /** Called once per newly downloaded statement. May throw; the portal records the failure and continues. */
  onStatement(statement: PortalStatement): Promise<void>;
  log(message: string): void;
}

export interface PullSummary {
  found: number;
  downloaded: number;
  skipped: number;
  failed: number;
}

export interface CarrierPortal {
  /** Must equal the carrier name used by the web app (lib/carriers/index.ts). */
  readonly carrier: string;
  pull(login: CarrierLogin, options: PullOptions): Promise<PullSummary>;
}

/** Error whose message is safe to show to users and store in the database. */
export class SafePortalError extends Error {}
