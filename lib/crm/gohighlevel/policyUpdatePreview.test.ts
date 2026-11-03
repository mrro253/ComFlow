import { afterEach,expect,it,vi } from "vitest";
import { buildPolicyPreview,readPolicyContact,readPolicyFields,type PolicyField } from "./policyUpdatePreview";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
const source=syntheticSunfireCollection().records[0];
const field=(id:string,key:string,name:string,type="TEXT"):PolicyField=>({id,key,name,type,options:["Medicare Advantage","Active","Inactive","Future Active","Unknown"]});
const fields=[field("MbiField123","contact.medicare_number_mbi","Medicare Number (MBI)"),field("PlanField123","contact.1_policy_name","Medicare Policy Name"),field("DateField123","contact.actual_verified_date_key","Medicare Policy Effective Date","DATE"),field("TypeField123","contact.policy_type","Medicare Policy Type","SINGLE_OPTIONS"),field("MemberField123","contact.member_id","Medicare Policy Member ID"),field("StatusField123","contact.1_policy_status","Medicare Policy Status","SINGLE_OPTIONS")];
const contact={firstName:"Example",lastName:"Person",mbi:source.mbi,values:{PlanField123:"Existing plan",DateField123:"2027-01-01",TypeField123:"Medicare Advantage",MemberField123:"PRIVATE-MEMBER-ID",StatusField123:"Active"}};
afterEach(()=>vi.unstubAllGlobals());
it("preserves current policy fields despite proposed dates or commission activity",()=>{
 const preview=buildPolicyPreview(source,fields,contact,1,"2026-11-02T00:00:00Z");
 expect(preview.fields.find(f=>f.label==="Medicare policy status")).toMatchObject({current:"Active",enrollment:"Coverage status not verified",decision:"Keep existing value"});
 expect(preview.fields.find(f=>f.label==="Medicare policy name")?.decision).toContain("current coverage not confirmed");
 expect(preview.fields.find(f=>f.label==="Medicare policy effective date")?.current).toBe("2027-01-01");
 expect(JSON.stringify(preview)).not.toContain(source.mbi);expect(JSON.stringify(preview)).not.toContain("PRIVATE-MEMBER-ID");expect(preview.noteDraft).toContain("not proof");expect(preview.historyDraft).toContain("not being declared historical");
});
it("holds multiple applications, absent or ambiguous mappings and unsupported field types",()=>{
 expect(buildPolicyPreview(source,fields,contact,2,"now").reason).toContain("Multiple applications");
 const ambiguous=buildPolicyPreview(source,[...fields,{...fields[1],id:"SecondPlan123"}],contact,1,"now");expect(ambiguous.fields[0].decision).toContain("mapping unavailable");
 const unsupported=buildPolicyPreview(source,fields.map(f=>f.id==="PlanField123"?{...f,type:"FILE_UPLOAD"}:f),contact,1,"now");expect(unsupported.fields[0].decision).toContain("type needs verification");
 expect(buildPolicyPreview(source,[],contact,1,"now").fields.every(f=>f.decision.includes("mapping unavailable"))).toBe(true);
});
it("requires a current exact full MBI and never swaps member ID for MBI",()=>{
 expect(()=>buildPolicyPreview(source,fields,{...contact,mbi:null},1,"now")).toThrow();expect(()=>buildPolicyPreview(source,fields,{...contact,mbi:"9AB2CD3EF45"},1,"now")).toThrow();
});
it("reads fixed-host GET contact details only after checking user and location",async()=>{
 const payload={contact:{id:"Contact123",locationId:"Location123",assignedTo:"User123",customFields:[{id:"MbiField123",value:source.mbi},{id:"PlanField123",value:"Existing plan"},{id:"Unrelated123",value:"DO-NOT-EXPOSE"}],ss:"DO-NOT-EXPOSE"}};
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));vi.stubGlobal("fetch",fetcher);
 const result=await readPolicyContact("Location123","User123","synthetic-private-token-for-test","Contact123",fields);
 expect(JSON.stringify(result.values)).not.toContain("DO-NOT-EXPOSE");expect(fetcher.mock.calls[0][0]).toBe("https://services.leadconnectorhq.com/contacts/Contact123");expect(fetcher.mock.calls[0][1]).toMatchObject({method:"GET",redirect:"error",cache:"no-store"});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({contact:{...payload.contact,assignedTo:"OtherUser"}}))));await expect(readPolicyContact("Location123","User123","synthetic-private-token-for-test","Contact123",fields)).rejects.toThrow();
});
it("rejects duplicate metadata and keeps foreign location fields out",async()=>{
 const raw={id:"Field123",name:"Plan",fieldKey:"contact.1_policy_name",dataType:"TEXT",model:"contact",locationId:"Location123"};
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({customFields:[raw,{...raw,id:"Foreign123",locationId:"OtherLocation"}]}))));expect(await readPolicyFields("Location123","synthetic-private-token-for-test")).toHaveLength(1);
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({customFields:[raw,raw]}))));await expect(readPolicyFields("Location123","synthetic-private-token-for-test")).rejects.toThrow("Duplicate");
});
