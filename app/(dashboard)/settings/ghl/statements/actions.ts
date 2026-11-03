"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { checkStatementContacts,type StatementGhlRow } from "@/lib/services/ghlStatementService";
import { syncStatementContacts,type StatementContactResult } from "@/lib/services/ghlStatementContactService";
export async function linkOrCreateStatementContacts():Promise<{rows?:StatementContactResult[];error?:string}>{
 try{return {rows:await syncStatementContacts(await requireRole(["owner"]))};}
 catch{return {error:"Contact setup stopped. A contact or link may already have been saved. Recheck before resuming; uncertain creations are not posted twice."};}
}
export interface StatementCheckState {rows?:StatementGhlRow[];error?:string}
export async function previewStatementContacts(query:string):Promise<StatementCheckState>{
 try{const user=await requireRole(["owner","agent"]),result=await checkStatementContacts(user,query.trim());const current=await requireRole(["owner","agent"]);if(current.id!==user.id||current.agencyId!==user.agencyId)throw new Error();return {rows:result.rows};}
 catch{return {error:"Original-statement comparison unavailable. Check source files, GHL assignment and read permissions. No GHL changes were sent."};}
}
