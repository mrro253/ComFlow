import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghlPreviewAccess } from "./ghlPreviewRepository";
import type { CurrentUser } from "@/types/domain";
import type { Database,Json } from "@/types/database";
import type { StatusWritePlan } from "@/lib/crm/gohighlevel/statusWritePlan";
export type PolicyOperation=Database["public"]["Tables"]["ghl_policy_operations"]["Row"];
type Access=Awaited<ReturnType<typeof ghlPreviewAccess>>;
async function scope(user:CurrentUser,expected:Access){const current=await ghlPreviewAccess(user);if(current.connectionId!==expected.connectionId||current.ghlUserId!==expected.ghlUserId||current.locationId!==expected.locationId||current.token!==expected.token)throw new Error("Connection changed.");}
function validate(op:PolicyOperation,user:CurrentUser,access:Access){if(!op||op.agency_id!==user.agencyId||op.actor_user_id!==user.id||op.connection_id!==access.connectionId||op.location_id!==access.locationId||op.ghl_user_id!==access.ghlUserId)throw new Error("Operation access denied.");return op;}
async function change(user:CurrentUser,access:Access,action:string,data:Json){
  await scope(user,access);
  const {data:op,error}=await createAdminClient().rpc("manage_ghl_policy_operation",{p_actor:user.id,p_agency:user.agencyId,p_action:action,p_data:data});
  if(error||!op)throw new Error("Policy operation could not be saved. Another update may be running or access may have changed.");return validate(op as unknown as PolicyOperation,user,access);
}
export async function preparePolicyOperation(user:CurrentUser,access:Access,plan:StatusWritePlan){return change(user,access,"prepare",{id:randomUUID(),...plan});}
export async function readPolicyOperation(user:CurrentUser,access:Access,id:string){
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error("Invalid operation.");await scope(user,access);
  const {data,error}=await createAdminClient().from("ghl_policy_operations").select("*").eq("id",id).eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("connection_id",access.connectionId).maybeSingle();
  if(error||!data)throw new Error("Operation unavailable.");return validate(data,user,access);
}
export async function pendingPolicyOperations(user:CurrentUser,access:Access){
  await scope(user,access);
  const {data,error}=await createAdminClient().from("ghl_policy_operations").select("*").eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("connection_id",access.connectionId).not("phase","in","(completed,cancelled)").order("created_at",{ascending:false}).limit(101);
  if(error)throw new Error("Write setup is waiting for its database update.");if((data?.length??0)>100)throw new Error("Operation review limit exceeded.");return (data??[]).map(op=>validate(op,user,access));
}
export async function claimPolicyOperation(user:CurrentUser,access:Access,id:string,leaseId:string){return change(user,access,"claim",{id,leaseId});}
export async function checkpointPolicyOperation(user:CurrentUser,access:Access,id:string,leaseId:string,phase:string,noteId?:string){return change(user,access,"checkpoint",{id,leaseId,phase,...(noteId?{noteId}:{})});}
export async function releasePolicyOperation(user:CurrentUser,access:Access,id:string,leaseId:string,error:"paused"|"note_unconfirmed"|"write_unconfirmed"|"access_changed"|"stale_review"="paused"){return change(user,access,"release",{id,leaseId,error});}
