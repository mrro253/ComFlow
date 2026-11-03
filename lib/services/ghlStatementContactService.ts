import { listEditableSales } from "./saleDispositionService";
import { readGhlEnrollmentLink } from "@/lib/repositories/ghlLinkRepository";
import { canonicalEnrollmentCarrier } from "@/lib/enrollments/commissionMatches";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghlPreviewAccess } from "@/lib/repositories/ghlPreviewRepository";
import { originalStatementEvidence } from "./ghlStatementService";
import { loadSunfireMatchInventory } from "@/lib/repositories/sunfireMatchRepository";
import { readPolicyFields } from "@/lib/crm/gohighlevel/policyUpdatePreview";
import { readGhlPreviewObject,fullMbi } from "@/lib/crm/gohighlevel/contactPreview";
import { verifyGhlUser } from "@/lib/crm/gohighlevel/setupClient";
import { decideStatementContact,readContactDirectory,createStatementContact,verifiedStatementBridge,uniquePartialDateContact } from "@/lib/crm/gohighlevel/statementContacts";
import { statementName,statementNames } from "@/lib/crm/gohighlevel/statementMatch";
import { digest } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";
import type { Database } from "@/types/database";
type Operation=Database["public"]["Tables"]["ghl_statement_contact_operations"]["Row"];
export interface StatementContactResult {name:string;carrier:string;effectiveDate:string;result:"Linked"|"Created and linked"|"Already linked"|"Needs review";reason:string;candidates?:{name:string;nameAgrees:boolean;fullMbiAgrees:boolean;partialMbiAgrees:boolean;effectiveDate:string;dateAgrees:boolean;memberIdAgrees:boolean}[]}
const uuid=(key:string)=>{const h=digest(key);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export async function syncStatementContacts(user:CurrentUser,reviewOnly=false,linkOnly=false,confirmedPairs:{sourceName:string;contactName:string}[]=[]){
 if(!user.active||user.role!=="owner")throw new Error("The credited owner must run this contact setup.");
 const access=await ghlPreviewAccess(user);await verifyGhlUser(access.locationId,access.ghlUserId,access.token);
 const source=await originalStatementEvidence(user),fields=await readPolicyFields(access.locationId,access.token),mbiFields=fields.filter(f=>f.key==="contact.medicare_number_mbi"&&f.type==="TEXT"),dates=fields.filter(f=>f.name==="Medicare Policy Effective Date"&&f.type==="DATE");
 if(mbiFields.length!==1||dates.length!==1)throw new Error("Identity field mappings are ambiguous.");
 let directory=await readContactDirectory(access.locationId,access.token,mbiFields[0].id);
 const db=createAdminClient(),groups=new Map<string,typeof source.rows>();
 for(const item of source.rows){const key=digest([item.entry.carrier,item.entry.carrier_member_id,item.entry.effective_date]);groups.set(key,[...(groups.get(key)??[]),item]);}
 if(groups.size>100)throw new Error("Contact setup limit exceeded.");
 const sales=await listEditableSales(user,undefined,true),bridges:{name:string;carrier:string;date:string;mbi:string;contactId:string}[]=[];
 for(const sale of sales){if(!sale.source||sale.ownerId!==user.id)continue;const link=await readGhlEnrollmentLink(user,access,sale),mbi=fullMbi(sale.source.mbi);if(link&&mbi)bridges.push({name:statementName(sale.source.firstName+sale.source.lastName),carrier:canonicalEnrollmentCarrier(sale.source.carrier),date:sale.source.proposedEffectiveDate,mbi,contactId:link.contactId});}
 if(!Array.isArray(confirmedPairs)||confirmedPairs.length>10||confirmedPairs.some(p=>typeof p?.sourceName!=="string"||typeof p?.contactName!=="string"||!p.sourceName||!p.contactName||p.sourceName.length>200||p.contactName.length>200))throw new Error("Invalid name confirmation.");
 const confirmationRows=await db.from("audit_events").select("details").eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("action","ghl.statement_name_confirmed").eq("details->>connectionId",access.connectionId).limit(1000);if(confirmationRows.error)throw new Error("Name confirmations unavailable.");
 const confirmations=(confirmationRows.data??[]).map(r=>r.details as Record<string,unknown>);
 const output:StatementContactResult[]=[];
 function aliasProof(e:typeof source.rows[number]["row"],c:typeof directory[number]){
  const rows=source.rows.filter(i=>i.entry.carrier===e.carrier&&i.entry.carrier_member_id===source.rows.find(i=>i.row.entryId===e.entryId)!.entry.carrier_member_id&&i.entry.effective_date===e.effectiveDate);
  return {version:1,connectionId:access.connectionId,ghlUserId:access.ghlUserId,sourceFingerprint:digest(rows),sourceNameHash:digest(statementName(statementNames(e).firstName+statementNames(e).lastName)),contactId:c.id,contactNameHash:digest(statementName(c.firstName+c.lastName)),mbiHash:digest(c.mbi),effectiveDate:e.effectiveDate};
 }

 function decisionFor(e:typeof source.rows[number]["row"]){
  const contactId=verifiedStatementBridge(e,directory,access.ghlUserId,bridges);
  if(contactId)return {kind:"link" as const,contactId,reason:"Original statement identity and date agree with an existing verified enrollment/contact link."};
  const regular=decideStatementContact(e,directory,access.ghlUserId,dates[0].id);if(regular.kind!=="blocked")return regular;
  const suffix=e.medicareId.replace(/[ -]/g,"").toUpperCase();
  if(e.carrier==="Ultimate Health Plans"&&/^[A-Z0-9]{5}$/.test(suffix)){
   const c=uniquePartialDateContact(e,directory,access.ghlUserId,dates[0].id);
   if(c){const proof=aliasProof(e,c),sourceName=statementName(statementNames(e).firstName+statementNames(e).lastName);
    const authorized=confirmedPairs.some(p=>statementName(p.sourceName)===sourceName&&statementName(p.contactName)===statementName(c.firstName+c.lastName));
    if(authorized||confirmations.some(p=>digest(p)===digest(proof)))return {kind:"link" as const,contactId:c.id,reason:"Owner confirmed the name difference; partial MBI and effective date agree.",aliasProof:proof};
   }
  }
  return regular;
 }

 const hydrated=new Set<string>();
 async function hydrate(e:typeof source.rows[number]["row"]){
  const n=statementNames(e),name=statementName(n.firstName+n.lastName);
  for(let i=0;i<directory.length;i++){const candidate=directory[i];if(hydrated.has(candidate.id)||candidate.assignedTo!==access.ghlUserId||!(statementName(candidate.firstName+candidate.lastName)===name||(e.medicareId.length===11&&candidate.mbi===fullMbi(e.medicareId))||(e.carrier==="Ultimate Health Plans"&&e.medicareId.length===5&&candidate.mbi?.endsWith(e.medicareId))||(statementName(candidate.lastName)===statementName(n.lastName)&&statementName(candidate.firstName)[0]===statementName(n.firstName)[0])))continue;
   const data=await readGhlPreviewObject(`/contacts/${encodeURIComponent(candidate.id)}`,access.token),c=data.contact as Record<string,unknown>|undefined;
   if(!c||c.id!==candidate.id||c.locationId!==access.locationId||c.assignedTo!==access.ghlUserId||!Array.isArray(c.customFields))throw new Error("Contact assignment or fields changed.");
   const values:Record<string,unknown>={};for(const f of c.customFields as {id:string;value:unknown}[]){if(Object.hasOwn(values,f.id))throw new Error("Ambiguous contact fields.");values[f.id]=f.value;}
   directory[i]={id:candidate.id,firstName:typeof c.firstName==="string"?c.firstName:"",lastName:typeof c.lastName==="string"?c.lastName:"",assignedTo:access.ghlUserId,mbi:fullMbi(values[mbiFields[0].id]),source:typeof c.source==="string"?c.source:"",values};hydrated.add(candidate.id);
  }
 }

 async function fresh(){const current=await ghlPreviewAccess(user);if(digest(current)!==digest(access)||digest(await loadSunfireMatchInventory(user))!==digest(source.inventory)||digest(await listEditableSales(user,undefined,true))!==digest(sales))throw new Error("Connection or statement access changed.");}
 for(const [sourceKey,items]of groups){
  const item=[...items].sort((a,b)=>b.row.statementMonth.localeCompare(a.row.statementMonth))[0],e=item.row,names=statementNames(e),base={name:e.clientName,carrier:e.carrier,effectiveDate:e.effectiveDate};
  if(items.some(i=>i.entry.user_id!==user.id)){output.push({...base,result:"Needs review",reason:"Statement is not credited to the current owner."});continue;}
  const id=e.medicareId.replace(/[ -]/g,"").toUpperCase(),identity=digest(fullMbi(id)?{mbi:fullMbi(id)}:{name:statementName(names.firstName+names.lastName),partial:id,carrier:e.carrier});
  if(items.some(i=>{const n=statementNames(i.row);return statementName(n.firstName+n.lastName)!==statementName(names.firstName+names.lastName)||i.row.medicareId.replace(/[ -]/g,"").toUpperCase()!==id;})){output.push({...base,result:"Needs review",reason:"Conflicting original statement identity."});continue;}
  let lease:string|undefined,op:Operation|undefined;
  try{
   await fresh();
   const previous=await db.from("ghl_statement_contact_operations").select("*").eq("agency_id",user.agencyId).eq("connection_id",access.connectionId).eq("identity_hash",identity).maybeSingle();if(previous.error)throw new Error("Contact journal unavailable.");op=previous.data??undefined;
   if(op&&(op.actor_user_id!==user.id||op.ghl_user_id!==access.ghlUserId))throw new Error("A different agent owns this contact operation.");
   await hydrate(e);let decision=decisionFor(e);
   const saved=await db.from("ghl_statement_contact_links").select("*").eq("agency_id",user.agencyId).eq("connection_id",access.connectionId).eq("source_key",sourceKey).maybeSingle();if(saved.error)throw new Error("Saved statement links unavailable.");
   if(saved.data){const c=directory.find(c=>c.id===saved.data!.contact_id);if(!op||saved.data.actor_user_id!==user.id||saved.data.ghl_user_id!==access.ghlUserId||!c||c.assignedTo!==access.ghlUserId||!(decision.kind==="link"&&decision.contactId===c.id||c.source===`ComFlow statement contact ${op.id}`&&statementName(c.firstName+c.lastName)===statementName(names.firstName+names.lastName)))throw new Error("Saved contact identity needs rechecking.");output.push({...base,result:"Already linked",reason:"Existing statement link verified."});continue;}
   if(reviewOnly){
    const memberFields=fields.filter(f=>f.key==="contact.member_id"&&f.type==="TEXT");
    const candidates=directory.filter(c=>c.assignedTo===access.ghlUserId&&(statementName(c.firstName+c.lastName)===statementName(names.firstName+names.lastName)||(fullMbi(id)&&c.mbi===fullMbi(id))||(id.length===5&&c.mbi?.endsWith(id))||(statementName(c.lastName)===statementName(names.lastName)&&statementName(c.firstName)[0]===statementName(names.firstName)[0]))).map(c=>{const raw=c.values[dates[0].id];const effectiveDate=typeof raw==="string"?raw.slice(0,10):"Not listed";return {name:`${c.firstName} ${c.lastName}`,nameAgrees:statementName(c.firstName+c.lastName)===statementName(names.firstName+names.lastName),fullMbiAgrees:!!fullMbi(id)&&c.mbi===fullMbi(id),partialMbiAgrees:e.carrier==="Ultimate Health Plans"&&id.length===5&&!!c.mbi?.endsWith(id),effectiveDate,dateAgrees:effectiveDate===e.effectiveDate,memberIdAgrees:memberFields.length===1&&c.values[memberFields[0].id]===item.entry.carrier_member_id};});
    output.push({...base,result:"Needs review",reason:decision.reason,candidates});continue;
   }
   if(linkOnly&&decision.kind==="create"&&(!op||op.phase==="prepared")){output.push({...base,result:"Needs review",reason:"No verified existing contact; this review does not create new contacts."});continue;}
   if(decision.kind==="link"&&"aliasProof" in decision&&decision.aliasProof){
    await fresh();const proof=decision.aliasProof;
    if(!confirmations.some(p=>digest(p)===digest(proof))){const savedConfirmation=await db.from("audit_events").insert({id:uuid(`${user.agencyId}/${user.id}/${digest(proof)}`),agency_id:user.agencyId,actor_user_id:user.id,action:"ghl.statement_name_confirmed",entity_type:"statement_contact_confirmation",entity_id:digest(proof),details:proof});if(savedConfirmation.error&&savedConfirmation.error.code!=="23505")throw new Error("Name confirmation could not be saved.");confirmations.push(proof);}
   }
   if(!op&&decision.kind==="blocked"){output.push({...base,result:"Needs review",reason:decision.reason});continue;}
   if(!op){const inserted=await db.from("ghl_statement_contact_operations").insert({id:randomUUID(),agency_id:user.agencyId,actor_user_id:user.id,connection_id:access.connectionId,ghl_user_id:access.ghlUserId,source_entry_id:e.entryId,identity_hash:identity}).select("*").single();if(inserted.error||!inserted.data)throw new Error("Contact operation already exists; refresh before retrying.");op=inserted.data;}
   lease=randomUUID();const claimed=await db.from("ghl_statement_contact_operations").update({lease_id:lease,lease_until:new Date(Date.now()+300000).toISOString(),updated_at:new Date().toISOString()}).eq("id",op.id).eq("actor_user_id",user.id).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select("*").maybeSingle();if(claimed.error||!claimed.data)throw new Error("Contact operation is already running.");op=claimed.data;
   async function checkpoint(phase:Operation["phase"],contactId?:string){await fresh();const r=await db.from("ghl_statement_contact_operations").update({phase,...(contactId?{contact_id:contactId}:{}),lease_until:new Date(Date.now()+300000).toISOString(),updated_at:new Date().toISOString()}).eq("id",op!.id).eq("lease_id",lease!).gt("lease_until",new Date().toISOString()).select("*").single();if(r.error||!r.data)throw new Error("Contact operation lease changed.");op=r.data;}
   const marker=`ComFlow statement contact ${op.id}`;let created=false;
   // Re-scan the entire location immediately before a possible POST; never duplicate another user's contact.
   if(decision.kind==="create"||op.phase==="create_pending"){directory=await readContactDirectory(access.locationId,access.token,mbiFields[0].id);hydrated.clear();await hydrate(e);}decision=decisionFor(e);
   if(op.phase==="prepared"){
    if(decision.kind==="blocked")throw new Error(decision.reason);
    if(decision.kind==="link")await checkpoint("created",decision.contactId);
    else{if(digest(await readPolicyFields(access.locationId,access.token))!==digest(fields))throw new Error("Identity field mapping changed.");await checkpoint("create_pending");const contactId=await createStatementContact(access.locationId,access.ghlUserId,access.token,e,mbiFields[0].id,op.id);await checkpoint("created",contactId);created=true;}
   }else if(op.phase==="create_pending"){
    const matches=directory.filter(c=>c.source===marker&&c.assignedTo===access.ghlUserId&&statementName(c.firstName+c.lastName)===statementName(names.firstName+names.lastName));if(matches.length!==1)throw new Error("Prior creation is unconfirmed; no second contact was created.");await checkpoint("created",matches[0].id);created=true;
   }
   if(!op.contact_id)throw new Error("Contact ID not confirmed.");
   const remote=await readGhlPreviewObject(`/contacts/${encodeURIComponent(op.contact_id)}`,access.token),c=remote.contact as Record<string,unknown>|undefined;
   if(!c||c.id!==op.contact_id||c.locationId!==access.locationId||c.assignedTo!==access.ghlUserId)throw new Error("Contact verification failed.");
   const values:Record<string,unknown>={};if(!Array.isArray(c.customFields))throw new Error("Contact fields unavailable.");for(const f of c.customFields as {id:string;value:unknown}[])values[f.id]=f.value;
   const remoteContact={id:String(c.id),firstName:String(c.firstName??""),lastName:String(c.lastName??""),assignedTo:access.ghlUserId,source:typeof c.source==="string"?c.source:"",mbi:fullMbi(values[mbiFields[0].id]),values};
   const remoteIndex=directory.findIndex(d=>d.id===remoteContact.id);if(remoteIndex>=0)directory[remoteIndex]=remoteContact;
   const confirmed=decisionFor(e);
   if(c.source!==marker&&!(confirmed.kind==="link"&&confirmed.contactId===op.contact_id))throw new Error("Contact identity no longer verified.");
   if(c.source===marker&&!fullMbi(id)&&statementName(remoteContact.firstName+remoteContact.lastName)!==statementName(names.firstName+names.lastName))throw new Error("Created contact name changed.");
   if(c.source===marker&&remoteContact.mbi&&!(fullMbi(id)?remoteContact.mbi===fullMbi(id):remoteContact.mbi.endsWith(id)))throw new Error("Created contact identity changed.");
   await fresh();const link={id:uuid(`${user.agencyId}/${access.connectionId}/${sourceKey}`),agency_id:user.agencyId,actor_user_id:user.id,connection_id:access.connectionId,ghl_user_id:access.ghlUserId,source_entry_id:e.entryId,source_key:sourceKey,contact_id:op.contact_id,operation_id:op.id};
   const added=await db.from("ghl_statement_contact_links").insert(link);if(added.error)throw new Error("Statement link could not be saved; refresh before retrying.");await checkpoint("linked");
   output.push({...base,result:created?"Created and linked":"Linked",reason:created?"New GHL contact assigned to your mapped agent; original statement link saved.":"Existing verified GHL contact linked to the original statement."});
   if(!directory.some(c=>c.id===remoteContact.id))directory.push(remoteContact);
  }catch{output.push({...base,result:"Needs review",reason:"Contact setup paused. A possible duplicate, changed access, or unconfirmed creation needs rechecking. No blind creation retry."});}
  finally{if(op&&lease)await db.from("ghl_statement_contact_operations").update({lease_id:null,lease_until:null,updated_at:new Date().toISOString()}).eq("id",op.id).eq("lease_id",lease);}
 }
 return output;
}
