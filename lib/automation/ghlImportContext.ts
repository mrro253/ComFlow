import { AsyncLocalStorage } from "node:async_hooks";
import { createAdminClient } from "@/lib/supabase/admin";
export interface GhlImportScope {jobId:string;leaseId:string;actorId:string;agencyId:string}
const context=new AsyncLocalStorage<GhlImportScope>();
/** Only trusted queue consumers can enter this server-only context. No request header/cookie can set it. */
export function withGhlImportScope<T>(scope:GhlImportScope,run:()=>Promise<T>){return context.run(Object.freeze({...scope}),run);}
export async function ghlImportActor(){
 const scope=context.getStore();if(!scope)return null;
 const db=createAdminClient(),r=await db.from("ghl_import_jobs").select("*").eq("id",scope.jobId).eq("agency_id",scope.agencyId).eq("actor_user_id",scope.actorId).eq("lease_id",scope.leaseId).eq("state","running").gt("lease_until",new Date().toISOString()).maybeSingle();
 if(r.error||!r.data)throw new Error("Automatic GHL job lease unavailable.");const job=r.data;
 const [u,a,c,m,s,t]=await Promise.all([
  db.from("users").select("*").eq("id",scope.actorId).eq("agency_id",scope.agencyId).eq("role","owner").eq("active",true).maybeSingle(),
  db.from("ghl_import_automation_settings").select("enabled").eq("agency_id",scope.agencyId).eq("actor_user_id",scope.actorId).eq("connection_id",job.connection_id).eq("enabled",true).maybeSingle(),
  db.from("ghl_connections").select("location_id").eq("id",job.connection_id).eq("agency_id",scope.agencyId).eq("mode","shared").eq("location_id",job.location_id).maybeSingle(),
  db.from("ghl_agent_mappings").select("ghl_user_id").eq("agency_id",scope.agencyId).eq("connection_id",job.connection_id).eq("user_id",scope.actorId).eq("ghl_user_id",job.ghl_user_id).maybeSingle(),
  db.from("commission_statements").select("id").eq("id",job.statement_id).eq("agency_id",scope.agencyId).eq("status","imported").is("superseded_at",null).maybeSingle(),
  db.from("carrier_transactions").select("id").eq("statement_id",job.statement_id).eq("agency_id",scope.agencyId).eq("user_id",scope.actorId).is("superseded_at",null).limit(1),
 ]);
 if([u,a,c,m,s,t].some(v=>v.error)||!u.data||!a.data||!c.data||!m.data||!s.data||!t.data?.length)throw new Error("Automatic GHL job access changed.");
 return u.data;
}
