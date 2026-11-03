"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { ghlPreviewAccess } from "@/lib/repositories/ghlPreviewRepository";
import { listEditableSales } from "@/lib/services/saleDispositionService";
import { verifyGhlUser } from "@/lib/crm/gohighlevel/setupClient";
import { compareContactCandidates,investigateContactIdentity,readMbiField,searchAssignedContacts,type ContactPreviewRow } from "@/lib/crm/gohighlevel/contactPreview";
import { verifiedContact,linkReviewHash,type GhlEnrollmentLink } from "@/lib/crm/gohighlevel/contactLinks";
import { savedGhlLinks,appendGhlLinks } from "@/lib/repositories/ghlLinkRepository";
import { digest } from "@/lib/carriers/digest";
export interface ContactPreviewState {error?:string;warning?:string;rows?:ContactPreviewRow[];checkedAt?:string;investigated?:boolean;reviewHash?:string;linkable?:number;differentNameCount?:number;info?:string}
async function freshPreview(broader:boolean){
    const user=await requireRole(["owner","agent"]);
    const access=await ghlPreviewAccess(user);
    await verifyGhlUser(access.locationId,access.ghlUserId,access.token);
    const sales=await listEditableSales(user,undefined,true);
    if(sales.length>100) throw new Error("Preview limit exceeded.");
    let field:string|null=null;
    try {field=await readMbiField(access.locationId,access.token);} catch { /* Name-only preview remains available without field-definition permission. */ }
    const rows:ContactPreviewRow[]=[];
    const plan:GhlEnrollmentLink[]=[];
    const rowLinks=new Map<ContactPreviewRow,GhlEnrollmentLink>();
    for(const sale of sales) {
      if(!sale.source)throw new Error();
      const result=await searchAssignedContacts(access.locationId,access.ghlUserId,access.token,sale.source,field);
      let contacts=result.contacts,complete=result.complete;
      let row=compareContactCandidates(sale.source,result.contacts,result.complete);
      if(broader===true&&field&&row.status==="No candidate found"){
        const first=await searchAssignedContacts(access.locationId,access.ghlUserId,access.token,sale.source,field,"first");
        const last=await searchAssignedContacts(access.locationId,access.ghlUserId,access.token,sale.source,field,"last");
        const unique=new Map([...first.contacts,...last.contacts].map(contact=>[contact.id,contact]));
        contacts=[...unique.values()];complete=first.complete&&last.complete;
        row=investigateContactIdentity(sale.source,contacts,complete);
      }
      rows.push(row);
      const contact=verifiedContact(sale.source,contacts,complete);
      if(contact&&["MBI agreement","Name differs"].includes(row.status)){
        const link={ownerId:sale.ownerId,collectionHash:sale.collectionHash,code:sale.code,contactId:contact.id,nameDiffers:row.status==="Name differs"};
        plan.push(link);rowLinks.set(row,link);
      }
    }
    // Recheck access after remote reads; don't return a preview after removal or reassignment.
    const current=await requireRole(["owner","agent"]);
    if(current.id!==user.id||current.agencyId!==user.agencyId)throw new Error();
    const latest=await ghlPreviewAccess(current);
    if(latest.connectionId!==access.connectionId||latest.locationId!==access.locationId||latest.ghlUserId!==access.ghlUserId||latest.token!==access.token)throw new Error();
    const currentSales=await listEditableSales(current,undefined,true);
    if(digest(currentSales.map(s=>({ownerId:s.ownerId,collectionHash:s.collectionHash,code:s.code,source:s.source})))!==digest(sales.map(s=>({ownerId:s.ownerId,collectionHash:s.collectionHash,code:s.code,source:s.source}))))throw new Error("Enrollment access or source changed.");
    const saved=new Set(await savedGhlLinks(user,access,plan));
    for(const [row,link] of rowLinks)row.linked=saved.has(`${link.ownerId}/${link.code}`);
    const pending=plan.filter(link=>!saved.has(`${link.ownerId}/${link.code}`));
    const state:ContactPreviewState={rows,reviewHash:linkReviewHash(access.connectionId,access.ghlUserId,plan),linkable:pending.length,differentNameCount:pending.filter(l=>l.nameDiffers).length,investigated:broader===true&&!!field,checkedAt:new Date().toISOString(),warning:field?(broader===true?"Contacts not found were checked by first name and last name, with full-MBI comparison. Contacts assigned to other users are excluded. This is not an exhaustive GHL search.":"Name searches only: different names or contacts assigned to someone else may not appear. Matched contacts have agreeing names and full MBIs."):"MBI comparison unavailable. Add locations/customFields.readonly and ensure the Medicare Number (MBI) field exists. These contacts match by name only; their identities are not confirmed."};
    return {state,user,access,plan,rowLinks};
}
export async function previewGhlContacts(broader=false):Promise<ContactPreviewState> {
  try {return (await freshPreview(broader===true)).state;
  } catch {return {error:"Preview unavailable. Check your saved connection, your GHL user assignment and read permissions, then try again. No records were changed."};}
}
export async function linkGhlContacts(expectedHash:string):Promise<ContactPreviewState>{
  if(!/^[a-f0-9]{64}$/.test(expectedHash))return {error:"Run the preview before linking."};
  try {
    const fresh=await freshPreview(true);
    if(fresh.state.reviewHash!==expectedHash)return {...fresh.state,error:"The matches changed. Review this refreshed preview before linking. No new links were saved."};
    const count=await appendGhlLinks(fresh.user,fresh.access,fresh.plan);
    for(const row of fresh.rowLinks.keys())row.linked=true;
    return {...fresh.state,linkable:0,differentNameCount:0,info:`${count} new enrollment links saved in ComFlow. GHL contacts were not changed.`};
  } catch {return {error:"Linking stopped. Some ComFlow links may already have been saved. Run the preview before retrying; existing links will not be duplicated or replaced. GHL contacts were not changed."};}
}
