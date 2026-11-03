import { checkStatementContacts } from "./ghlStatementService";
import { detailsWritePlan,parseDetailsPayload,type DetailChange } from "@/lib/crm/gohighlevel/detailsWritePlan";
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/types/domain";
import { ghlPreviewAccess } from "@/lib/repositories/ghlPreviewRepository";
import { readGhlEnrollmentLink } from "@/lib/repositories/ghlLinkRepository";
import { preparePolicyOperation,readPolicyOperation,claimPolicyOperation,checkpointPolicyOperation,releasePolicyOperation,type PolicyOperation } from "@/lib/repositories/ghlPolicyOperationRepository";
import { listEditableSales } from "./saleDispositionService";
import { listEnrollmentStatuses } from "./enrollmentStatusService";
import { verifyGhlUser } from "@/lib/crm/gohighlevel/setupClient";
import { readPolicyContact,readPolicyFields } from "@/lib/crm/gohighlevel/policyUpdatePreview";
import { statusWritePlan,statusHistoryNote } from "@/lib/crm/gohighlevel/statusWritePlan";
import { createStatusWriter } from "@/lib/crm/gohighlevel/statusWriteClient";
import { executeStatusWrite } from "@/lib/crm/gohighlevel/statusWriteEngine";

async function context(user:CurrentUser,code:string,operation?:PolicyOperation,details=false){
  if(code.startsWith("STMT_")){const result=await checkStatementContacts(user,"",code,operation);if(!result.context)throw new Error("No verified statement update.");return result.context;}
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(code))throw new Error("Invalid application.");
  const access=await ghlPreviewAccess(user);await verifyGhlUser(access.locationId,access.ghlUserId,access.token);
  const sales=await listEditableSales(user,undefined,true),matches=sales.filter(s=>s.code===code);
  if(sales.length>100||matches.length!==1||!matches[0].source)throw new Error("Application access unavailable.");const sale=matches[0];
  const statuses=await listEnrollmentStatuses(user),assumption=statuses.find(s=>s.ownerId===sale.ownerId&&s.code===sale.code)?.assumedCoverage??null;
  const fields=await readPolicyFields(access.locationId,access.token);let selected:string|null=null,count=0;
  const linked=[];for(const ref of sales){const link=await readGhlEnrollmentLink(user,access,ref);if(link){linked.push({ref,contactId:link.contactId});if(ref.ownerId===sale.ownerId&&ref.code===sale.code)selected=link.contactId;}}
  if(!selected)throw new Error("Verified saved link required.");count=linked.filter(r=>r.contactId===selected).length;
  const contact=await readPolicyContact(access.locationId,access.ghlUserId,access.token,selected,fields);
  const detailPayload=parseDetailsPayload(operation?.payload);
  const plan=(details||detailPayload?detailsWritePlan:statusWritePlan)({source:sale.source!,ownerId:sale.ownerId,sourceHash:sale.collectionHash,assumption,fields,contact,applicationCount:count,connectionId:access.connectionId,locationId:access.locationId,ghlUserId:access.ghlUserId,contactId:selected,...(operation?{previousOverride:operation.previous_status}:{}),...(detailPayload?{detailsOverride:detailPayload}:{})});
  const raw=contact.values[plan.fieldId];
  const actual=plan.payload?(plan.payload.changes.every(c=>{const v=contact.values[c.fieldId];return v===c.target||(c.key==="date"&&typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(v)&&v.slice(0,10)===c.target);})?"Active":null):typeof raw==="string"&&raw?raw:null;
  if(operation&&(plan.reviewHash!==operation.review_hash||actual!==operation.previous_status&&actual!=="Active"))throw new Error("The reviewed policy, payment evidence or current GHL value changed.");
  return {access,sale,plan,actual};
}
export interface StatusWriteReview {id:string;code:string;name:string;destination:string;previous:string;target:"Active";changes?:Omit<DetailChange,"fieldId"|"key">[];note:string;reviewHash:string;phase:string;busy:boolean}
function safeReview(op:PolicyOperation,name:string,destination:string):StatusWriteReview{return {id:op.id,code:op.source_code,name,destination,previous:op.previous_status??"Blank",target:"Active",changes:parseDetailsPayload(op.payload)?.changes.map(({label,previous,target})=>({label,previous,target})),note:statusHistoryNote(op),reviewHash:op.review_hash,phase:op.phase,busy:!!op.lease_until&&Date.parse(op.lease_until)>Date.now()};}
export async function prepareStatusWriteReview(user:CurrentUser,code:string,details=false){
  const fresh=await context(user,code,undefined,details);const op=await preparePolicyOperation(user,fresh.access,fresh.plan);
  return safeReview(op,fresh.sale.clientName,fresh.access.locationName??"your connected GHL sub-account");
}
export async function resumeStatusWriteReview(user:CurrentUser,id:string){
  const access=await ghlPreviewAccess(user),op=await readPolicyOperation(user,access,id),fresh=await context(user,op.source_code,op);
  return safeReview(op,fresh.sale.clientName,fresh.access.locationName??"your connected GHL sub-account");
}
export async function sendStatusWrite(user:CurrentUser,id:string,reviewHash:string){
  const access=await ghlPreviewAccess(user),saved=await readPolicyOperation(user,access,id);
  if(saved.review_hash!==reviewHash)throw new Error("Review this operation before sending.");
  if(saved.phase==="completed")return {changed:false};if(saved.phase==="cancelled")throw new Error("This review was replaced.");
  await context(user,saved.source_code,saved);
  const leaseId=randomUUID(),op=await claimPolicyOperation(user,access,id,leaseId);
  const writer=createStatusWriter(access.locationId,access.ghlUserId,access.token,op.contact_id);
  try{
    return await executeStatusWrite(op,{
      validate:async()=>{const fresh=await context(user,op.source_code,op);if(fresh.access.token!==access.token||fresh.access.connectionId!==access.connectionId||fresh.access.ghlUserId!==access.ghlUserId)throw new Error("Connection changed.");return fresh.actual==="Active"?"active":"previous";},
      findNote:writer.findNote,createNote:writer.createNote,setActive:op.payload?()=>writer.setDetails(parseDetailsPayload(op.payload)!):writer.setActive,
      checkpoint:(phase,noteId)=>checkpointPolicyOperation(user,access,id,leaseId,phase,noteId),
    });
  }finally{try{await releasePolicyOperation(user,access,id,leaseId);}catch{/* A lost lease/access remains paused; do not attempt another remote write. */}}
}
