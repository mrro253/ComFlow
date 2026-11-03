import { fullMbi,readGhlPreviewObject } from "./contactPreview";
import { validGhlId,validateSetupInput } from "./setupClient";
import { statementName,statementNames } from "./statementMatch";
import type { CommissionEvidence } from "@/lib/enrollments/commissionMatches";
export interface DirectoryContact {id:string;firstName:string;lastName:string;assignedTo:string|null;mbi:string|null;source:string;values:Record<string,unknown>}
/** Complete location inventory stays server-side; never return another agent's contact data. */
export async function readContactDirectory(locationId:string,token:string,mbiField:string){
 validateSetupInput(locationId,token);const all:DirectoryContact[]=[],seen=new Set<string>();let cursorId="",cursorTime="";
 for(let page=0;page<100;page++){
  const q=new URLSearchParams({locationId,limit:"100",...(cursorId?{startAfterId:cursorId,startAfter:cursorTime}:{})});
  const data=await readGhlPreviewObject(`/contacts/?${q}`,token);
  if(!Array.isArray(data.contacts)||data.contacts.length>100)throw new Error("Contact directory unavailable.");
  for(const c of data.contacts){if(!c||c.locationId!==locationId||typeof c.id!=="string"||!validGhlId(c.id)||seen.has(c.id))throw new Error("Contact directory incomplete.");seen.add(c.id);
   const values:Record<string,unknown>={};if(!Array.isArray(c.customFields))throw new Error("Contact fields unavailable.");for(const f of c.customFields){if(!f||typeof f.id!=="string"||Object.hasOwn(values,f.id))throw new Error("Ambiguous contact fields.");values[f.id]=f.value;}
   all.push({id:c.id,firstName:typeof c.firstName==="string"?c.firstName:"",lastName:typeof c.lastName==="string"?c.lastName:"",assignedTo:typeof c.assignedTo==="string"?c.assignedTo:null,mbi:fullMbi(values[mbiField]),source:typeof c.source==="string"?c.source:"",values});
  }
  if(data.contacts.length<100){if(typeof data.count==="number"&&data.count>all.length)throw new Error("Contact directory incomplete.");return all;}
  const last=data.contacts.at(-1),time=Date.parse(last.dateAdded);if(!Number.isFinite(time))throw new Error("Contact pagination unavailable.");cursorId=last.id;cursorTime=String(time);
 }
 throw new Error("Contact directory limit reached.");
}
export function decideStatementContact(e:CommissionEvidence,directory:DirectoryContact[],ghlUserId:string,dateField:string){
 const n=statementNames(e),name=statementName(n.firstName+n.lastName),id=e.medicareId.replace(/[ -]/g,"").toUpperCase(),full=fullMbi(id),partial=e.carrier==="Ultimate Health Plans"&&/^[A-Z0-9]{5}$/.test(id)?id:null;
 if(!n.firstName.trim()||!n.lastName.trim()||(!full&&!partial))return {kind:"blocked" as const,reason:"Statement identity is incomplete."};
 const possible=directory.filter(c=>statementName(c.firstName+c.lastName)===name||(full&&c.mbi===full)||(partial&&c.mbi?.endsWith(partial))||(statementName(c.lastName)===statementName(n.lastName)&&statementName(c.firstName)[0]===statementName(n.firstName)[0]));
 if(!possible.length)return {kind:"create" as const,reason:"No possible existing contact in the complete GHL location."};
 const verified=possible.filter(c=>(full&&c.mbi===full)||(partial&&statementName(c.firstName+c.lastName)===name&&c.mbi?.endsWith(partial)&&typeof c.values[dateField]==="string"&&/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(c.values[dateField] as string)&&(c.values[dateField] as string).slice(0,10)===e.effectiveDate));
 const own=verified.filter(c=>c.assignedTo===ghlUserId);
 if(own.length===1&&possible.filter(c=>c.assignedTo===ghlUserId&&c.mbi===own[0].mbi).length===1)return {kind:"link" as const,contactId:own[0].id,reason:full?"Full MBI agrees; contact belongs to the mapped agent.":"Name, partial MBI and effective date agree."};
 return {kind:"blocked" as const,reason:verified.some(c=>c.assignedTo!==ghlUserId)?"A possible existing contact belongs to another GHL user; no duplicate created.":"A possible existing contact needs identity review; no duplicate created."};
}
export interface StatementIdentityBridge {name:string;carrier:string;date:string;mbi:string;contactId:string}
export function verifiedStatementBridge(e:CommissionEvidence,directory:DirectoryContact[],userId:string,bridges:StatementIdentityBridge[]){
 const names=statementNames(e),id=e.medicareId.replace(/[ -]/g,"").toUpperCase();
 const ids=new Set(bridges.filter(b=>b.name===statementName(names.firstName+names.lastName)&&b.carrier===e.carrier&&b.date===e.effectiveDate&&(fullMbi(id)?b.mbi===fullMbi(id):e.carrier==="Ultimate Health Plans"&&id.length===5&&b.mbi.endsWith(id))&&directory.some(c=>c.id===b.contactId&&c.assignedTo===userId&&c.mbi===b.mbi)).map(b=>b.contactId));
 return ids.size===1?[...ids][0]:null;
}
export async function createStatementContact(locationId:string,userId:string,token:string,e:CommissionEvidence,mbiField:string,operationId:string){
 validateSetupInput(locationId,token);if(!validGhlId(userId)||!validGhlId(mbiField)||!/^[a-f0-9-]{36}$/.test(operationId))throw new Error("Invalid contact destination.");
 const names=statementNames(e);if(!names.firstName.trim()||!names.lastName.trim()||names.firstName.length>200||names.lastName.length>200)throw new Error("Verified name required.");
 const mbi=fullMbi(e.medicareId),source=`ComFlow statement contact ${operationId}`;
 try{const r=await fetch("https://services.leadconnectorhq.com/contacts/",{method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,Version:"2021-07-28",Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({locationId,assignedTo:userId,...names,source,...(mbi?{customFields:[{id:mbiField,fieldValue:mbi}]}:{})})});
  if(!r.ok||Number(r.headers.get("content-length")??0)>1000000)throw new Error();const text=await r.text();if(text.length>1000000)throw new Error();const c=JSON.parse(text).contact;
  if(!c||!validGhlId(c.id)||c.locationId!==locationId||c.assignedTo!==userId||c.source!==source||statementName(c.firstName+c.lastName)!==statementName(names.firstName+names.lastName))throw new Error();return c.id as string;
 }catch{throw new Error("Contact creation could not be confirmed. Reconcile the pending operation before retrying.");}
}
