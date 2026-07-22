import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { Agency } from "@/types/domain";

type AgencyRow = Database["public"]["Tables"]["agencies"]["Row"];

function mapAgencyRow(row: AgencyRow): Agency {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function createAgency(name: string): Promise<Agency> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .insert({ name })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create agency");
  }
  return mapAgencyRow(data);
}

export async function getAgencyById(id: string): Promise<Agency | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapAgencyRow(data);
}
