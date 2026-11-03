"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { prepareStatusWriteReview,resumeStatusWriteReview,sendStatusWrite,type StatusWriteReview } from "@/lib/services/ghlStatusWriteService";
export interface StatusWriteResult {review?:StatusWriteReview;error?:string;info?:string}
export async function reviewStatusUpdate(code:string):Promise<StatusWriteResult>{
  try{return {review:await prepareStatusWriteReview(await requireRole(["owner","agent"]),code)};}catch{return {error:"Could not prepare this update. Its evidence may have changed, another operation may be pending, or write setup is unavailable. No GHL changes were sent."};}
}
export async function reviewPendingStatusUpdate(id:string):Promise<StatusWriteResult>{
  try{return {review:await resumeStatusWriteReview(await requireRole(["owner","agent"]),id)};}catch{return {error:"This pending update cannot currently be verified. No new note or status update was sent. Keep it paused for review."};}
}
export async function sendReviewedStatusUpdate(id:string,reviewHash:string,approved:boolean):Promise<StatusWriteResult>{
  if(approved!==true||!/^[a-f0-9]{64}$/.test(reviewHash))return {error:"Review and approve this contact's status and history note before sending."};
  try{const result=await sendStatusWrite(await requireRole(["owner","agent"]),id,reviewHash);return {info:result.changed?"The history note was preserved and this contact's Medicare policy status is now Active in GHL.":"The current status is already Active. No additional status change was needed."};}
  catch{return {error:"The update is paused. A history note or status change may already have reached GHL. Refresh pending updates before resuming; ComFlow will not blindly repeat the note or overwrite changed policy information."};}
}
