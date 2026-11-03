import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDb } from "./db.js";
import { processGhlImportJobs } from "./ghlImportJobs.js";
import { openLocalRuntime } from "./localRuntime.js";
/** Dedicated consumer: never imports or opens a carrier portal. */
async function main(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.SUPABASE_URL;if(!url)throw new Error("Database URL required.");
 const scope=createHash("sha256").update(new URL(url).origin).digest("hex").slice(0,24);
 const runtime=await openLocalRuntime(join(process.env.LOCALAPPDATA??join(homedir(),".local","state"),"ComFlow","ghl-imports",scope));
 const once=process.argv.includes("--once"),db=createDb();
 try{if(!once)console.log("Automatic GHL import processing is running.");do{try{const count=await processGhlImportJobs(db);if(count)console.log(`Handled ${count} automatic GHL import job(s). See ComFlow for results.`);}catch{console.error("Automatic GHL processing is waiting for database access or its reviewed migration.");if(once)throw new Error("Queue unavailable.");}if(!once)await new Promise(r=>setTimeout(r,30000));}while(!once);}finally{await runtime.close();}
}
main().catch(()=>{console.error("Automatic GHL import processor could not start. Check its local runtime and database configuration.");process.exitCode=1;});
