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
          onboarding_completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          onboarding_completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          onboarding_completed_at?: string | null;
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
          manager_id: string | null;
          commission_plan_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          agency_id: string;
          first_name: string;
          last_name: string;
          email: string;
          role: "owner" | "manager" | "agent";
          manager_id?: string | null;
          commission_plan_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          first_name?: string;
          last_name?: string;
          email?: string;
          role?: "owner" | "manager" | "agent";
          manager_id?: string | null;
          commission_plan_id?: string | null;
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
    };
    Enums: Record<string, never>;
  };
}
