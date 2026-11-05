"use server";
import {requireRole} from "@/lib/auth/requireRole";
import {createAdminClient} from "@/lib/supabase/admin";
import {revalidatePath} from "next/cache";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export interface PolicyOwnerReview {entryId:string;carrier:string;effectiveDate:string;ownerId:string|null;writerName:string|null;count:number;locked:boolean;ruleVersion:number;reviewHash:string}
export async function reviewPolicyOwner(entryId:string):Promise<{review?:PolicyOwnerReview;error?:string}>{
 try{if(typeof entryId!=="string"||!uuid.test(entryId))throw new Error();const actor=await requireRole(["owner"]),r=await createAdminClient().rpc("review_policy_commission_owner",{p_actor:actor.id,p_agency:actor.agencyId,p_entry:entryId});if(r.error||!r.data)throw new Error();return {review:r.data as unknown as PolicyOwnerReview};}catch{return {error:"Ownership review is unavailable. Refresh the entry or check agency-owner access."};}
}
export async function savePolicyOwner(input:{entryId:string;ownerId:string;reason:string;reviewHash:string}){
 try{if(!input||!uuid.test(input.entryId)||!uuid.test(input.ownerId)||typeof input.reason!=="string"||!input.reason.trim()||input.reason.trim().length>1000||typeof input.reviewHash!=="string"||!/^[a-f0-9]{64}$/.test(input.reviewHash))throw new Error();
 const actor=await requireRole(["owner"]),r=await createAdminClient().rpc("save_policy_commission_owner",{p_actor:actor.id,p_agency:actor.agencyId,p_entry:input.entryId,p_owner:input.ownerId,p_reason:input.reason.trim(),p_review_hash:input.reviewHash});if(r.error||!r.data)return {error:"Ownership was not changed. Refresh the review; existing earnings, compensation locks, pending GHL work or an unavailable recipient may block it."};
 for(const path of ["/payments","/dashboard","/sales","/reports","/settings/ghl/coverage"])revalidatePath(path);
 return {ok:true,changed:(r.data as {changed?:number}).changed??0};
 }catch{return {error:"Choose a valid commission owner and provide an explanation, then review again."};}
}
