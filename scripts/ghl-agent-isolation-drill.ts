/** Isolated database only. Every HighLevel request is intercepted; no real CRM calls are possible. */
import { randomBytes,randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { encryptGhlToken } from "../lib/crm/gohighlevel/setupToken";
import { uhcFixture,uhcFixturePdf } from "../lib/carriers/__tests__/fixtures/uhcStatement";
import { extractStatementPdf } from "../lib/pdf/extractStatementPdf";
import { readUhcStatement,UHC_CARRIER } from "../lib/carriers/uhc/parseUhcStatement";
import { createDb } from "../worker/src/db";
import { processGhlImportJobs } from "../worker/src/ghlImportJobs";
import { processGhlImportJob } from "../lib/automation/runGhlImportJob";
import type { Database,Json } from "../types/database";

async function main(){
 if(process.env.GHL_AUTOMATION_SYNTHETIC_ONLY!=="true"||process.env.API_URL!=="http://127.0.0.1:55431")throw new Error("Explicit isolated synthetic environment required.");
 process.env.NEXT_PUBLIC_SUPABASE_URL=process.env.API_URL;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=process.env.ANON_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY=process.env.SERVICE_ROLE_KEY;process.env.CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString("base64");
 const workerDb=createDb();
 const db=createClient<Database>(process.env.API_URL,process.env.SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),nativeFetch=globalThis.fetch;
 const agents:string[]=[];let producerId="",currentGhl="SyntheticUser123",firstName="EXAMPLE",secondName="SECOND",lastName="PERSON";
 const agency=randomUUID(),connection=randomUUID(),location="SyntheticLocation",ghlUser="SyntheticUser123",mbi1="1EG4TE5MK73",mbi2="2AE4TE5MK74";
 let currentMbi1=mbi1,currentMbi2=mbi2;
 const fields=[{id:"MbiField123",fieldKey:"contact.medicare_number_mbi",name:"Medicare Number (MBI)",dataType:"TEXT"},{id:"DateField123",fieldKey:"contact.synthetic_date",name:"Medicare Policy Effective Date",dataType:"DATE"},{id:"StatusField123",fieldKey:"contact.1_policy_status",name:"Medicare Policy Status",dataType:"SINGLE_OPTIONS",picklistOptions:["Active","Inactive","Future Active","Unknown"]}].map(f=>({...f,locationId:location,model:"contact"}));
 type Contact={id:string;locationId:string;assignedTo:string;firstName:string;lastName:string;source:string;dateAdded:string;customFields:{id:string;value:unknown}[]};
 const contacts:Contact[]=[{id:"ExistingContact123",locationId:location,assignedTo:ghlUser,firstName:"EXAMPLE",lastName:"PERSON",source:"Synthetic",dateAdded:"2026-01-01T00:00:00Z",customFields:[{id:"MbiField123",value:mbi1},{id:"DateField123",value:"2026-01-01"},{id:"StatusField123",value:"Unknown"}]}];
 const notes:{id:string;contactId:string;userId:string;body:string}[]=[];let creates=0,puts=0,losePut=true,userId:string|undefined;const paths:string[]=[];
 function ok(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.origin==="http://127.0.0.1:55431")return nativeFetch(input,init);
  if(url.origin!=="https://services.leadconnectorhq.com")throw new Error("Non-synthetic destination blocked.");
  const method=init?.method??"GET",path=url.pathname;
  if(path.startsWith("/users/"))return json({id:path.split("/")[2],roles:{locationIds:[location]}});
  if(path===`/locations/${location}/customFields`)return json({customFields:fields});
  if(path==="/contacts/"&&method==="GET"){const q=(url.searchParams.get("query")??"").toLowerCase();const result=contacts.filter(c=>`${c.firstName} ${c.lastName}`.toLowerCase().includes(q));return json({contacts:result,count:result.length});}
  if(path==="/contacts/"&&method==="POST"){
   creates++;const b=JSON.parse(String(init?.body));ok(b.assignedTo===currentGhl,"Cross-agent contact creation denied.");const c:Contact={id:`CreatedContact${creates}123`,locationId:b.locationId,assignedTo:b.assignedTo,firstName:b.firstName,lastName:b.lastName,source:b.source,dateAdded:"2026-01-01T00:00:00Z",customFields:(b.customFields??[]).map((f:{id:string;fieldValue:unknown})=>({id:f.id,value:f.fieldValue}))};contacts.push(c);return json({contact:c},201);
  }
  const id=path.split("/")[2],contact=contacts.find(c=>c.id===id);ok(contact,"Unknown synthetic contact.");
  if(path.endsWith("/notes")){
   if(method==="GET")return json({notes:notes.filter(n=>n.contactId===id)});
   ok(contact.assignedTo===currentGhl,"Cross-agent note denied.");const b=JSON.parse(String(init?.body));ok(b.userId===currentGhl,"Wrong note author.");const note={id:`SyntheticNote${notes.length+1}`,contactId:id,userId:b.userId,body:b.body};notes.push(note);return json({note},201);
  }
  if(method==="GET")return json({contact});
  if(method==="PUT"){
   ok(contact.assignedTo===currentGhl,"Cross-agent field write denied.");puts++;const b=JSON.parse(String(init?.body));for(const f of b.customFields){const existing=contact.customFields.find(c=>c.id===f.id);if(existing)existing.value=f.fieldValue;else contact.customFields.push({id:f.id,value:f.fieldValue});}
   if(losePut){losePut=false;throw new Error("Synthetic lost successful response.");}return json({succeeded:true,contact});
  }
  throw new Error("Unexpected synthetic CRM request.");
 }) as typeof fetch;
 try{
  const auth=await db.auth.admin.createUser({email:`auto-${agency}@synthetic.invalid`,password:randomBytes(24).toString("base64url"),email_confirm:true});ok(!auth.error&&auth.data.user,"Synthetic auth seed failed.");userId=auth.data.user.id;
  ok(!(await db.from("agencies").insert({id:agency,name:"Synthetic automatic GHL drill"})).error,"Synthetic agency seed failed.");
  ok(!(await db.from("users").insert({id:userId,agency_id:agency,email:`auto-${agency}@synthetic.invalid`,first_name:"Synthetic",last_name:"Owner",role:"owner",agent_type:"independent",active:true})).error,"Synthetic owner seed failed.");
  const ciphertext=encryptGhlToken("synthetic-private-token-for-drill",{id:connection,agencyId:agency,userId,locationId:location});
  ok(!(await db.rpc("manage_ghl_connection",{p_actor:userId,p_agency:agency,p_action:"save",p_data:{id:connection,mode:"shared",locationId:location,locationName:"Synthetic location",ciphertext}})).error,"Synthetic GHL setup failed.");
  ok(!(await db.rpc("manage_ghl_connection",{p_actor:userId,p_agency:agency,p_action:"map",p_data:{id:connection,userId,ghlUserId:ghlUser}})).error,"Synthetic mapping failed.");
  ok(!(await db.from("ghl_import_automation_settings").insert({agency_id:agency,actor_user_id:userId,connection_id:connection,enabled:true})).error,"Synthetic setting failed.");
  for(const [i,ghl]of ["AgentAlpha123","AgentBeta123"].entries()){
   const authAgent=await db.auth.admin.createUser({email:`agent-${i}-${agency}@synthetic.invalid`,password:randomBytes(24).toString("base64url"),email_confirm:true});ok(authAgent.data.user&&!authAgent.error,"Agent auth failed.");const id=authAgent.data.user.id;agents.push(id);
   ok(!(await db.from("users").insert({id,agency_id:agency,email:`agent-${i}-${agency}@synthetic.invalid`,first_name:"Synthetic",last_name:`Agent${i}`,role:"agent",agent_type:"independent",active:true})).error,"Agent profile failed.");
   ok(!(await db.rpc("manage_ghl_connection",{p_actor:userId!,p_agency:agency,p_action:"map",p_data:{id:connection,userId:id,ghlUserId:ghl}})).error,"Agent map failed.");
   ok(!(await db.from("ghl_import_automation_settings").insert({agency_id:agency,actor_user_id:id,connection_id:connection,enabled:true})).error,"Agent automation failed.");
  }
  producerId=agents[0];currentGhl="AgentAlpha123";contacts[0].assignedTo=currentGhl;
  contacts.push({...structuredClone(contacts[0]),id:"OtherAgentContact123",assignedTo:"AgentBeta123",firstName:"BETA",lastName:"TESTER",customFields:[{id:"MbiField123",value:"3AG4TE5MK75"},{id:"DateField123",value:"2026-01-01"},{id:"StatusField123",value:"Unknown"}]});
  async function importFixture(corrected=false,oldId?:string){
   const pages=uhcFixture();for(const cell of pages[0]){if(cell.row===284&&cell.column===20)cell.text=`${lastName}, ${firstName}`;if(cell.row===304&&cell.column===20)cell.text=`${lastName}, ${secondName}`;if(cell.row===284&&cell.column===220)cell.text=currentMbi1;if(cell.row===304&&cell.column===220)cell.text=currentMbi2;if(currentGhl==="AgentBeta123"&&[284,304].includes(cell.row)&&cell.column===320)cell.text=cell.row===284?"9992001":"9992002";}
   if(corrected)for(const page of pages)for(const cell of page){if(cell.row===304&&cell.column===1410)cell.text="$55.67";if(cell.text==="$58.01")cell.text="$68.01";}
   const bytes=uhcFixturePdf(pages),pdf=await extractStatementPdf(bytes,UHC_CARRIER),parsed=readUhcStatement(pdf.text,pdf.sha256).statement,path=`${agency}/${pdf.sha256}.pdf`,id=randomUUID();paths.push(path);
   ok(!(await db.storage.from("statements").upload(path,bytes,{contentType:"application/pdf"})).error,"Synthetic source upload failed.");
   ok(!(await db.from("commission_statements").insert({id,agency_id:agency,user_id:userId!,carrier:UHC_CARRIER,statement_month:parsed.statementMonth,source:"upload",storage_path:path,file_hash:pdf.sha256,original_filename:"synthetic-automatic.pdf",uploaded_by:userId!})).error,"Synthetic source insert failed.");
   const rows=parsed.transactions.map(t=>({carrier:t.carrier,statement_month:t.statementMonth,carrier_member_id:t.memberId,effective_date:t.effectiveDateIso,commission_type:t.type,amount_cents:t.amountCents,transaction_key:t.transactionKey,writing_agent_name:t.writingAgent??null,writing_agent_verified:true,user_id:producerId,production_entity_id:null,writing_user_id:null}));
   const args={p_agency_id:agency,p_statement_id:id,p_actor:userId!,p_statement_month:parsed.statementMonth,p_statement_total_cents:parsed.statementTotalCents,p_carried_balance_cents:0,p_rows:rows as unknown as Json,p_supersedes:oldId?[oldId]:[]};
   ok(!(await db.rpc("import_statement",args)).error,"Synthetic atomic import failed.");
   const repeat=await db.rpc("import_statement",args);ok(!!repeat.error,"Repeat import should be rejected.");
   const jobs=await db.from("ghl_import_jobs").select("*").eq("statement_id",id);ok(!jobs.error&&jobs.data?.length===1&&jobs.data[0].actor_user_id===producerId,"Atomic import did not queue exactly one job.");return {id,job:jobs.data[0]};
  }
  const first=await importFixture();ok(await processGhlImportJobs(workerDb)===1,"Worker did not consume queued import.");
  const paused=await db.from("ghl_import_jobs").select("*").eq("id",first.job.id).single();ok(paused.data?.state==="queued"&&creates===1&&notes.length===1&&puts===1,"Lost response did not preserve a retryable job and one CRM mutation.");
  contacts[0].assignedTo="AgentBeta123";
  ok(!(await db.from("ghl_import_jobs").update({next_attempt_at:new Date().toISOString()}).eq("id",first.job.id)).error,"Retry scheduling failed.");
  ok(await processGhlImportJobs(workerDb)===1,"Revoked-contact job not consumed.");
  const held=await db.from("ghl_import_jobs").select("state").eq("id",first.job.id).single();ok(held.data?.state==="queued"&&creates===1&&notes.length===1&&puts===1,"Reassigned contact allowed another mutation.");
  contacts[0].assignedTo="AgentAlpha123";
  ok(!(await db.from("ghl_import_jobs").update({next_attempt_at:new Date().toISOString()}).eq("id",first.job.id)).error,"Synthetic retry scheduling failed.");ok(await processGhlImportJobs(workerDb)===1,"Worker did not consume queued import.");
  const done=await db.from("ghl_import_jobs").select("*").eq("id",first.job.id).single();ok(done.data?.state==="completed"&&creates===1&&notes.length===1&&puts===1,"Recovery duplicated a contact, note or field request.");
  ok((done.data.summary as {created?:number}).created===1,"Recovery lost the creation receipt.");
  const links=await db.from("ghl_statement_contact_links").select("id").eq("agency_id",agency);ok(links.data?.length===2,"Both original statement clients were not linked.");
  ok(contacts[0].customFields.find(f=>f.id==="StatusField123")?.value==="Active","Final synthetic status not verified.");
  ok(await processGhlImportJob(first.job.id)===false,"Completed job replayed.");
  const correction=await importFixture(true,first.id);ok(await processGhlImportJobs(workerDb)===1,"Worker did not consume corrected import.");const corrected=await db.from("ghl_import_jobs").select("state").eq("id",correction.job.id).single();ok(corrected.data?.state==="completed"&&creates===1&&notes.length===1&&puts===1,"Corrected import duplicated CRM records.");
  ok(contacts[1].customFields.find(f=>f.id==="StatusField123")?.value==="Unknown","Agent A changed agent B's contact.");
  producerId=agents[1];currentGhl="AgentBeta123";firstName="BETA";secondName="GAMMA";lastName="TESTER";currentMbi1="3AG4TE5MK75";currentMbi2="4AG4TE5MK76";
  const other=await importFixture();ok(await processGhlImportJobs(workerDb)===1,"Second agent job not consumed.");
  const otherJob=await db.from("ghl_import_jobs").select("*").eq("id",other.job.id).single();ok(otherJob.data?.state==="completed"&&Number(creates)===2&&Number(notes.length)===2&&Number(puts)===2,"Second agent workflow failed.");
  const allLinks=await db.from("ghl_statement_contact_links").select("*").eq("agency_id",agency);ok(allLinks.data?.filter(l=>l.actor_user_id===agents[0]&&l.ghl_user_id==="AgentAlpha123").length===2&&allLinks.data?.filter(l=>l.actor_user_id===agents[1]&&l.ghl_user_id==="AgentBeta123").length===2,"Statement links crossed agents.");
  const allOps=await db.from("ghl_policy_operations").select("*").eq("agency_id",agency);ok(allOps.data?.length===2&&allOps.data.every(o=>o.actor_user_id===agents[0]?o.ghl_user_id==="AgentAlpha123"&&o.contact_id==="ExistingContact123":o.actor_user_id===agents[1]&&o.ghl_user_id==="AgentBeta123"&&o.contact_id==="OtherAgentContact123"),"Policy operations crossed agents.");
  console.log("PASS two active agents in one shared location: each links/creates only its credited clients and writes only its assigned contact; retry and corrected imports remain duplicate-free. Real GHL requests: zero.");
 }finally{
  globalThis.fetch=nativeFetch;
  for(const table of ["ghl_statement_contact_links","ghl_statement_contact_operations","ghl_policy_operations","ghl_import_jobs","ghl_import_automation_settings","audit_events","ghl_connections","carrier_transactions","commission_statements"] as const)await db.from(table).delete().eq("agency_id",agency);
  if(paths.length)await db.storage.from("statements").remove(paths);
  for(const id of agents){await db.from("users").delete().eq("id",id).eq("agency_id",agency);await db.auth.admin.deleteUser(id);}
  if(userId){await db.from("users").delete().eq("id",userId).eq("agency_id",agency);await db.auth.admin.deleteUser(userId);}
  await db.from("agencies").delete().eq("id",agency);
 }
}
main().catch((error)=>{console.error("Synthetic agent drill failed:",error instanceof Error?error.message:"Unknown failure");process.exitCode=1;});
