import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptGhlToken } from "@/lib/crm/gohighlevel/setupToken";
import type { CurrentUser } from "@/types/domain";

export async function ghlPreviewAccess(user:CurrentUser) {
  if(!user.active||!["owner","agent"].includes(user.role))throw new Error("Active agent required.");
  const db=await createClient();
  const {data:connections,error}=await db.from("ghl_connections").select("*").eq("agency_id",user.agencyId).eq("mode","shared");
  if(error||connections?.length!==1)throw new Error("Connect your agency sub-account first.");
  const connection=connections[0];
  const {data:mapping,error:mappingError}=await db.from("ghl_agent_mappings").select("*").eq("connection_id",connection.id).eq("agency_id",user.agencyId).eq("user_id",user.id).maybeSingle();
  if(mappingError||!mapping)throw new Error("Ask your agency owner to assign your GHL User ID first.");
  // Session-scoped metadata and self mapping must succeed before accessing the encrypted secret.
  const {data:secret,error:secretError}=await createAdminClient().from("ghl_credentials").select("ciphertext").eq("connection_id",connection.id).single();
  if(secretError||!secret)throw new Error("Connection unavailable.");
  return {connectionId:connection.id,locationId:connection.location_id,locationName:connection.location_name,ghlUserId:mapping.ghl_user_id,token:decryptGhlToken(secret.ciphertext,{id:connection.id,agencyId:connection.agency_id,userId:connection.user_id,locationId:connection.location_id})};
}
