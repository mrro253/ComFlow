import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptGhlToken } from "@/lib/crm/gohighlevel/setupToken";
import type { CurrentUser } from "@/types/domain";
import type { Json } from "@/types/database";

export async function listGhlSetup() {
  const db=await createClient();
  const [connections,mappings]=await Promise.all([
    db.from("ghl_connections").select("id,agency_id,user_id,mode,location_id,location_name,verified_at,created_at"),
    db.from("ghl_agent_mappings").select("connection_id,agency_id,user_id,ghl_user_id,verified_at"),
  ]);
  if(connections.error || mappings.error)throw new Error("GHL setup is unavailable. The database setup may still be pending.");
  return {connections:connections.data??[],mappings:mappings.data??[]};
}
export async function ownGhlConnection(user:CurrentUser,id:string) {
  const db=await createClient();
  const {data,error}=await db.from("ghl_connections").select("*").eq("id",id).eq("agency_id",user.agencyId).maybeSingle();
  if(error || !data || (data.mode==="shared" ? user.role!=="owner" : data.user_id!==user.id))throw new Error("You cannot manage this GHL connection.");
  return data;
}
export async function sharedGhlToken(user:CurrentUser,id:string) {
  const connection=await ownGhlConnection(user,id);
  if(connection.mode!=="shared" || user.role!=="owner")throw new Error("Shared setup requires the agency owner.");
  const {data,error}=await createAdminClient().from("ghl_credentials").select("ciphertext").eq("connection_id",connection.id).single();
  if(error || !data)throw new Error("Stored GHL access is unavailable. Replace the connection.");
  return {connection,token:decryptGhlToken(data.ciphertext,{id:connection.id,agencyId:connection.agency_id,userId:connection.user_id,locationId:connection.location_id})};
}
export async function changeGhlSetup(user:CurrentUser,action:"save"|"disconnect"|"map"|"unmap",data:Json) {
  const {error}=await createAdminClient().rpc("manage_ghl_connection",{p_actor:user.id,p_agency:user.agencyId,p_action:action,p_data:data});
  if(error)throw new Error("GHL setup could not be saved. Check your access, teammate mapping, and try again.");
}
