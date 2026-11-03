import { expect,it } from "vitest";
import { detailsWritePlan,parseDetailsPayload } from "./detailsWritePlan";
import { statusHistoryNote } from "./statusWritePlan";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
const source={...syntheticSunfireCollection().records[0],carrier:"ULTIMATE HEALTH PLAN, INC."};
const fields=[{id:"PlanField123",key:"contact.1_policy_name",name:"Medicare Policy Name",type:"TEXT",options:[]},{id:"DateField123",key:"contact.date",name:"Medicare Policy Effective Date",type:"DATE",options:[]},{id:"TypeField123",key:"contact.policy_type",name:"Medicare Policy Type",type:"SINGLE_OPTIONS",options:["Medicare Advantage","Medicare Supplement"]}];
const input={source,ownerId:"owner",sourceHash:"a".repeat(64),assumption:{status:"Active",basis:"commission_reported",statementMonth:"2026-03"} as const,fields,contact:{firstName:"Synthetic",lastName:"Person",mbi:source.mbi,values:{} as Record<string,unknown>},applicationCount:1,connectionId:"Connection123",locationId:"Location123",ghlUserId:"User123",contactId:"Contact123",today:"2026-11-03"};
it("groups verified details with exact prior values in one private review and note",()=>{
 const p=detailsWritePlan({...input,contact:{...input.contact,values:{PlanField123:"Old plan",DateField123:"2025-01-01",TypeField123:"Medicare Supplement"}}});
 expect(p.payload?.changes).toHaveLength(3);expect(p.payload?.changes[0]).toMatchObject({previous:"Old plan",target:source.plan});expect(JSON.stringify(p)).not.toContain(source.mbi);
 const note=statusHistoryNote({id:"synthetic-operation",source_code:source.code,statement_month:"2026-03",previous_status:null,payload:p.payload});expect(note).toContain("Previous plan: Old plan | Effective: 01/01/2025 | Terminated: Not available | Type: Medicare Supplement");expect(note).toContain("→ Changed to: Example Plan | Effective: 02/01/2026 | Type: Medicare Advantage");expect(note).not.toContain(source.mbi);
});
it("recovers complete or partially applied fields against the original review without accepting unrelated edits",()=>{
 const p=detailsWritePlan(input),payload=p.payload!;
 for(const applied of [payload.changes.slice(0,1),payload.changes]){const values=Object.fromEntries(applied.map(c=>[c.fieldId,c.target]));expect(detailsWritePlan({...input,contact:{...input.contact,values},detailsOverride:payload}).reviewHash).toBe(p.reviewHash);}
 expect(()=>detailsWritePlan({...input,contact:{...input.contact,values:{PlanField123:"Outside edit"}},detailsOverride:payload})).toThrow();
});
it("blocks unpaid, future, newer, ambiguous or incorrectly mapped policies",()=>{
 expect(()=>detailsWritePlan({...input,assumption:null})).toThrow();expect(()=>detailsWritePlan({...input,applicationCount:2})).toThrow();expect(()=>detailsWritePlan({...input,source:{...source,proposedEffectiveDate:"2030-01-01"}})).toThrow();
 for(const values of [{DateField123:"2027-01-01"},{DateField123:"2026-02-30"},{PlanField123:"Other policy"}])expect(()=>detailsWritePlan({...input,contact:{...input.contact,values}})).toThrow();
 expect(()=>detailsWritePlan({...input,fields:fields.slice(1)})).toThrow();expect(()=>detailsWritePlan({...input,fields:[...fields,fields[0]]})).toThrow();expect(()=>detailsWritePlan({...input,fields:fields.map(f=>({...f,options:[]}))})).toThrow();
});
it("does not invent policy types or resend agreeing values",()=>{
 const p=detailsWritePlan({...input,source:{...source,carrier:"Unknown carrier"}});expect(p.payload?.changes.map(c=>c.key)).toEqual(["plan","date"]);
 expect(()=>detailsWritePlan({...input,contact:{...input.contact,values:{PlanField123:source.plan,DateField123:source.proposedEffectiveDate,TypeField123:"Medicare Advantage"}}})).toThrow();
});
it("rejects unsafe or duplicate history/field payloads",()=>{
 expect(()=>parseDetailsPayload({kind:"details",changes:[]})).toThrow();const p=detailsWritePlan(input).payload!;expect(()=>parseDetailsPayload({...p,changes:[p.changes[0],p.changes[0]]})).toThrow();expect(()=>detailsWritePlan({...input,source:{...source,plan:"Injected\nline"}})).toThrow();
});

it("includes an unchanged old effective date and explicit termination date without updating that field",()=>{
 const p=detailsWritePlan({...input,fields:[...fields,{id:"TermField123",key:"contact.term",name:"Medicare Policy Termination Date",type:"DATE",options:[]}],contact:{...input.contact,values:{PlanField123:"Old plan",DateField123:source.proposedEffectiveDate,TermField123:"2026-05-31",TypeField123:"Medicare Advantage"}}});
 expect(p.payload!.changes.map(c=>c.key)).toEqual(["plan"]);
 const note=statusHistoryNote({id:"synthetic",source_code:source.code,statement_month:"2026-03",previous_status:null,payload:p.payload});expect(note).toContain("Effective: 02/01/2026 | Terminated: 05/31/2026");expect(note.split("\n")).toHaveLength(4);
 expect(JSON.stringify(p.payload!.changes)).not.toContain("TermField123");
});
it("does not infer a termination date from the next effective date and keeps legacy recovery notes unchanged",()=>{
 const p=detailsWritePlan(input);expect(p.payload!.history!.previous.terminationDate).toBeNull();
 const legacy={kind:"details" as const,changes:p.payload!.changes};
 expect(detailsWritePlan({...input,detailsOverride:legacy}).payload!.history).toBeUndefined();
 const note=statusHistoryNote({id:"synthetic",source_code:source.code,statement_month:"2026-03",previous_status:null,payload:legacy});expect(note).toContain("ComFlow requested policy details update");
});
