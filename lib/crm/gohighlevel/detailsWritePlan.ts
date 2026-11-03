import { digest } from "@/lib/carriers/digest";
import { fullMbi } from "./contactPreview";
import { applicationFingerprint } from "@/lib/enrollments/applicationOutcome";
import type { statusWritePlan,StatusWritePlan } from "./statusWritePlan";
export interface DetailChange {key:"plan"|"date"|"type";fieldId:string;label:string;previous:string|null;target:string}
export interface PolicyNoteDetails {plan:string|null;effectiveDate:string|null;terminationDate:string|null;type:string|null}
export interface DetailsPayload {kind:"details";changes:DetailChange[];history?:{version:2;date:string;previous:PolicyNoteDetails;next:PolicyNoteDetails}}
export function terminationFields<T extends {name:string;type:string}>(fields:T[]){return fields.filter(f=>f.type==="DATE"&&["Medicare Policy Termination Date","Medicare Policy Term Date"].includes(f.name));}
export function parseDetailsPayload(raw:unknown):DetailsPayload|null {
 if(raw===undefined||raw===null)return null;
 const p=raw as DetailsPayload,labels={plan:"Medicare policy name",date:"Medicare policy effective date",type:"Medicare policy type"};
 if(p.kind!=="details"||!Array.isArray(p.changes)||p.changes.length<1||p.changes.length>3)throw new Error("Invalid details operation.");
 if(new Set(p.changes.map(c=>c.key)).size!==p.changes.length||new Set(p.changes.map(c=>c.fieldId)).size!==p.changes.length)throw new Error("Duplicate details field.");
 for(const c of p.changes)if(!Object.hasOwn(labels,c.key)||c.label!==labels[c.key]||!/^[A-Za-z0-9]{6,80}$/.test(c.fieldId)||typeof c.target!=="string"||!c.target.trim()||c.target.length>1000||/[\r\n\x00-\x1f]/.test(c.target)||(c.previous!==null&&(typeof c.previous!=="string"||c.previous.length>1000||/[\r\n\x00-\x1f]/.test(c.previous))))throw new Error("Invalid detail value.");
 if(p.history){
  if(p.history.version!==2||!dateOnly(p.history.date))throw new Error("Invalid history format.");
  for(const snapshot of [p.history.previous,p.history.next]){if(!snapshot)throw new Error("History details required.");for(const k of ["plan","effectiveDate","terminationDate","type"] as const){const v=snapshot[k];if(v!==null&&(typeof v!=="string"||v.length>1000||/[\r\n\x00-\x1f]/.test(v)))throw new Error("Invalid history value.");if((k==="effectiveDate"||k==="terminationDate")&&v!==null&&!dateOnly(v))throw new Error("Invalid history date.");}}
 }
 return p;
}
function dateOnly(value:string){
 if(!/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value))return null;
 const d=value.slice(0,10),time=Date.parse(d+"T00:00:00Z");return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===d?d:null;
}
export function detailsWritePlan(input:Parameters<typeof statusWritePlan>[0]&{detailsOverride?:DetailsPayload;today?:string}):StatusWritePlan {
 if(!input.assumption||input.applicationCount!==1||!input.contact.mbi||input.contact.mbi!==fullMbi(input.source.mbi))throw new Error("A single verified paid application is required.");
 const today=input.today??new Date().toISOString().slice(0,10),sourceDate=dateOnly(input.source.proposedEffectiveDate);
 if(!sourceDate||sourceDate>today||!input.source.plan.trim()||input.source.plan.length>1000)throw new Error("Current application details unavailable.");
 const contact={...input.contact,values:{...input.contact.values}};
 if(input.detailsOverride)for(const c of parseDetailsPayload(input.detailsOverride)!.changes){const actual=contact.values[c.fieldId]??null;if(actual!==c.previous&&actual!==c.target&&!(c.key==="date"&&typeof actual==="string"&&dateOnly(actual)===c.target))throw new Error("Reviewed value changed.");contact.values[c.fieldId]=c.previous;}
 const specs=[{key:"plan",label:"Medicare policy name",matches:input.fields.filter(f=>f.key==="contact.1_policy_name"),type:"TEXT",target:input.source.plan}, {key:"date",label:"Medicare policy effective date",matches:input.fields.filter(f=>f.name==="Medicare Policy Effective Date"),type:"DATE",target:sourceDate}, {key:"type",label:"Medicare policy type",matches:input.fields.filter(f=>f.key==="contact.policy_type"),type:"SINGLE_OPTIONS",target:/^ULTIMATE HEALTH PLAN(?:, INC\.)?$/i.test(input.source.carrier)?"Medicare Advantage":null}] as const;
 if(specs.some(s=>s.matches.length!==1||s.matches[0].type!==s.type))throw new Error("All three policy mappings must be verified.");
 const values=specs.map(s=>{const v=contact.values[s.matches[0].id];if(v!==undefined&&v!==null&&typeof v!=="string")throw new Error("Unexpected policy value.");return typeof v==="string"&&v?v:null;});
 const oldDate=values[1]?dateOnly(values[1]):null;
 if((values[1]&&!oldDate)||(oldDate&&oldDate>sourceDate))throw new Error("Existing policy is newer or its date is unclear.");
 if(values[0]&&values[0].trim().toLowerCase()!==input.source.plan.trim().toLowerCase()&&!oldDate)throw new Error("Different existing policy has no verified date.");
 const changes:DetailChange[]=[];
 specs.forEach((s,i)=>{if(!s.target)return;const field=s.matches[0];if(s.type==="SINGLE_OPTIONS"&&!field.options.includes(s.target))throw new Error("Dropdown option unavailable.");if((s.key==="date"?oldDate:values[i])!==s.target)changes.push({key:s.key,fieldId:field.id,label:s.label,previous:values[i],target:s.target});});
 const termFields=terminationFields(input.fields),termRaw=termFields.length===1?contact.values[termFields[0].id]:null;
 const previous:PolicyNoteDetails={plan:values[0],effectiveDate:oldDate,terminationDate:typeof termRaw==="string"?dateOnly(termRaw):null,type:values[2]};
 const history={version:2 as const,date:input.detailsOverride?.history?.date??new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),previous,next:{...previous,plan:input.source.plan,effectiveDate:sourceDate,type:specs[2].target??previous.type,terminationDate:null}};
 const payload=parseDetailsPayload({kind:"details",changes,...(input.detailsOverride&&!input.detailsOverride.history?{}:{history})})!;
 if(input.detailsOverride&&digest(payload)!==digest(input.detailsOverride))throw new Error("Reviewed details changed.");
 // Missing and explicit blank targets share one canonical snapshot during readback.
 for(const c of payload.changes)contact.values[c.fieldId]=c.previous;
 const snapshotHash=digest({mbi:contact.mbi,values:input.fields.filter(f=>Object.hasOwn(contact.values,f.id)).map(f=>({id:f.id,value:contact.values[f.id]??null})).sort((a,b)=>a.id.localeCompare(b.id)),fields:input.fields.map(f=>({id:f.id,key:f.key,name:f.name,type:f.type,options:f.options})).sort((a,b)=>a.id.localeCompare(b.id))});
 const plan={connectionId:input.connectionId,locationId:input.locationId,ghlUserId:input.ghlUserId,contactId:input.contactId,fieldId:"PolicyDetails",ownerId:input.ownerId,sourceHash:input.sourceHash,code:input.source.code,sourceFingerprint:applicationFingerprint(input.source),statementMonth:input.assumption.statementMonth,snapshotHash,previousStatus:null,payload};
 return {...plan,reviewHash:digest({version:2,...plan})};
}
