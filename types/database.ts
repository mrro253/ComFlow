/**
 * Hand-written mirror of the `public` schema defined in
 * `supabase/migrations/0001_init.sql`.
 *
 * TODO: Once this project is linked to a real Supabase project, replace this
 * file by running `supabase gen types typescript --linked > types/database.ts`
 * to keep it in sync automatically.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Level names are defined per agency in `career_levels` (0009). */
type CareerLevelDb = string;

/**
 * Builds a Supabase table shape from a Row type. `Defaulted` lists columns that
 * have database defaults (optional on insert). Used for the carrier/earnings
 * tables added in 0005 to avoid hand-writing three near-identical interfaces each.
 */
type TableShape<Row, Defaulted extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<Row, Defaulted> & Partial<Pick<Row, Defaulted>>;
  Update: Partial<Row>;
  Relationships: [];
};

type AgentTypeDb = "career" | "independent" | "captive";
type CompensationStatusDb = "ACTIVE" | "NOT_CONFIGURED";
type EarningStatusDb = "PENDING" | "APPROVED" | "VOID";
type StatementStatusDb = "received" | "previewed" | "imported" | "failed" | "superseded";

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      agencies: {
        Row: {
          id: string;
          name: string;
          account_type: "agency" | "individual";
          onboarding_completed_at: string | null;
          /** Optional per-agency bonuses; off by default (0009). */
          bonuses_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          account_type?: "agency" | "individual";
          onboarding_completed_at?: string | null;
          bonuses_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          account_type?: "agency" | "individual";
          onboarding_completed_at?: string | null;
          bonuses_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          agency_id: string;
          first_name: string;
          last_name: string;
          email: string;
          role: "owner" | "manager" | "agent";
          agent_type: AgentTypeDb | null;
          career_level: CareerLevelDb | null;
          active: boolean;
          manager_id: string | null;
          commission_plan_id: string | null;
          /** The carrier's agent number (e.g. Ultimate W####), upper-case; unique per agency (0007). */
          payee_id: string | null;
          /** Set exactly when agent_type is "captive": the principal who is credited their production (0008). */
          principal_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          agency_id: string;
          first_name: string;
          last_name: string;
          email: string;
          role: "owner" | "manager" | "agent";
          agent_type?: AgentTypeDb | null;
          career_level?: CareerLevelDb | null;
          active?: boolean;
          manager_id?: string | null;
          commission_plan_id?: string | null;
          payee_id?: string | null;
          principal_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          first_name?: string;
          last_name?: string;
          email?: string;
          role?: "owner" | "manager" | "agent";
          agent_type?: AgentTypeDb | null;
          career_level?: CareerLevelDb | null;
          active?: boolean;
          manager_id?: string | null;
          commission_plan_id?: string | null;
          payee_id?: string | null;
          principal_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      commission_plans: {
        Row: {
          id: string;
          agency_id: string;
          name: string;
          active: boolean;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          name: string;
          active?: boolean;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          name?: string;
          active?: boolean;
          is_default?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      commission_plan_rates: {
        Row: {
          id: string;
          agency_id: string;
          commission_plan_id: string;
          role: "agent" | "manager" | "owner";
          business_type: "new" | "renewal";
          percent: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          commission_plan_id: string;
          role: "agent" | "manager" | "owner";
          business_type: "new" | "renewal";
          percent?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          commission_plan_id?: string;
          role?: "agent" | "manager" | "owner";
          business_type?: "new" | "renewal";
          percent?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      commission_plan_bonuses: {
        Row: {
          id: string;
          agency_id: string;
          commission_plan_id: string;
          role: "agent" | "manager" | "owner";
          threshold_count: number;
          bonus_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          commission_plan_id: string;
          role: "agent" | "manager" | "owner";
          threshold_count: number;
          bonus_amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          commission_plan_id?: string;
          role?: "agent" | "manager" | "owner";
          threshold_count?: number;
          bonus_amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      commission_bonus_awards: {
        Row: {
          id: string;
          agency_id: string;
          commission_plan_bonus_id: string;
          user_id: string;
          period: string;
          commission_transaction_id: string | null;
          awarded_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          commission_plan_bonus_id: string;
          user_id: string;
          period: string;
          commission_transaction_id?: string | null;
          awarded_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          commission_plan_bonus_id?: string;
          user_id?: string;
          period?: string;
          commission_transaction_id?: string | null;
          awarded_at?: string;
        };
        Relationships: [];
      };
      commission_transactions: {
        Row: {
          id: string;
          agency_id: string;
          user_id: string;
          opportunity_id: string;
          role: "agent" | "manager" | "owner" | "bonus";
          business_type: "new" | "renewal";
          sale_amount: number;
          commission_amount: number;
          commission_plan_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          user_id: string;
          opportunity_id: string;
          role: "agent" | "manager" | "owner" | "bonus";
          business_type?: "new" | "renewal";
          sale_amount: number;
          commission_amount: number;
          commission_plan_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          user_id?: string;
          opportunity_id?: string;
          role?: "agent" | "manager" | "owner" | "bonus";
          business_type?: "new" | "renewal";
          sale_amount?: number;
          commission_amount?: number;
          commission_plan_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      crm_connections: {
        Row: {
          id: string;
          agency_id: string;
          provider: string;
          access_token: string | null;
          refresh_token: string | null;
          last_sync_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          provider: string;
          access_token?: string | null;
          refresh_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          provider?: string;
          access_token?: string | null;
          refresh_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      production_entities: TableShape<
        {
          id: string;
          agency_id: string;
          name: string;
          entity_type: "agency" | "personal";
          user_id: string | null;
          created_at: string;
        },
        "id" | "user_id" | "created_at"
      >;
      writing_agent_aliases: TableShape<
        {
          id: string;
          agency_id: string;
          user_id: string;
          alias: string;
          created_at: string;
        },
        "id" | "created_at"
      >;
      carrier_connections: TableShape<
        {
          id: string;
          agency_id: string;
          user_id: string;
          carrier: string;
          status: "pending" | "active" | "needs_attention" | "disabled";
          last_sync_at: string | null;
          last_successful_sync_at: string | null;
          last_error: string | null;
          /** Set by "Sync now"; the worker clears it when it picks the request up. */
          sync_requested_at: string | null;
          created_at: string;
        },
        | "id"
        | "status"
        | "last_sync_at"
        | "last_successful_sync_at"
        | "last_error"
        | "sync_requested_at"
        | "created_at"
      >;
      carrier_credentials: TableShape<
        {
          connection_id: string;
          agency_id: string;
          ciphertext: string;
          updated_at: string;
        },
        "updated_at"
      >;
      commission_statements: TableShape<
        {
          id: string;
          agency_id: string;
          user_id: string | null;
          connection_id: string | null;
          carrier: string;
          /** Null until the statement has been parsed/imported (0006). */
          statement_month: string | null;
          source: "upload" | "portal";
          carrier_statement_id: string | null;
          original_filename: string | null;
          storage_path: string | null;
          file_hash: string;
          statement_total_cents: number | null;
          carried_balance_cents: number | null;
          transaction_count: number | null;
          status: StatementStatusDb;
          error_message: string | null;
          uploaded_by: string | null;
          imported_by: string | null;
          imported_at: string | null;
          /** Set when a corrected statement replaced this one (0007). */
          superseded_by: string | null;
          superseded_at: string | null;
          created_at: string;
        },
        | "id"
        | "superseded_by"
        | "superseded_at"
        | "statement_month"
        | "user_id"
        | "connection_id"
        | "carrier_statement_id"
        | "original_filename"
        | "storage_path"
        | "statement_total_cents"
        | "carried_balance_cents"
        | "transaction_count"
        | "status"
        | "error_message"
        | "uploaded_by"
        | "imported_by"
        | "imported_at"
        | "created_at"
      >;
      carrier_transactions: TableShape<
        {
          id: string;
          agency_id: string;
          statement_id: string;
          carrier: string;
          statement_month: string;
          carrier_member_id: string;
          effective_date: string;
          commission_type: string;
          amount_cents: number;
          transaction_key: string;
          writing_agent_name: string | null;
          writing_agent_verified: boolean;
          user_id: string | null;
          production_entity_id: string | null;
          /** Set when the statement was superseded; excluded from reporting (0007). */
          superseded_at: string | null;
          /** The captive agent who wrote the business when user_id is their principal (0008). */
          writing_user_id: string | null;
          created_at: string;
        },
        | "id"
        | "writing_agent_name"
        | "writing_agent_verified"
        | "user_id"
        | "production_entity_id"
        | "superseded_at"
        | "writing_user_id"
        | "created_at"
      >;
      compensation_rules: TableShape<
        {
          id: string;
          agency_id: string;
          agent_type: AgentTypeDb;
          career_level: CareerLevelDb | null;
          product: string;
          commission_type: string;
          calculation_method: "FIXED" | "PERCENT";
          rate_cents: number | null;
          rate_percent: number | null;
          /** What a PERCENT rule is a percent of (0009). */
          percent_basis: "ANNUAL_PREMIUM" | null;
          status: CompensationStatusDb;
          effective_from: string;
          effective_to: string | null;
          created_at: string;
        },
        | "id"
        | "career_level"
        | "rate_cents"
        | "rate_percent"
        | "percent_basis"
        | "status"
        | "effective_to"
        | "created_at"
      >;
      policy_compensation_locks: TableShape<
        {
          id: string;
          agency_id: string;
          carrier: string;
          policy_key: string;
          carrier_member_id: string;
          user_id: string;
          product: "MAPD";
          written_date: string;
          career_level_at_write: CareerLevelDb;
          sale_category: "T65" | "PLAN_CHANGE";
          sale_rate_cents: number;
          renewal_rate_cents: number;
          sale_rule_id: string;
          renewal_rule_id: string;
          evidence_reference: string;
          created_at: string;
        },
        "id" | "created_at"
      >;
      career_levels: TableShape<
        {
          id: string;
          agency_id: string;
          name: string;
          rank: number;
          visibility: "own" | "direct_reports";
          active: boolean;
          created_at: string;
        },
        "id" | "visibility" | "active" | "created_at"
      >;
      agent_earnings: TableShape<
        {
          id: string;
          agency_id: string;
          user_id: string;
          carrier_transaction_id: string;
          earned_amount_cents: number;
          payable_amount_cents: number | null;
          status: EarningStatusDb;
          created_at: string;
        },
        "id" | "payable_amount_cents" | "status" | "created_at"
      >;
      career_earning_sources: TableShape<
        {
          id: string;
          agency_id: string;
          carrier_transaction_id: string;
          policy_lock_id: string;
          agent_earning_id: string;
          earning_key: string;
          source_signature: string;
          carrier_category: string;
          renewal_month: string | null;
          evidence_reference: string;
          created_at: string;
        },
        "id" | "renewal_month" | "created_at"
      >;
      career_earning_runs: TableShape<
        {
          id: string;
          agency_id: string;
          review_signature: string;
          approved_by: string;
          earnings_created: number;
          earnings_skipped: number;
          created_at: string;
        },
        "id" | "created_at"
      >;
      audit_events: TableShape<
        {
          id: string;
          agency_id: string;
          actor_user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json;
          created_at: string;
        },
        "id" | "actor_user_id" | "entity_id" | "details" | "created_at"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      get_my_agency_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_my_role: {
        Args: Record<string, never>;
        Returns: string;
      };
      create_agency_with_owner: {
        Args: {
          p_auth_user_id: string;
          p_agency_name: string;
          p_first_name: string;
          p_last_name: string;
          p_email: string;
        };
        Returns: {
          agency_id: string;
          user_id: string;
          commission_plan_id: string | null;
        }[];
      };
      import_statement: {
        Args: {
          p_agency_id: string;
          p_statement_id: string;
          p_actor: string;
          p_statement_month: string;
          p_statement_total_cents: number;
          p_carried_balance_cents: number;
          p_rows: Json;
          /** Earlier statements this one corrects; they are marked superseded (0007). */
          p_supersedes?: string[];
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
  };
}
