import { createAdminClient } from "@/lib/supabase/admin";
import { ghlPreviewAccess } from "./ghlPreviewRepository";
import { enrollmentLinkId,type GhlEnrollmentLink } from "@/lib/crm/gohighlevel/contactLinks";
import type { CurrentUser } from "@/types/domain";
import type { Json } from "@/types/database";
import { readAuthorizedSaleSource } from "./saleDispositionRepository";
const action="ghl.enrollment_link_confirmed";
type Access=Awaited<ReturnType<typeof ghlPreviewAccess>>;
async function check(user:CurrentUser,expected:Access){
  const current=await ghlPreviewAccess(user);
  if(current.connectionId!==expected.connectionId||current.locationId!==expected.locationId||current.ghlUserId!==expected.ghlUserId||current.token!==expected.token)throw new Error("Connection changed. Refresh the preview.");
}
async function saved(user:CurrentUser,access:Access,link:GhlEnrollmentLink){
  const {data,error}=await createAdminClient().from("audit_events").select("details").eq("id",enrollmentLinkId(user.agencyId,user.id,access.connectionId,link)).eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("action",action).maybeSingle();
  if(error)throw new Error("Could not read saved links.");
  if(!data)return false;
  const details=data.details as Record<string,unknown>;
  if(details.version!==1||details.contactId!==link.contactId||details.locationId!==access.locationId||details.ghlUserId!==access.ghlUserId||details.ownerId!==link.ownerId||details.code!==link.code)throw new Error("An existing link has different identity evidence. It was not replaced.");
  return true;
}
export async function savedGhlLinks(user:CurrentUser,access:Access,links:GhlEnrollmentLink[]){
  await check(user,access);const codes:string[]=[];
  for(const link of links)if(await saved(user,access,link))codes.push(`${link.ownerId}/${link.code}`);
  return codes;
}
export async function readGhlEnrollmentLink(user:CurrentUser,access:Access,ref:{ownerId:string;code:string}){
  await check(user,access);
  const {data,error}=await createAdminClient().from("audit_events").select("details").eq("id",enrollmentLinkId(user.agencyId,user.id,access.connectionId,ref)).eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("action",action).eq("entity_type","sunfire_enrollment").maybeSingle();
  if(error)throw new Error("Saved link unavailable.");if(!data)return null;
  const d=data.details as Record<string,unknown>|null;
  if(!d||d.version!==1||d.connectionId!==access.connectionId||d.locationId!==access.locationId||d.ghlUserId!==access.ghlUserId||d.ownerId!==ref.ownerId||d.code!==ref.code||d.basis!=="fresh_full_mbi_verified"||typeof d.contactId!=="string"||!/^[A-Za-z0-9]{6,80}$/.test(d.contactId))throw new Error("Saved link requires recheck.");
  return {contactId:d.contactId};
}
export async function appendGhlLinks(user:CurrentUser,access:Access,links:GhlEnrollmentLink[]){
  // Append-only records in the existing audit trail. No financial, enrollment-source or GHL rows change.
  let added=0;
  for(const link of links){
    await check(user,access);
    await readAuthorizedSaleSource(user,link.ownerId,link.collectionHash,link.code);
    if(await saved(user,access,link))continue;
    const details={version:1,connectionId:access.connectionId,locationId:access.locationId,ghlUserId:access.ghlUserId,...link,basis:"fresh_full_mbi_verified"} satisfies Record<string,Json>;
    const {error}=await createAdminClient().from("audit_events").insert({id:enrollmentLinkId(user.agencyId,user.id,access.connectionId,link),agency_id:user.agencyId,actor_user_id:user.id,action,entity_type:"sunfire_enrollment",entity_id:link.code,details});
    if(error){if(error.code!=="23505"||!await saved(user,access,link))throw new Error("Link save stopped. Refresh before retrying.");}
    else added++;
  }
  return added;
}
