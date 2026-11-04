"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { checkStatementContacts,type StatementGhlRow } from "@/lib/services/ghlStatementService";
import { syncStatementContacts,type StatementContactResult } from "@/lib/services/ghlStatementContactService";
export async function linkOrCreateStatementContacts():Promise<{rows?:StatementContactResult[];error?:string}>{
 try{return {rows:await syncStatementContacts(await requireRole(["owner","agent"]))};}
 catch{return {error:"Contact setup stopped. A contact or link may already have been saved. Recheck before resuming; uncertain creations are not posted twice."};}
}
export interface StatementCheckState {rows?:StatementGhlRow[];error?:string}
export async function previewStatementContacts(query:string):Promise<StatementCheckState>{
 try{const user=await requireRole(["owner","agent"]),result=await checkStatementContacts(user,query.trim());const current=await requireRole(["owner","agent"]);if(current.id!==user.id||current.agencyId!==user.agencyId)throw new Error();return {rows:result.rows};}
 catch{return {error:"Original-statement comparison unavailable. Check source files, GHL assignment and read permissions. No GHL changes were sent."};}
}

export async function reviewHeldStatementContacts():Promise<{rows?:StatementContactResult[];error?:string}>{
 try{return {rows:(await syncStatementContacts(await requireRole(["owner","agent"]),true)).filter(r=>r.result==="Needs review")};}catch{return {error:"Held-match review unavailable. No new contact or link was saved."};}
}

export async function linkVerifiedHeldContacts():Promise<{rows?:StatementContactResult[];error?:string}>{
 try{return {rows:await syncStatementContacts(await requireRole(["owner","agent"]),false,true)};}catch{return {error:"Linking paused. Recheck the current evidence before resuming. No new contacts are created by this review action."};}
}

export async function confirmStatementNamePairs(pairs:{sourceName:string;contactName:string}[]):Promise<{rows?:StatementContactResult[];error?:string}>{
 try{return {rows:await syncStatementContacts(await requireRole(["owner","agent"]),false,true,pairs)};}catch{return {error:"Name confirmation stopped. Partial MBI, policy date, assignment and original evidence must still agree."};}
}
