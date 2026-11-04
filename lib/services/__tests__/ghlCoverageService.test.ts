import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {ghlCoverage} from "../ghlCoverageService";
import {digest} from "@/lib/carriers/digest";
import type {CurrentUser} from "@/types/domain";
const m=vi.hoisted(()=>({source:vi.fn(),sales:vi.fn(),filters:[] as unknown[][],links:[] as unknown[],ops:[] as unknown[],fail:false}));
vi.mock("../ghlStatementService",()=>({originalStatementEvidence:m.source}));vi.mock("../enrollmentStatusService",()=>({listEnrollmentStatuses:m.sales}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{const q:Record<string,unknown>={select:()=>q,eq:(...args:unknown[])=>{m.filters.push([table,...args]);return q;},maybeSingle:async()=>({data:{ghl_user_id:"MappedUser123"},error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[{id:"connection",location_id:"Location123"}],error:null}).then(resolve)};return q;}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>{const q:Record<string,unknown>={};for(const k of ["select","order"])q[k]=()=>q;q.eq=(...args:unknown[])=>{m.filters.push([table,...args]);return q;};q.range=async()=>({error:m.fail?{}:null,data:table==="ghl_statement_contact_links"?m.links:m.ops});return q;}})}));
const user={id:"actor",agencyId:"agency",role:"agent",active:true} as CurrentUser;
const entry={id:"entry",user_id:"actor",carrier:"Synthetic",carrier_member_id:"PRIVATE-MEMBER-ID",effective_date:"2026-01-01"};
beforeEach(()=>{vi.clearAllMocks();m.filters=[];m.links=[];m.ops=[];m.fail=false;m.sales.mockResolvedValue([]);m.source.mockResolvedValue({rows:[{entry,row:{clientName:"Example Person",carrier:"Synthetic",effectiveDate:"2026-01-01",statementMonth:"2026-03",medicareId:"PRIVATE-FULL-MBI"}},{entry:{...entry,id:"foreign",user_id:"someone-else"},row:{clientName:"Other Agent Client"}}]});vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("No provider request allowed");}));});
afterEach(()=>vi.unstubAllGlobals());
it("shows only credited policies and never calls GHL or returns source identifiers",async()=>{
 const result=await ghlCoverage(user);expect(result.rows).toHaveLength(1);expect(result.rows[0]).toMatchObject({name:"Example Person",linkState:"not_linked",updateState:"not_recorded"});expect(fetch).not.toHaveBeenCalled();
 for(const secret of ["PRIVATE-MEMBER-ID","PRIVATE-FULL-MBI","Other Agent Client"])expect(JSON.stringify(result)).not.toContain(secret);
 for(const table of ["ghl_statement_contact_links","ghl_policy_operations"])expect(m.filters).toEqual(expect.arrayContaining([[table,"agency_id","agency"],[table,"actor_user_id","actor"],[table,"connection_id","connection"],[table,"ghl_user_id","MappedUser123"]]));
});
it("distinguishes saved links, stale evidence, paused operations and completion receipts",async()=>{
 m.links=[{source_key:digest([entry.carrier,entry.carrier_member_id,entry.effective_date]),source_entry_id:"entry"}];m.ops=[{source_code:"STMT_entry",phase:"completed"}];
 expect((await ghlCoverage(user)).rows[0]).toMatchObject({linkState:"linked",updateState:"recorded",verifiedUpdates:1});
 m.links=[{source_key:digest([entry.carrier,entry.carrier_member_id,entry.effective_date]),source_entry_id:"retired-source"}];m.ops=[{source_code:"STMT_entry",phase:"field_pending"}];
 expect((await ghlCoverage(user)).rows[0]).toMatchObject({linkState:"recheck",updateState:"paused"});
});
it("fails closed on inaccessible evidence or unsupported accounts",async()=>{
 await expect(ghlCoverage({...user,active:false})).rejects.toThrow();expect(m.source).not.toHaveBeenCalled();
 await expect(ghlCoverage({...user,role:"manager"})).rejects.toThrow();m.fail=true;await expect(ghlCoverage(user)).rejects.toThrow("Saved links unavailable");
});
