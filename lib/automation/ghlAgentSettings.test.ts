import {beforeEach,expect,it,vi} from "vitest";
import {ghlAutomationState,setGhlImportAutomation,resumeGhlImportJob} from "@/app/(dashboard)/settings/ghl/automationActions";
const m=vi.hoisted(()=>({role:vi.fn(),access:vi.fn(),verify:vi.fn(),queries:[] as {table:string;filters:unknown[][];upserts:unknown[]}[],missing:false}));
vi.mock("@/lib/auth/requireRole",()=>({requireRole:m.role}));
vi.mock("@/lib/repositories/ghlPreviewRepository",()=>({ghlPreviewAccess:m.access}));
vi.mock("@/lib/crm/gohighlevel/setupClient",()=>({verifyGhlUser:m.verify}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>{
 const record={table,filters:[] as unknown[][],upserts:[] as unknown[]};m.queries.push(record);
 const q:Record<string,unknown>={};for(const method of ["select","update","order","limit"])q[method]=()=>q;
 q.eq=(...args:unknown[])=>{record.filters.push(args);return q;};q.upsert=(value:unknown)=>{record.upserts.push(value);return Promise.resolve({error:null});};
 q.maybeSingle=async()=>({error:null,data:m.missing?null:table==="ghl_import_automation_settings"?{enabled:true}:{id:"own-job"}});
 q.then=(resolve:(r:unknown)=>unknown)=>Promise.resolve({error:null,data:[]}).then(resolve);return q;
}})}));
beforeEach(()=>{vi.clearAllMocks();m.queries.length=0;m.missing=false;m.role.mockResolvedValue({id:"agentA",agencyId:"agencyA",role:"agent",active:true});m.access.mockResolvedValue({connectionId:"shared",locationId:"Location123",ghlUserId:"UserAlpha123",token:"synthetic"});});
it("lets agents inspect only their own setting and processing receipts",async()=>{
 await ghlAutomationState();expect(m.role).toHaveBeenCalledWith(["owner","agent"]);
 for(const q of m.queries)expect(q.filters).toEqual(expect.arrayContaining([["agency_id","agencyA"],["actor_user_id","agentA"],["connection_id","shared"]]));
});
it("binds enabling to the authenticated agent and current verified mapping",async()=>{
 expect(await setGhlImportAutomation(true)).toEqual({ok:true});
 expect(m.verify).toHaveBeenCalledWith("Location123","UserAlpha123","synthetic");
 expect(m.queries[0].upserts[0]).toMatchObject({agency_id:"agencyA",actor_user_id:"agentA",connection_id:"shared",enabled:true});
});
it("cannot resume another agent's guessed job ID",async()=>{
 m.missing=true;const result=await resumeGhlImportJob("e0190000-0000-4000-8000-000000000701");expect(result).toHaveProperty("error");
 for(const q of m.queries.filter(q=>q.table==="ghl_import_jobs"))expect(q.filters).toContainEqual(["actor_user_id","agentA"]);
});
