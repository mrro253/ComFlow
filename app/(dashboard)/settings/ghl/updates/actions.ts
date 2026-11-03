"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { ghlPreviewAccess } from "@/lib/repositories/ghlPreviewRepository";
import { readGhlEnrollmentLink } from "@/lib/repositories/ghlLinkRepository";
import { listEditableSales } from "@/lib/services/saleDispositionService";
import { listEnrollmentStatuses } from "@/lib/services/enrollmentStatusService";
import { verifyGhlUser } from "@/lib/crm/gohighlevel/setupClient";
import { buildPolicyPreview,readPolicyContact,readPolicyFields,type PolicyPreviewRow,type PolicyContact } from "@/lib/crm/gohighlevel/policyUpdatePreview";
import { digest } from "@/lib/carriers/digest";
export interface PolicyUpdateState {error?:string;rows?:PolicyPreviewRow[];skipped?:number;checkedAt?:string}
export async function previewPolicyUpdates():Promise<PolicyUpdateState>{
  try{
    const user=await requireRole(["owner","agent"]),access=await ghlPreviewAccess(user);
    await verifyGhlUser(access.locationId,access.ghlUserId,access.token);
    const sales=await listEditableSales(user,undefined,true);
    if(sales.length>100)throw new Error();
    const statuses=await listEnrollmentStatuses(user);
    const assumptions=new Map(statuses.map(s=>[`${s.ownerId}/${s.code}`,s.assumedCoverage]));
    const fields=await readPolicyFields(access.locationId,access.token);
    const refs=[];
    for(const sale of sales){const link=await readGhlEnrollmentLink(user,access,sale);if(link)refs.push({sale,contactId:link.contactId});}
    const counts=new Map<string,number>();for(const ref of refs)counts.set(ref.contactId,(counts.get(ref.contactId)??0)+1);
    const cache=new Map<string,PolicyContact>(),rows:PolicyPreviewRow[]=[],checkedAt=new Date().toISOString();
    for(const {sale,contactId}of refs){
      if(!sale.source)throw new Error();
      let contact=cache.get(contactId);
      if(!contact){contact=await readPolicyContact(access.locationId,access.ghlUserId,access.token,contactId,fields);cache.set(contactId,contact);}
      rows.push(buildPolicyPreview(sale.source,fields,contact,counts.get(contactId)!,checkedAt,assumptions.get(`${sale.ownerId}/${sale.code}`)??null));
    }
    const current=await requireRole(["owner","agent"]);
    if(current.id!==user.id||current.agencyId!==user.agencyId)throw new Error();
    const latest=await ghlPreviewAccess(current);
    if(latest.connectionId!==access.connectionId||latest.locationId!==access.locationId||latest.ghlUserId!==access.ghlUserId||latest.token!==access.token)throw new Error();
    const freshSales=await listEditableSales(current,undefined,true);
    const fingerprint=(list:typeof sales)=>digest(list.map(s=>({owner:s.ownerId,hash:s.collectionHash,code:s.code,source:s.source})));
    if(fingerprint(sales)!==fingerprint(freshSales))throw new Error();
    const freshStatuses=await listEnrollmentStatuses(current);
    const assumptionHash=(list:typeof statuses)=>digest(list.map(s=>({owner:s.ownerId,code:s.code,assumption:s.assumedCoverage})));
    if(assumptionHash(statuses)!==assumptionHash(freshStatuses))throw new Error();
    return {rows,skipped:sales.length-refs.length,checkedAt};
  }catch{return {error:"Policy preview unavailable. Check your saved user assignment, linked contact identities and contact/custom-field read permissions, then try again. No contacts, notes or ComFlow records were changed."};}
}
