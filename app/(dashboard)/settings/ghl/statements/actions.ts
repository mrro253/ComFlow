"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { checkStatementContacts,type StatementGhlRow } from "@/lib/services/ghlStatementService";
export interface StatementCheckState {rows?:StatementGhlRow[];error?:string}
export async function previewStatementContacts(query:string):Promise<StatementCheckState>{
 try{const user=await requireRole(["owner","agent"]),result=await checkStatementContacts(user,query.trim());const current=await requireRole(["owner","agent"]);if(current.id!==user.id||current.agencyId!==user.agencyId)throw new Error();return {rows:result.rows};}
 catch{return {error:"Original-statement comparison unavailable. Check source files, GHL assignment and read permissions. No GHL changes were sent."};}
}
