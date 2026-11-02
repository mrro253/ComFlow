/** Destructive process interruption ONLY in the explicitly opted-in isolated synthetic project. */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, claimConnection, storeStatement, markConnection, type Db } from "./db.js";
import { openLocalRuntime } from "./localRuntime.js";
import { recoverInterruptedSync } from "./scheduledSync.js";
import { sha256Hex } from "./safeError.js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (process.env.RECOVERY_SYNTHETIC_ONLY !== "true" || url !== "http://127.0.0.1:55431") {
  throw new Error("Recovery drill requires explicit synthetic-only opt-in and the isolated API on port 55431.");
}
const pdf = Buffer.from("%PDF-1.4\n% Fictional worker recovery fixture; no client data.\n%%EOF\n");
const externalId = "synthetic-recovery-statement";
const carrier = "Synthetic Recovery Carrier"; // No registered adapter: cannot open a real portal.
const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const self = fileURLToPath(import.meta.url);
const scope = createHash("sha256").update(url).digest("hex").slice(0,24);
const runtimePath = (base: string) => join(base,"ComFlow","worker",scope);
function requireOk(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
async function rows(db: Db, table: "commission_statements" | "carrier_transactions" | "commission_transactions", agencyId: string) {
  const result=await db.from(table).select("id").eq("agency_id",agencyId);
  requireOk(!result.error && result.data,"Synthetic row read failed."); return result.data;
}
async function connection(db: Db, id: string) {
  const result=await db.from("carrier_connections").select("*").eq("id",id).single();
  requireOk(!result.error && result.data,"Synthetic connection unavailable."); return result.data;
}
function launch(args: string[], env: NodeJS.ProcessEnv) {
  return spawn(process.execPath,[tsx,...args],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
}
async function waitExit(child: ChildProcess) {
  return new Promise<number | null>((done,fail)=> { child.once("error",fail); child.once("close",done); });
}
async function saved(db: Db, agencyId: string) {
  const file=await db.storage.from("statements").download(`${agencyId}/${sha256Hex(pdf)}.pdf`);
  requireOk(!file.error && file.data && sha256Hex(Buffer.from(await file.data.arrayBuffer()))===sha256Hex(pdf),"Saved synthetic source was not preserved.");
}

async function childCheckpoint() {
  const { RECOVERY_AGENCY: agencyId, RECOVERY_USER: userId, RECOVERY_CONNECTION: id, LOCALAPPDATA: base }=process.env;
  requireOk(agencyId && userId && id && base,"Synthetic child configuration missing.");
  const db=createDb(); const runtime=await openLocalRuntime(runtimePath(base));
  await runtime.write({connectionId:id,startedAt:new Date().toISOString()});
  requireOk(await claimConnection(db,id),"Synthetic request was not claimed.");
  await markConnection(db,id,{ok:false,error:"Sync running. Saving a synthetic source."});
  requireOk(await storeStatement(db,{agencyId,connectionId:id,carrier,statementOwnerUserId:userId,carrierStatementId:externalId,filename:"synthetic-recovery.pdf",pdf})==="stored","Synthetic source was not saved.");
  console.log("CHECKPOINT_SAVED");
  setInterval(()=>undefined,1000); // Parent intentionally kills this process without cleanup.
}

async function drill() {
  const db=createDb();
  const preexisting=await db.from("carrier_connections").select("id").not("sync_requested_at","is",null).neq("status","disabled");
  requireOk(!preexisting.error && preexisting.data?.length===0,"Synthetic project has existing requests; refusing to run its worker.");
  const agencyId=randomUUID(), userId: string=randomUUID(), id=randomUUID();
  const base=await mkdtemp(join(tmpdir(),"comflow-recovery-synthetic-"));
  const env={...process.env,LOCALAPPDATA:base,RECOVERY_AGENCY:agencyId,RECOVERY_USER:userId,RECOVERY_CONNECTION:id,SCHEDULED_SYNC_ENABLED:"true"};
  let child: ChildProcess | undefined; let createdAuth=false, createdAgency=false;
  try {
    const auth=await db.auth.admin.createUser({email:`recovery-${userId}@synthetic.invalid`,password:randomBytes(24).toString("base64url"),email_confirm:true});
    requireOk(!auth.error && auth.data.user,"Synthetic auth fixture failed.");
    // Use the real generated auth identity throughout the fixture.
    env.RECOVERY_USER=auth.data.user.id; createdAuth=true;
    const agency=await db.from("agencies").insert({id:agencyId,name:"Synthetic Worker Recovery Drill"});
    requireOk(!agency.error,"Synthetic agency fixture failed."); createdAgency=true;
    const profile=await db.from("users").insert({id:env.RECOVERY_USER,agency_id:agencyId,email:`recovery-${userId}@synthetic.invalid`,first_name:"Synthetic",last_name:"Recovery",role:"owner",agent_type:"independent",active:true});
    requireOk(!profile.error,"Synthetic owner fixture failed.");
    const inserted=await db.from("carrier_connections").insert({id,agency_id:agencyId,user_id:env.RECOVERY_USER,carrier,status:"active",sync_requested_at:new Date().toISOString()});
    requireOk(!inserted.error,"Synthetic connection fixture failed.");
    child=launch([self,"--checkpoint-child"],env);
    const exited=waitExit(child);
    await new Promise<void>((done,fail)=> {
      const timer=setTimeout(()=>fail(new Error("Synthetic checkpoint timed out.")),45000);
      child!.stdout!.on("data",chunk=> { if(String(chunk).includes("CHECKPOINT_SAVED")){clearTimeout(timer);done();} });
      child!.once("exit",()=> {clearTimeout(timer);fail(new Error("Synthetic child exited before its checkpoint."));});
      child!.once("error",()=> {clearTimeout(timer);fail(new Error("Synthetic child could not start."));});
    });
    await saved(db,agencyId);
    await requireBlockedDuplicateWorker(base);
    child.kill("SIGKILL"); await exited; child=undefined;
    console.log("PASS real process stopped after durable claim and source save.");

    // Run the ACTUAL worker entry point on restart. --once must not schedule or log in.
    const restarted=launch([fileURLToPath(new URL("./index.ts",import.meta.url)),"--once"],env);
    let output=""; restarted.stdout!.on("data",chunk=>{output+=String(chunk);});
    requireOk(await waitExit(restarted)===0 && output.includes("processed 0 sync request(s)"),"Restarted worker did not recover without executing a portal job.");
    const recovered=await connection(db,id);
    requireOk(recovered.status==="needs_attention" && recovered.last_error?.startsWith("Update interrupted.") && recovered.sync_requested_at===null,"Interrupted run was not safely paused.");
    await saved(db,agencyId);
    requireOk((await rows(db,"commission_statements",agencyId)).length===1,"Restart duplicated the saved statement.");
    console.log("PASS actual worker restart reclaimed its dead lock, preserved its file and did not retry credentials.");

    const runtime=await openLocalRuntime(runtimePath(base));
    try {
      requireOk(await runtime.read()===null,"Recovered journal was not cleared.");
      const run={connectionId:id,startedAt:new Date().toISOString()};
      await runtime.write(run);
      await markConnection(db,id,{ok:false,error:"Sync running. Synthetic interrupted job."});
      const newer=await db.from("carrier_connections").update({sync_requested_at:new Date().toISOString()}).eq("id",id);
      requireOk(!newer.error,"Synthetic newer request failed.");
      const before=await connection(db,id); await recoverInterruptedSync(db,run);
      requireOk(JSON.stringify(await connection(db,id))===JSON.stringify(before),"Recovery overwrote a newer request.");
      requireOk(await claimConnection(db,id),"Explicit synthetic resume was not claimed.");
      requireOk(await storeStatement(db,{agencyId,connectionId:id,carrier,statementOwnerUserId:env.RECOVERY_USER,carrierStatementId:externalId,filename:"synthetic-recovery.pdf",pdf})==="duplicate","Explicit resume did not skip the saved source.");
      await markConnection(db,id,{ok:true});
      const complete=await connection(db,id); await recoverInterruptedSync(db,run);
      requireOk(JSON.stringify(await connection(db,id))===JSON.stringify(complete),"Recovery changed a completed result.");
      const disabled=await db.from("carrier_connections").update({status:"disabled"}).eq("id",id);
      requireOk(!disabled.error,"Synthetic disable fixture failed.");
      const disabledBefore=await connection(db,id); await recoverInterruptedSync(db,run);
      requireOk(JSON.stringify(await connection(db,id))===JSON.stringify(disabledBefore),"Recovery changed a disabled connection.");
      await runtime.write(null);
    } finally {await runtime.close();}
    await saved(db,agencyId);
    requireOk((await rows(db,"commission_statements",agencyId)).length===1,"Explicit resume duplicated a statement.");
    requireOk((await rows(db,"carrier_transactions",agencyId)).length===0 && (await rows(db,"commission_transactions",agencyId)).length===0,"Recovery drill created monetary entries.");
    console.log("PASS explicit resume skipped its source; newer requests, completed results and disabled state were preserved. No monetary rows created.");
  } finally {
    if(child && child.exitCode===null){const exited=waitExit(child);child.kill("SIGKILL");await exited;}
    const removal=await db.storage.from("statements").remove([`${agencyId}/${sha256Hex(pdf)}.pdf`]);
    requireOk(!removal.error,"Synthetic file cleanup failed.");
    if(createdAgency){const cleanup=await db.from("agencies").delete().eq("id",agencyId).eq("name","Synthetic Worker Recovery Drill");requireOk(!cleanup.error,"Synthetic agency cleanup failed.");}
    if(createdAuth){const cleanup=await db.auth.admin.deleteUser(env.RECOVERY_USER);requireOk(!cleanup.error,"Synthetic auth cleanup failed.");}
    const absolute=resolve(base);
    requireOk(absolute.startsWith(resolve(tmpdir())+"\\") || absolute.startsWith(resolve(tmpdir())+"/"),"Temporary cleanup path is outside the test root.");
    await rm(absolute,{recursive:true,force:true});
    console.log("Synthetic recovery fixtures cleaned up.");
  }
}
async function requireBlockedDuplicateWorker(base: string) {
  let rejected=false;
  try {const duplicate=await openLocalRuntime(runtimePath(base));await duplicate.close();}
  catch {rejected=true;}
  requireOk(rejected,"A second worker acquired an active lock.");
}
if(process.argv.includes("--checkpoint-child")) await childCheckpoint();
else await drill();
