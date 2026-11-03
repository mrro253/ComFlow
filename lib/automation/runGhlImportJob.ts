import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { withGhlImportScope,ghlImportActor } from "./ghlImportContext";
import { runGhlImportPipeline } from "./ghlImportPipeline";
import { mapUserRow } from "@/lib/repositories/userRepository";
import { originalStatementEvidence,checkStatementContacts } from "@/lib/services/ghlStatementService";
import { syncStatementContacts } from "@/lib/services/ghlStatementContactService";
import { listEditableSales } from "@/lib/services/saleDispositionService";
import { canonicalEnrollmentCarrier } from "@/lib/enrollments/commissionMatches";
import { statementName,statementNames } from "@/lib/crm/gohighlevel/statementMatch";
import { fullMbi } from "@/lib/crm/gohighlevel/contactPreview";
import { previewPolicyUpdates } from "@/app/(dashboard)/settings/ghl/updates/actions";
import { prepareStatusWriteReview,resumeStatusWriteReview,sendStatusWrite } from "@/lib/services/ghlStatusWriteService";
import { ghlPreviewAccess } from "@/lib/repositories/ghlPreviewRepository";
import { pendingPolicyOperations } from "@/lib/repositories/ghlPolicyOperationRepository";
import { digest } from "@/lib/carriers/digest";
import type { Database,Json } from "@/types/database";
type Job=Database["public"]["Tables"]["ghl_import_jobs"]["Row"];
export async function processGhlImportJob(jobId:string){
 const db=createAdminClient(),leaseId=randomUUID();const claim=await db.rpc("claim_ghl_import_job",{p_job:jobId,p_lease:leaseId});
 if(claim.error)throw new Error("Automatic GHL queue unavailable.");if(!claim.data)return false;
 const job=claim.data as unknown as Job;
 try{
  const summary=await withGhlImportScope({jobId:job.id,leaseId,actorId:job.actor_user_id,agencyId:job.agency_id},async()=>{
   const actor=await ghlImportActor();if(!actor)throw new Error("Job actor required.");const user={authUserId:actor.id,...mapUserRow(actor)};
   const access=await ghlPreviewAccess(user),source=await originalStatementEvidence(user);
   const imported=source.rows.filter(i=>i.entry.statement_id===job.statement_id&&i.entry.user_id===user.id);
   if(!imported.length)throw new Error("No authorized imported entries.");
   const affectedCodes=new Set<string>();
   for(const sale of await listEditableSales(user,undefined,true)){
    const s=sale.source;if(!s||sale.ownerId!==user.id)continue;
    if(imported.some(({row:e})=>{const n=statementNames(e),id=e.medicareId.replace(/[ -]/g,"").toUpperCase();return canonicalEnrollmentCarrier(s.carrier)===e.carrier&&s.proposedEffectiveDate===e.effectiveDate&&!!fullMbi(s.mbi)&&(fullMbi(id)?fullMbi(id)===fullMbi(s.mbi):id.length===5&&e.carrier==="Ultimate Health Plans"&&s.mbi.endsWith(id)&&statementName(n.firstName+n.lastName)===statementName(s.firstName+s.lastName));}))affectedCodes.add(sale.code);
   }
   async function heartbeat(){await ghlImportActor();const r=await db.from("ghl_import_jobs").update({lease_until:new Date(Date.now()+1800000).toISOString(),updated_at:new Date().toISOString()}).eq("id",job.id).eq("lease_id",leaseId).eq("state","running").gt("lease_until",new Date().toISOString()).select("id").maybeSingle();if(r.error||!r.data)throw new Error("Job lease changed.");}
   return runGhlImportPipeline({
    heartbeat,affectedCodes,initialSummary:job.summary as unknown as Partial<import("./ghlImportPipeline").ImportAutomationSummary>,
    checkpoint:async summary=>{const r=await db.from("ghl_import_jobs").update({summary:summary as unknown as Json,updated_at:new Date().toISOString()}).eq("id",job.id).eq("lease_id",leaseId).eq("state","running");if(r.error)throw new Error("Progress checkpoint unavailable.");},
    contacts:()=>syncStatementContacts(user,false,false,[],job.statement_id),
    recover:async()=>{
     const keys=[...new Set(imported.map(i=>digest([i.entry.carrier,i.entry.carrier_member_id,i.entry.effective_date])))];
     const links=await db.from("ghl_statement_contact_links").select("contact_id").eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("connection_id",access.connectionId).in("source_key",keys);if(links.error)throw new Error("Affected links unavailable.");
     const ids=new Set((links.data??[]).map(l=>l.contact_id));let count=0,fields=0;
     for(const op of await pendingPolicyOperations(user,access))if(op.phase!=="prepared"&&(ids.has(op.contact_id)||affectedCodes.has(op.source_code))){await heartbeat();const review=await resumeStatusWriteReview(user,op.id);await sendStatusWrite(user,review.id,review.reviewHash);count++;fields+=review.changes?.length??1;}
     return {operations:count,fields};
    },
    policyPreview:async()=>{const p=await previewPolicyUpdates();if(p.error||!p.rows)throw new Error("Policy evidence unavailable.");return p.rows;},
    statementPreview:async()=>{return (await checkStatementContacts(user,"",undefined,undefined,job.statement_id)).rows;},
    send:async(code,details)=>{const review=await prepareStatusWriteReview(user,code,details);const result=await sendStatusWrite(user,review.id,review.reviewHash);return {changed:result.changed,fieldCount:review.changes?.length??1};},
   });
  });
  const done=await db.from("ghl_import_jobs").update({state:"completed",summary:summary as unknown as Json,lease_id:null,lease_until:null,last_error:null,updated_at:new Date().toISOString()}).eq("id",job.id).eq("lease_id",leaseId).eq("state","running");if(done.error)throw new Error("Job completion unavailable.");
 }catch{
  await db.from("ghl_import_jobs").update({state:job.attempts>=3?"needs_attention":"queued",next_attempt_at:new Date(Date.now()+300000).toISOString(),last_error:"paused",lease_id:null,lease_until:null,updated_at:new Date().toISOString()}).eq("id",job.id).eq("lease_id",leaseId).eq("state","running");
 }
 return true;
}
