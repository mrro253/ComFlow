import type { PolicyOperation } from "@/lib/repositories/ghlPolicyOperationRepository";
import { statusHistoryNote } from "./statusWritePlan";
export interface StatusWriteDependencies {
  validate:()=>Promise<"previous"|"active">;
  findNote:(marker:string,body:string)=>Promise<string|null>;
  createNote:(body:string)=>Promise<string>;
  setActive:(fieldId:string)=>Promise<void>;
  checkpoint:(phase:PolicyOperation["phase"],noteId?:string)=>Promise<PolicyOperation>;
}
/** Caller holds a durable lease. Unknown note outcomes are reconciled, never automatically re-POSTed. */
export async function executeStatusWrite(operation:PolicyOperation,deps:StatusWriteDependencies){
  let op=operation;
  if(["completed","cancelled"].includes(op.phase))throw new Error("Operation is closed.");
  const current=await deps.validate();
  if(op.phase==="prepared"&&current==="active"){await deps.checkpoint("completed");return {changed:false};}
  const body=statusHistoryNote(op),marker=`[ComFlow operation ${op.id}]`;
  let noteId=await deps.findNote(marker,body);
  if(noteId){
    if(op.note_id&&op.note_id!==noteId)throw new Error("Operation history note differs.");
    if(op.phase==="prepared"||op.phase==="note_pending")op=await deps.checkpoint("note_confirmed",noteId);
  }else{
    if(op.phase!=="prepared")throw new Error("History note is unconfirmed. It will not be posted again automatically.");
    await deps.validate();
    op=await deps.checkpoint("note_pending");
    noteId=await deps.createNote(body);
    op=await deps.checkpoint("note_confirmed",noteId);
  }
  const beforeWrite=await deps.validate();
  if(await deps.findNote(marker,body)!==op.note_id)throw new Error("History preservation could not be confirmed.");
  if(beforeWrite==="active"){await deps.checkpoint("completed");return {changed:false};}
  op=await deps.checkpoint("field_pending");
  // Check the observed policy snapshot immediately before the only allowed field mutation.
  if(await deps.validate()==="active"){await deps.checkpoint("completed");return {changed:false};}
  // The validation above performs remote reads; confirm the lease again after that I/O.
  op=await deps.checkpoint("field_pending");
  await deps.setActive(op.field_id);
  if(await deps.validate()!=="active")throw new Error("Policy field update could not be confirmed.");
  await deps.checkpoint("completed");return {changed:true};
}
