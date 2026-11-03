import type { Db } from "./db.js";
export async function processGhlImportJobs(db:Db){
 const now=new Date().toISOString();
 const r=await db.from("ghl_import_jobs").select("id").in("state",["queued","running"]).lte("next_attempt_at",now).or(`lease_until.is.null,lease_until.lt.${now}`).order("created_at").limit(5);
 if(r.error)throw new Error("Automatic GHL queue unavailable. Apply the reviewed database migration.");
 if(!r.data?.length)return 0;
 const {processGhlImportJob}=await import("../../lib/automation/runGhlImportJob");let count=0;
 for(const job of r.data)if(await processGhlImportJob(job.id))count++;
 return count;
}
