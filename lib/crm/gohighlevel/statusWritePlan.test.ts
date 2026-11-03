import { expect,it } from "vitest";
import { statusWritePlan,statusHistoryNote } from "./statusWritePlan";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
const source=syntheticSunfireCollection().records[0];
const input={source,ownerId:"owner",sourceHash:"a".repeat(64),assumption:{status:"Active",basis:"commission_reported",statementMonth:"2026-03"} as const,fields:[{id:"MbiField123",key:"contact.medicare_number_mbi",name:"Medicare Number (MBI)",type:"TEXT",options:[]},{id:"PlanField123",key:"contact.1_policy_name",name:"Medicare Policy Name",type:"TEXT",options:[]},{id:"DateField123",key:"contact.verified_date",name:"Medicare Policy Effective Date",type:"DATE",options:[]},{id:"StatusField123",key:"contact.1_policy_status",name:"Medicare Policy Status",type:"SINGLE_OPTIONS",options:["Active","Inactive","Future Active","Unknown"]}],contact:{firstName:"Synthetic",lastName:"Person",mbi:source.mbi,values:{StatusField123:"Unknown"}},applicationCount:1,connectionId:"Connection123",locationId:"Location123",ghlUserId:"User123",contactId:"Contact123"};
it("binds one eligible field change to the reviewed policy/source/payment snapshot",()=>{
 const plan=statusWritePlan(input);expect(plan.fieldId).toBe("StatusField123");expect(plan.previousStatus).toBe("Unknown");expect(plan.reviewHash).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(plan)).not.toContain(source.mbi);
 expect(statusWritePlan({...input,contact:{...input.contact,values:{...input.contact.values,PlanField123:""}}}).reviewHash).not.toBe(plan.reviewHash);
 const after=statusWritePlan({...input,contact:{...input.contact,values:{StatusField123:"Active"}},previousOverride:"Unknown"});expect(after.reviewHash).toBe(plan.reviewHash);
 expect(()=>statusWritePlan({...input,assumption:null})).toThrow();expect(()=>statusWritePlan({...input,applicationCount:2})).toThrow();
});
it("limits the real history note to prior status, target, payment basis and application reference",()=>{
 const note=statusHistoryNote({id:"operation-synthetic",previous_status:"Unknown",source_code:source.code,statement_month:"2026-03"});expect(note).toContain("Previous Medicare policy status: Unknown");expect(note).toContain("not carrier-verified");expect(note).not.toContain(source.mbi);expect(note).not.toContain(source.firstName);
});
