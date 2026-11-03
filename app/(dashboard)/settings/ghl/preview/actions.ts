"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { ghlPreviewAccess } from "@/lib/repositories/ghlPreviewRepository";
import { listEditableSales } from "@/lib/services/saleDispositionService";
import { verifyGhlUser } from "@/lib/crm/gohighlevel/setupClient";
import { compareContactCandidates,readMbiField,searchAssignedContacts,type ContactPreviewRow } from "@/lib/crm/gohighlevel/contactPreview";
export interface ContactPreviewState {error?:string;warning?:string;rows?:ContactPreviewRow[];checkedAt?:string}
export async function previewGhlContacts():Promise<ContactPreviewState> {
  try {
    const user=await requireRole(["owner","agent"]);
    const access=await ghlPreviewAccess(user);
    await verifyGhlUser(access.locationId,access.ghlUserId,access.token);
    const sales=await listEditableSales(user,undefined,true);
    if(sales.length>100) return {error:"This preview supports up to 100 enrollments per run. No records were changed."};
    let field:string|null=null;
    try {field=await readMbiField(access.locationId,access.token);} catch { /* Name-only preview remains available without field-definition permission. */ }
    const rows:ContactPreviewRow[]=[];
    for(const sale of sales) {
      if(!sale.source)throw new Error();
      const result=await searchAssignedContacts(access.locationId,access.ghlUserId,access.token,sale.source,field);
      rows.push(compareContactCandidates(sale.source,result.contacts,result.complete));
    }
    // Recheck access after remote reads; don't return a preview after removal or reassignment.
    const current=await requireRole(["owner","agent"]);
    if(current.id!==user.id||current.agencyId!==user.agencyId)throw new Error();
    const latest=await ghlPreviewAccess(current);
    if(latest.connectionId!==access.connectionId||latest.locationId!==access.locationId||latest.ghlUserId!==access.ghlUserId||latest.token!==access.token)throw new Error();
    return {rows,checkedAt:new Date().toISOString(),warning:field?"Name searches only: different names or contacts assigned to someone else may not appear. Matched contacts have agreeing names and full MBIs. Nothing is linked yet.":"MBI comparison unavailable. Add locations/customFields.readonly and ensure the Medicare Number (MBI) field exists. These contacts match by name only; their identities are not confirmed."};
  } catch {return {error:"Preview unavailable. Check your saved connection, your GHL user assignment and read permissions, then try again. No records were changed."};}
}
