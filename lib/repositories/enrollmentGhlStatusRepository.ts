import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollmentLinkId } from "@/lib/crm/gohighlevel/contactLinks";
import { applicationFingerprint } from "@/lib/enrollments/applicationOutcome";
import { readAuthorizedSaleSource } from "./saleDispositionRepository";
import type { CurrentUser } from "@/types/domain";
import type { SunfireEnrollment } from "@/lib/enrollments/sunfire";

export type EnrollmentGhlStatus="linked"|"not_linked"|"not_connected"|"not_assigned"|"recheck"|"unavailable";
export const enrollmentGhlKey=(sale:{ownerId:string;code:string})=>`${sale.ownerId}/${sale.code}`;
type Sale={ownerId:string;code:string;collectionHash:string;source?:SunfireEnrollment};
/** Reads saved local links for already-authorized enrollments. Never decrypts tokens or calls GHL. */
export async function enrollmentGhlStatuses(user:CurrentUser,sales:Sale[]):Promise<Map<string,EnrollmentGhlStatus>>{
  if(!user.active||!["owner","agent"].includes(user.role))throw new Error("Active account required.");
  if(sales.length>500)throw new Error("Link status batch limit exceeded.");
  const fill=(status:EnrollmentGhlStatus)=>new Map(sales.map(s=>[enrollmentGhlKey(s),status]));
  if(!sales.length)return fill("not_linked");
  const db=await createClient();
  const {data:connections,error}=await db.from("ghl_connections").select("id,location_id").eq("agency_id",user.agencyId).eq("mode","shared");
  if(error)throw new Error("GHL metadata unavailable.");
  // Unmapped agents cannot see shared metadata through RLS; don't disclose its existence.
  if(!connections?.length)return fill("not_connected");
  if(connections.length!==1)throw new Error("Ambiguous connection.");
  const connection=connections[0];
  const {data:mapping,error:mappingError}=await db.from("ghl_agent_mappings").select("ghl_user_id").eq("agency_id",user.agencyId).eq("connection_id",connection.id).eq("user_id",user.id).maybeSingle();
  if(mappingError)throw new Error("GHL assignment unavailable.");
  if(!mapping)return fill("not_assigned");
  const refs=new Map(sales.map(s=>[enrollmentLinkId(user.agencyId,user.id,connection.id,s),s]));
  const result=fill("not_linked"),ids=[...refs.keys()];
  for(let start=0;start<ids.length;start+=100){
    const {data:events,error:eventError}=await createAdminClient().from("audit_events").select("id,details").eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("action","ghl.enrollment_link_confirmed").eq("entity_type","sunfire_enrollment").in("id",ids.slice(start,start+100));
    if(eventError)throw new Error("Saved link status unavailable.");
    for(const event of events??[]){
      const sale=refs.get(event.id);if(!sale)throw new Error("Unexpected saved link.");
      const d=event.details as Record<string,unknown>|null;
      const key=enrollmentGhlKey(sale);
      if(!d||d.version!==1||d.connectionId!==connection.id||d.locationId!==connection.location_id||d.ghlUserId!==mapping.ghl_user_id||d.ownerId!==sale.ownerId||d.code!==sale.code||d.basis!=="fresh_full_mbi_verified"||typeof d.contactId!=="string"||typeof d.collectionHash!=="string"||!/^[a-f0-9]{64}$/.test(d.collectionHash)) {result.set(key,"recheck");continue;}
      if(d.collectionHash===sale.collectionHash){result.set(key,"linked");continue;}
      // Recollection alone must not erase an application's link. Changed source evidence stays explicit.
      try{
        if(!sale.source)throw new Error();
        const original=await readAuthorizedSaleSource(user,sale.ownerId,d.collectionHash,sale.code);
        result.set(key,applicationFingerprint(original)===applicationFingerprint(sale.source)?"linked":"recheck");
      }catch{result.set(key,"recheck");}
    }
  }
  return result;
}
