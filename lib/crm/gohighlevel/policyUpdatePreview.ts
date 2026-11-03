import { detailsWritePlan,terminationFields } from "./detailsWritePlan";
import { fullMbi,readGhlPreviewObject } from "./contactPreview";
import { validateSetupInput,validGhlId } from "./setupClient";
import type { SunfireEnrollment } from "@/lib/enrollments/sunfire";
import type { CoverageAssumption } from "@/lib/enrollments/coverageAssumption";

export interface PolicyField {id:string;name:string;key:string;type:string;options:string[]}
export interface PolicyContact {firstName:string;lastName:string;mbi:string|null;values:Record<string,unknown>}
export interface PolicyPreviewField {label:string;current:string;enrollment:string;decision:string}
export interface PolicyPreviewRow {code:string;name:string;carrier:string;plan:string;effectiveDate:string;fields:PolicyPreviewField[];reason:string;noteDraft:string;historyDraft:string;assumedActive:boolean;statusProposal:boolean;detailsProposal?:boolean}
const definitions=[
  {label:"Medicare policy name",key:"contact.1_policy_name",types:["TEXT"],source:"plan"},
  {label:"Medicare policy effective date",name:"Medicare Policy Effective Date",types:["DATE"],source:"date"},
  {label:"Medicare policy type",key:"contact.policy_type",types:["SINGLE_OPTIONS"],source:"type"},
  {label:"Medicare policy member ID",key:"contact.member_id",types:["TEXT"],source:"member"},
  {label:"Medicare policy status",key:"contact.1_policy_status",types:["SINGLE_OPTIONS"],source:"status"},
] as const;
export async function readPolicyFields(locationId:string,token:string):Promise<PolicyField[]>{
  validateSetupInput(locationId,token);
  const data=await readGhlPreviewObject(`/locations/${encodeURIComponent(locationId)}/customFields?model=contact`,token);
  if(!Array.isArray(data.customFields))throw new Error("Field definitions unavailable.");
  const fields:PolicyField[]=data.customFields.filter(f=>f&&f.model==="contact"&&f.locationId===locationId&&typeof f.id==="string"&&validGhlId(f.id)&&typeof f.name==="string"&&typeof f.fieldKey==="string"&&typeof f.dataType==="string")
    .map(f=>({id:f.id,name:f.name,key:f.fieldKey,type:f.dataType,options:Array.isArray(f.picklistOptions)?f.picklistOptions.filter((o:unknown)=>typeof o==="string"):[]}));
  if(new Set(fields.map(f=>f.id)).size!==fields.length)throw new Error("Duplicate field metadata.");
  return fields;
}
export async function readPolicyContact(locationId:string,userId:string,token:string,contactId:string,fields:PolicyField[]):Promise<PolicyContact>{
  validateSetupInput(locationId,token);if(!validGhlId(userId)||!validGhlId(contactId))throw new Error("Verified identity required.");
  const data=await readGhlPreviewObject(`/contacts/${encodeURIComponent(contactId)}`,token);
  const c=data.contact as Record<string,unknown>|undefined;
  if(!c||c.id!==contactId||c.locationId!==locationId||c.assignedTo!==userId||!Array.isArray(c.customFields))throw new Error("Contact is no longer accessible through this assignment.");
  const mbiFields=fields.filter(f=>f.key==="contact.medicare_number_mbi");if(mbiFields.length!==1)throw new Error("MBI field is ambiguous.");
  const mbiValues=c.customFields.filter(f=>f?.id===mbiFields[0].id);
  const mbi=mbiValues.length===1?fullMbi(mbiValues[0].value):null;
  if(!mbi)throw new Error("Full MBI cannot be verified.");
  const allowed=new Set([...fields.filter(f=>definitions.some(d=>"key" in d?d.key===f.key:d.name===f.name)),...terminationFields(fields)].map(f=>f.id));
  const values:Record<string,unknown>={};
  for(const f of c.customFields){if(f&&typeof f.id==="string"&&allowed.has(f.id)){if(Object.hasOwn(values,f.id))throw new Error("Duplicate field value.");values[f.id]=f.value;}}
  return {firstName:typeof c.firstName==="string"?c.firstName.slice(0,200):"",lastName:typeof c.lastName==="string"?c.lastName.slice(0,200):"",mbi,values};
}
function display(value:unknown){if(value===undefined||value===null||value==="")return "Blank";return typeof value==="string"&&value.length<=1000?value:"Value unavailable";}
export function buildPolicyPreview(source:SunfireEnrollment,fields:PolicyField[],contact:PolicyContact,applicationCount:number,checkedAt:string,assumption:CoverageAssumption|null=null):PolicyPreviewRow{
  if(!contact.mbi||contact.mbi!==fullMbi(source.mbi))throw new Error("Linked contact identity changed.");
  const reason=(assumption?`Assumed active — commission reported for ${assumption.statementMonth}. This is a payment-based assumption, not carrier-verified coverage. `:"")+(applicationCount>1?"Multiple applications share this contact. The current GHL policy cannot be selected from these applications alone.":"Other current policy fields are not automatically confirmed by the enrollment application or its proposed date.");
  const existingPlanFields=fields.filter(f=>f.key==="contact.1_policy_name"),existingDateFields=fields.filter(f=>f.name==="Medicare Policy Effective Date");
  const existingPlan=existingPlanFields.length===1?display(contact.values[existingPlanFields[0].id]):"Value unavailable";
  const existingDate=existingDateFields.length===1?display(contact.values[existingDateFields[0].id]):"Value unavailable";
  const normalizedDate=/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(existingDate)?existingDate.slice(0,10):null;
  const differentPlan=existingPlan!=="Blank"&&existingPlan.trim().toLowerCase()!==source.plan.trim().toLowerCase();
  const newerPolicy=normalizedDate!==null&&normalizedDate>source.proposedEffectiveDate;
  const rows:PolicyPreviewField[]=definitions.map(def=>{
    const found=fields.filter(f=>"key" in def?f.key===def.key:f.name===def.name);
    const field=found.length===1?found[0]:undefined;
    const value=field?display(contact.values[field.id]):"Field unavailable";
    // Carrier member IDs and full MBIs are not interchangeable and are never copied into drafts.
    const current=def.source==="member"&&value!=="Blank"&&value!=="Field unavailable"&&value!=="Value unavailable"?"Present (hidden)":value;
    const proposed=def.source==="plan"?source.plan:def.source==="date"?source.proposedEffectiveDate:def.source==="type"&&/^ULTIMATE HEALTH PLAN(?:, INC\.)?$/i.test(source.carrier)?"Medicare Advantage":null;
    const enrollment=proposed??(def.source==="status"?(assumption?`Active — assumed from commission reported ${assumption.statementMonth}`:"No status assumption"):def.source==="member"?"Carrier member ID not provided":"Product type not explicitly verified");
    let decision="Keep existing value";
    if(!field)decision="Keep unchanged — field mapping unavailable";
    else if(!(def.types as readonly string[]).includes(field.type))decision="Keep unchanged — field type needs verification";
    else if(def.source==="status"&&assumption){
      decision=value==="Active"?"Already Active — no change":!field.options.includes("Active")?"Keep unchanged — dropdown option needs verification":applicationCount>1?"Keep unchanged — multiple applications share this contact":differentPlan||newerPolicy||(!normalizedDate&&existingDate!=="Blank")?"Keep unchanged — existing GHL policy differs or is newer":"Propose Active — commission reported (not sent)";
    }else if(proposed){
      const agrees=def.source==="date"?/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)&&value.slice(0,10)===proposed:value===proposed;
      decision=agrees?"Already agrees — no change":def.source==="type"&&!field.options.includes(proposed)?"Keep unchanged — dropdown option needs verification":"Keep unchanged — current coverage not confirmed";
    }
    return {label:def.label,current,enrollment,decision};
  });
  const noteDraft=`Enrollment reference draft — not saved\nApplication: ${source.code}\nSource: SunFire enrollment submitted ${source.submittedDate}\nCarrier: ${source.carrier}\nApplication plan: ${source.plan}\nProposed effective date: ${source.proposedEffectiveDate}\n${assumption?`Assumed Active: commission reported ${assumption.statementMonth}. This is a payment-based assumption, not carrier-verified coverage.`:"This application is not proof of active or current coverage. No policy status is inferred from it."}\nThis preview has not changed GHL.\nPreview checked: ${checkedAt}`;
  let detailsProposal=false;
  try{detailsWritePlan({source,ownerId:"preview",sourceHash:"preview",assumption,fields,contact,applicationCount,connectionId:"preview",locationId:"preview",ghlUserId:"preview",contactId:"preview"});detailsProposal=true;}catch{/* Unsupported or ambiguous details stay unchanged. */}
  if(detailsProposal)for(const row of rows)if(["Medicare policy name","Medicare policy effective date","Medicare policy type"].includes(row.label)&&row.current!==row.enrollment&&!row.decision.startsWith("Already")&&row.enrollment!=="Product type not explicitly verified")row.decision="Propose application detail — review required (not sent)";
  const historyDraft=`History-note draft for a future approved update — not saved\nExisting GHL policy information at preview time:\n${rows.filter(r=>r.label!=="Medicare policy member ID").map(r=>`${r.label}: ${r.current}`).join("\n")}\nApplication reference: ${source.code}\nNo field change is approved by this preview; these existing values are not being declared historical yet.`;
  return {code:source.code,name:`${source.firstName} ${source.lastName}`,carrier:source.carrier,plan:source.plan,effectiveDate:source.proposedEffectiveDate,fields:rows,reason,noteDraft,historyDraft,assumedActive:!!assumption,detailsProposal,statusProposal:rows.some(r=>r.decision.startsWith("Propose Active"))};
}
