import { pendingPolicyOperations } from "@/lib/repositories/ghlPolicyOperationRepository";
import { loadSunfireMatchInventory } from "@/lib/repositories/sunfireMatchRepository";
import { loadPaymentDetails } from "./paymentDetailsService";
import { ghlPreviewAccess } from "@/lib/repositories/ghlPreviewRepository";
import { digest } from "@/lib/carriers/digest";
import { searchAssignedContacts,type PreviewContact } from "@/lib/crm/gohighlevel/contactPreview";
import { readPolicyContact,readPolicyFields } from "@/lib/crm/gohighlevel/policyUpdatePreview";
import { verifyGhlUser } from "@/lib/crm/gohighlevel/setupClient";
import { matchStatementContact,statementNames,statementName } from "@/lib/crm/gohighlevel/statementMatch";
import type { CommissionEvidence } from "@/lib/enrollments/commissionMatches";
import type { CurrentUser } from "@/types/domain";
import type { StatusWritePlan } from "@/lib/crm/gohighlevel/statusWritePlan";
import type { PolicyOperation } from "@/lib/repositories/ghlPolicyOperationRepository";
export interface StatementGhlRow {code:string;name:string;carrier:string;effectiveDate:string;month:string;amountCents:number;status:string;basis:string;currentStatus:string;currentDate:string;proposal:boolean;pendingId?:string;busy?:boolean;note:string}
export async function originalStatementEvidence(user:CurrentUser,onlyCode?:string){
 const inventory=await loadSunfireMatchInventory(user);
 const target=onlyCode?inventory.entries.find(e=>`STMT_${e.id.replaceAll("-","")}`===onlyCode):null;
 if(onlyCode&&!target)throw new Error("Statement entry unavailable.");
 const entries=target?inventory.entries.filter(e=>e.carrier===target.carrier&&e.carrier_member_id===target.carrier_member_id&&e.effective_date===target.effective_date):inventory.entries;
 const details=await loadPaymentDetails(entries.map(e=>e.id),user.agencyId);
 if(details.size!==entries.length)throw new Error("Original statement verification incomplete.");
 const rows=entries.map(entry=>{const d=details.get(entry.id)!;const field=(label:string)=>d.fields.find(f=>f.label.toUpperCase().replace(/[^A-Z]/g,"")===label.toUpperCase().replace(/[^A-Z]/g,""))?.value??"";
 const ids=d.fields.filter(f=>/^(MBI|Member HICN|Medicare \/ AARP member \/ exchange ID)$/i.test(f.label));
 const row:CommissionEvidence={entryId:entry.id,statementId:entry.statement_id,carrier:entry.carrier,clientName:d.clientName,firstName:field(entry.carrier==="Devoted Health"?"Member First":"First Name"),lastName:field(entry.carrier==="Devoted Health"?"Member Last":"Last Name"),medicareId:ids.length===1?ids[0].value:"",effectiveDate:entry.effective_date,statementMonth:entry.statement_month,category:entry.commission_type,amountCents:entry.amount_cents,statementFilename:d.statementFilename};return {entry,row};});
 const after=await loadSunfireMatchInventory(user);if(digest(inventory)!==digest(after))throw new Error("Statement evidence changed.");
 return {inventory,rows};
}
export async function checkStatementContacts(user:CurrentUser,query="",onlyCode?:string,operation?:PolicyOperation,statementId?:string){
 if(query.length>100)throw new Error("Search too long.");
 const access=await ghlPreviewAccess(user);await verifyGhlUser(access.locationId,access.ghlUserId,access.token);
 const source=await originalStatementEvidence(user,onlyCode),fields=await readPolicyFields(access.locationId,access.token),mbiFields=fields.filter(f=>f.key==="contact.medicare_number_mbi");
 if(mbiFields.length!==1)throw new Error("MBI mapping unavailable.");
 const groups=new Map<string,typeof source.rows>();
 for(const item of source.rows){const key=[item.entry.carrier,item.entry.carrier_member_id,item.entry.effective_date].join("/");groups.set(key,[...(groups.get(key)??[]),item]);}
 const selected=[...groups.values()].map(items=>({items,latest:[...items].sort((a,b)=>b.row.statementMonth.localeCompare(a.row.statementMonth)||a.entry.id.localeCompare(b.entry.id))[0]})).filter(g=>(!statementId||g.items.some(i=>i.entry.statement_id===statementId))&&(!query||g.latest.row.clientName.toLowerCase().includes(query.toLowerCase()))&&(!onlyCode||g.items.some(i=>`STMT_${i.entry.id.replaceAll("-","")}`===onlyCode)));
 if(selected.length>100)throw new Error("Search a smaller group of statement clients.");
 const output:StatementGhlRow[]=[];let context:undefined|{access:typeof access;sale:{clientName:string};plan:StatusWritePlan;actual:string|null};
 for(const group of selected){const item=onlyCode?group.items.find(i=>`STMT_${i.entry.id.replaceAll("-","")}`===onlyCode)!:group.latest,e=item.row,code=`STMT_${e.entryId.replaceAll("-","")}`,names=statementNames(e);
 const searchSource={...names,code,mbi:"",carrier:e.carrier,plan:"",proposedEffectiveDate:e.effectiveDate};
 let found=await searchAssignedContacts(access.locationId,access.ghlUserId,access.token,searchSource,mbiFields[0].id);
 if(!found.contacts.length){const last=await searchAssignedContacts(access.locationId,access.ghlUserId,access.token,searchSource,mbiFields[0].id,"last");found={contacts:last.contacts,complete:found.complete&&last.complete};}
 const checked: {c:PreviewContact;p:Awaited<ReturnType<typeof readPolicyContact>>;m:ReturnType<typeof matchStatementContact>}[]=[];
 for(const c of found.contacts){if(!c.mbi)continue;const p=await readPolicyContact(access.locationId,access.ghlUserId,access.token,c.id,fields);checked.push({c,p,m:matchStatementContact(e,c,p,fields)});}
 const agreeing=checked.filter(c=>c.m.verified),match=found.complete&&agreeing.length===1?agreeing[0]:null;
 const statuses=fields.filter(f=>f.key==="contact.1_policy_status"&&f.type==="SINGLE_OPTIONS"),statusField=statuses.length===1?statuses[0]:null,raw=match&&statusField?match.p.values[statusField.id]:null,currentStatus=typeof raw==="string"&&raw?raw:null;
 const consistent=group.items.every(i=>{const n=statementNames(i.row);return statementName(n.firstName+n.lastName)===statementName(names.firstName+names.lastName)&&i.row.medicareId.replace(/[ -]/g,"").toUpperCase()===e.medicareId.replace(/[ -]/g,"").toUpperCase();});
 const paid=consistent&&group.items.some(i=>i.row.amountCents>0&&["COMMISSION","RENEWAL","INITIAL"].includes(i.row.category))&&!group.items.some(i=>i.row.amountCents<0||i.row.category==="CHARGEBACK");
 const owner=user.role==="owner"&&group.items.every(i=>i.entry.user_id===user.id);
 const proposal=!!match&&match.m.date&&paid&&owner&&!!statusField&&statusField.options.includes("Active")&&(!currentStatus||["Inactive","Future Active","Unknown"].includes(currentStatus));
 output.push({code,name:e.clientName,carrier:e.carrier,effectiveDate:e.effectiveDate,month:e.statementMonth,amountCents:group.items.reduce((n,i)=>n+i.row.amountCents,0),status:!found.complete?"Search incomplete":agreeing.length>1?"Multiple matching contacts":match?"Contact Matched in GHL":found.contacts.length?"Match needs more evidence":"No Contact Found in GHL",basis:match?.m.basis??"No unique verified match",currentStatus:currentStatus??"Not listed",currentDate:match?.m.currentDate??checked[0]?.m.currentDate??"Not listed",proposal,note:!owner?"Statement updates currently require the credited owner.":!paid?"No Active assumption: chargeback, deduction or unsupported payment evidence.":!match?"No update until the contact identity is verified.":!match.m.date?"Contact identity agrees, but policy effective dates differ. No update proposed.":currentStatus==="Active"?"Already Active. No status change needed.":"Only Active status is supported here. Missing plan names are not inferred from a different source."});
 if(onlyCode&&match&&statusField&&paid&&owner&&match.m.date){
  const previous=operation?operation.previous_status:currentStatus;
  if(!statusField.options.includes("Active")||previous&&!["Inactive","Future Active","Unknown"].includes(previous))throw new Error("No status proposal.");
  const values={...match.p.values,[statusField.id]:previous},statement=source.inventory.statements.find(s=>s.id===e.statementId)!;
  const snapshotHash=digest({mbi:match.p.mbi,values,fields}),planBase={connectionId:access.connectionId,locationId:access.locationId,ghlUserId:access.ghlUserId,contactId:match.c.id,fieldId:statusField.id,ownerId:user.id,sourceHash:statement.file_hash,code,sourceFingerprint:digest(group.items),statementMonth:e.statementMonth,snapshotHash,previousStatus:previous};
  const plan={...planBase,reviewHash:digest({version:"statement-status-1",...planBase})};
  if(operation&&(operation.review_hash!==plan.reviewHash||currentStatus!==previous&&currentStatus!=="Active"))throw new Error("Reviewed statement or contact changed.");
  context={access,sale:{clientName:e.clientName},plan,actual:currentStatus};
 }
 }
 const latest=await ghlPreviewAccess(user);if(digest(latest)!==digest(access))throw new Error("Connection access changed.");
 const after=await loadSunfireMatchInventory(user);if(digest(source.inventory)!==digest(after))throw new Error("Statement access or evidence changed.");
 if(!onlyCode){const pending=await pendingPolicyOperations(user,access);for(const row of output){const op=pending.find(p=>p.source_code===row.code);if(op){row.pendingId=op.id;row.busy=!!op.lease_until&&Date.parse(op.lease_until)>Date.now();}}}
 return {rows:output,context};
}
