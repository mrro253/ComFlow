import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {originalStatementEvidence} from "./ghlStatementService";
import {listEnrollmentStatuses} from "./enrollmentStatusService";
import {digest} from "@/lib/carriers/digest";
import {trackingSummary} from "@/lib/enrollments/trackingSummary";
import type {CurrentUser} from "@/types/domain";
import type {Database} from "@/types/database";
/** Saved evidence only. No token decryption, provider request, contact linking or record mutation. */
export async function ghlCoverage(user:CurrentUser){
 if(!user.active||!["owner","agent"].includes(user.role))throw new Error("Active producer required.");
 const [source,sales,session]=await Promise.all([originalStatementEvidence(user),listEnrollmentStatuses(user),createClient()]);
 const c=await session.from("ghl_connections").select("id,location_id").eq("agency_id",user.agencyId).eq("mode","shared");if(c.error|| (c.data?.length??0)>1)throw new Error("Connection metadata unavailable.");const connection=c.data?.[0];
 const mapping=connection?await session.from("ghl_agent_mappings").select("ghl_user_id").eq("agency_id",user.agencyId).eq("connection_id",connection.id).eq("user_id",user.id).maybeSingle():null;if(mapping?.error)throw new Error("Assignment metadata unavailable.");
 const assigned=mapping?.data?.ghl_user_id,db=createAdminClient();
 type Link=Database["public"]["Tables"]["ghl_statement_contact_links"]["Row"];
 type Op=Database["public"]["Tables"]["ghl_policy_operations"]["Row"];
 const links:Link[]=[],ops:Op[]=[];
 if(connection&&assigned){for(let start=0;;start+=500){if(start>=10000)throw new Error("Coverage limit exceeded.");const r=await db.from("ghl_statement_contact_links").select("*").eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("connection_id",connection.id).eq("ghl_user_id",assigned).order("id").range(start,start+499);if(r.error)throw new Error("Saved links unavailable.");links.push(...r.data??[]);if((r.data?.length??0)<500)break;}
 for(let start=0;;start+=500){if(start>=10000)throw new Error("Coverage limit exceeded.");const r=await db.from("ghl_policy_operations").select("*").eq("agency_id",user.agencyId).eq("actor_user_id",user.id).eq("connection_id",connection.id).eq("ghl_user_id",assigned).order("created_at",{ascending:false}).order("id",{ascending:false}).range(start,start+499);if(r.error)throw new Error("Saved updates unavailable.");ops.push(...r.data??[]);if((r.data?.length??0)<500)break;}}
 const groups=new Map<string,typeof source.rows>();for(const item of source.rows.filter(i=>i.entry.user_id===user.id)){const key=digest([item.entry.carrier,item.entry.carrier_member_id,item.entry.effective_date]);groups.set(key,[...groups.get(key)??[],item]);}
 const rows=[...groups].map(([key,items])=>{const latest=[...items].sort((a,b)=>b.row.statementMonth.localeCompare(a.row.statementMonth))[0],ids=new Set(items.map(i=>i.entry.id)),link=links.find(l=>l.source_key===key);
 const saved=link&&ids.has(link.source_entry_id),linkState=!connection?"not_connected":!assigned?"not_assigned":!link?"not_linked":saved?"linked":"recheck";
 const codes=new Set(items.map(i=>`STMT_${i.entry.id.replaceAll("-","")}`));
 const applications=sales.filter(s=>s.commission.evidence.some(e=>ids.has(e.entryId)));
 const operations=ops.filter(o=>codes.has(o.source_code)||applications.some(s=>s.code===o.source_code&&s.ownerId===o.source_owner_id));
 const pending=operations.some(o=>!["completed","cancelled","prepared"].includes(o.phase)),completed=operations.filter(o=>o.phase==="completed").length;
 return {key,name:latest.row.clientName,carrier:latest.row.carrier,effectiveDate:latest.row.effectiveDate,month:latest.row.statementMonth,linkState,updateState:pending?"paused":completed?"recorded":"not_recorded",verifiedUpdates:completed,enrollment:applications.length>0};});
 return {rows,tracking:trackingSummary(sales),enrollmentLinks:sales.filter(s=>s.ghlStatus==="linked").length,enrollmentLinkChecks:sales.filter(s=>s.ghlStatus==="recheck"||s.ghlStatus==="unavailable").length};
}
