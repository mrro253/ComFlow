import { digest } from "@/lib/carriers/digest";
import { applicationFingerprint } from "@/lib/enrollments/applicationOutcome";
import type { CoverageAssumption } from "@/lib/enrollments/coverageAssumption";
import type { SunfireEnrollment } from "@/lib/enrollments/sunfire";
import { buildPolicyPreview,type PolicyContact,type PolicyField } from "./policyUpdatePreview";
export interface StatusWritePlan {connectionId:string;locationId:string;ghlUserId:string;contactId:string;fieldId:string;ownerId:string;sourceHash:string;code:string;sourceFingerprint:string;statementMonth:string;reviewHash:string;snapshotHash:string;previousStatus:string|null}
export function statusWritePlan(input:{source:SunfireEnrollment;ownerId:string;sourceHash:string;assumption:CoverageAssumption|null;fields:PolicyField[];contact:PolicyContact;applicationCount:number;connectionId:string;locationId:string;ghlUserId:string;contactId:string;previousOverride?:string|null}):StatusWritePlan{
  const matches=input.fields.filter(f=>f.key==="contact.1_policy_status");if(matches.length!==1)throw new Error("Policy status mapping unavailable.");
  const field=matches[0],raw=input.contact.values[field.id];
  if(raw!==undefined&&raw!==null&&!["Active","Inactive","Future Active","Unknown", ""].includes(String(raw)))throw new Error("Unexpected policy status.");
  const previousStatus=Object.hasOwn(input,"previousOverride")?input.previousOverride??null:typeof raw==="string"&&raw?raw:null;
  const contact={...input.contact,values:{...input.contact.values,[field.id]:previousStatus}};
  const preview=buildPolicyPreview(input.source,input.fields,contact,input.applicationCount,"review",input.assumption);
  if(!input.assumption||!preview.statusProposal)throw new Error("No eligible Active proposal for this policy.");
  const snapshotHash=digest({mbi:contact.mbi,values:input.fields.filter(f=>Object.hasOwn(contact.values,f.id)||f.id===field.id).map(f=>({id:f.id,value:contact.values[f.id]??null})).sort((a,b)=>a.id.localeCompare(b.id)),fields:input.fields.map(f=>({id:f.id,key:f.key,type:f.type,options:f.options})).sort((a,b)=>a.id.localeCompare(b.id))});
  const plan={connectionId:input.connectionId,locationId:input.locationId,ghlUserId:input.ghlUserId,contactId:input.contactId,fieldId:field.id,ownerId:input.ownerId,sourceHash:input.sourceHash,code:input.source.code,sourceFingerprint:applicationFingerprint(input.source),statementMonth:input.assumption.statementMonth,snapshotHash,previousStatus};
  return {...plan,reviewHash:digest({version:1,...plan})};
}
export function statusHistoryNote(op:{id:string;source_code:string;statement_month:string;previous_status:string|null}){
  return `ComFlow requested policy status update\nPrevious Medicare policy status: ${op.previous_status??"Blank"}\nRequested policy status: Active\nBasis: commission reported for ${op.statement_month}. Active is an assumption, not carrier-verified coverage.\nEnrollment application: ${op.source_code}\nThis note preserves the prior value before the requested change. Check the current policy field for its applied status.\n[ComFlow operation ${op.id}]`;
}
