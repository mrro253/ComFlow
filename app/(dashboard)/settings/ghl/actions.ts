"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { verifyGhlLocation,verifyGhlUser,validGhlId } from "@/lib/crm/gohighlevel/setupClient";
import { encryptGhlToken } from "@/lib/crm/gohighlevel/setupToken";
import { changeGhlSetup,ownGhlConnection,sharedGhlToken } from "@/lib/repositories/ghlSetupRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
export interface GhlSetupResult {info?:string;error?:string}
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function saveGhlConnection(_previous:GhlSetupResult,form:FormData):Promise<GhlSetupResult> {
  try {
    const user=await requireRole();
    const mode=String(form.get("mode")??""), locationId=String(form.get("locationId")??"").trim(),token=String(form.get("token")??"").trim();
    if(!["personal","shared"].includes(mode) || (mode==="shared" && user.role!=="owner"))return {error:"Only the agency owner can connect a shared location."};
    const location=await verifyGhlLocation(locationId,token);
    const id=randomUUID();
    const ciphertext=encryptGhlToken(token,{id,agencyId:user.agencyId,userId:user.id,locationId});
    await changeGhlSetup(user,"save",{id,mode,locationId,locationName:location.name,ciphertext});
    revalidatePath("/settings/ghl");
    return {info:"Connection verified and saved securely. No GHL contacts were read or changed."};
  } catch { return {error:"Could not verify and save GHL. Check your Location ID, token, read permissions and secure storage configuration. Your previous connection was retained."}; }
}
export async function manageGhlSetup(_previous:GhlSetupResult,form:FormData):Promise<GhlSetupResult> {
  try {
    const user=await requireRole(); const id=String(form.get("id")??""),action=String(form.get("action")??"");
    if(!uuid(id) || !["disconnect","map","unmap"].includes(action))return {error:"Choose a valid setup action."};
    await ownGhlConnection(user,id);
    if(action==="disconnect") await changeGhlSetup(user,"disconnect",{id});
    else {
      if(user.role!=="owner")return {error:"Only the agency owner can map shared users."};
      const userId=String(form.get("userId")??""),ghlUserId=String(form.get("ghlUserId")??"").trim();
      const team=await listUsersForAgency(user.agencyId);
      if(!uuid(userId) || !team.some(person=>person.id===userId && person.active))return {error:"Choose an active teammate."};
      if(action==="map") {
        if(!validGhlId(ghlUserId))return {error:"Enter a valid GHL user ID."};
        const {connection,token}=await sharedGhlToken(user,id);
        await verifyGhlUser(connection.location_id,ghlUserId,token);
        await changeGhlSetup(user,"map",{id,userId,ghlUserId});
      } else await changeGhlSetup(user,"unmap",{id,userId});
    }
    revalidatePath("/settings/ghl"); return {info:"Setup updated. No GHL contacts were read or changed."};
  } catch {return {error:"Setup was not changed. Check your access and the GHL user’s membership in this location. Shared tokens need users.readonly for mapping."};}
}
