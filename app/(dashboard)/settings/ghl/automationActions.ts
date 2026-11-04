"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { ghlPreviewAccess } from "@/lib/repositories/ghlPreviewRepository";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGhlUser } from "@/lib/crm/gohighlevel/setupClient";
export async function ghlAutomationState(){
 const user=await requireRole(["owner","agent"]),access=await ghlPreviewAccess(user),db=createAdminClient();
 const [setting,jobs]=await Promise.all([
  db.from("ghl_import_automation_settings").select("enabled").eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("connection_id",access.connectionId).maybeSingle(),
  db.from("ghl_import_jobs").select("id,state,summary,created_at,updated_at,statement_id,attempts,next_attempt_at,last_error").eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("connection_id",access.connectionId).order("created_at",{ascending:false}).limit(20),
 ]);
 if(setting.error||jobs.error)throw new Error("Automatic GHL setup is waiting for its database update.");
 const ids=[...new Set((jobs.data??[]).map(j=>j.statement_id))];
 const statements=ids.length?await db.from("commission_statements").select("id,carrier,statement_month").eq("agency_id",user.agencyId).in("id",ids):{data:[],error:null};
 if(statements.error)throw new Error("Statement labels are unavailable. Try again.");
 return {enabled:setting.data?.enabled??false,jobs:(jobs.data??[]).map(j=>({...j,statement:statements.data?.find(s=>s.id===j.statement_id)??null}))};
}
export async function setGhlImportAutomation(enabled:boolean){
 try{if(typeof enabled!=="boolean")throw new Error();const user=await requireRole(["owner","agent"]),access=await ghlPreviewAccess(user);await verifyGhlUser(access.locationId,access.ghlUserId,access.token);
  const r=await createAdminClient().from("ghl_import_automation_settings").upsert({agency_id:user.agencyId,actor_user_id:user.id,connection_id:access.connectionId,enabled,updated_at:new Date().toISOString()},{onConflict:"actor_user_id,connection_id"});if(r.error)throw new Error();return {ok:true};
 }catch{return {error:"Automatic GHL processing could not be changed. Check your saved connection and assignment."};}
}
export async function resumeGhlImportJob(id:string){
 try{if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error();const user=await requireRole(["owner","agent"]),access=await ghlPreviewAccess(user),state=await ghlAutomationState();if(!state.enabled)throw new Error();
  const r=await createAdminClient().from("ghl_import_jobs").update({state:"queued",attempts:0,next_attempt_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("id",id).eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("connection_id",access.connectionId).eq("state","needs_attention").select("id").maybeSingle();if(r.error||!r.data)throw new Error();return {ok:true};
 }catch{return {error:"This job cannot currently resume. Check automatic processing and its original statement."};}
}
