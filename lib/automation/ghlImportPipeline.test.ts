import { expect,it,vi } from "vitest";
import { runGhlImportPipeline,type ImportAutomationDependencies } from "./ghlImportPipeline";
function fixture(){
 const order:string[]=[];let preview=0;
 const d:ImportAutomationDependencies={heartbeat:vi.fn(async()=>{}),affectedCodes:new Set(["Affected"]),contacts:vi.fn(async()=>{order.push("contacts");return [{result:"Created and linked"},{result:"Needs review"}];}),recover:vi.fn(async()=>{order.push("recover");return 1;}),policyPreview:vi.fn(async()=>++preview===1?[{code:"Affected",detailsProposal:true,statusProposal:false},{code:"Unrelated",detailsProposal:true,statusProposal:true}]:[{code:"Affected",statusProposal:true},{code:"Unrelated",statusProposal:true}]),statementPreview:vi.fn(async()=>[{code:"Statement",proposal:true},{code:"Held",proposal:false}]),send:vi.fn(async(code,details)=>{order.push(`${code}/${details}`);return {changed:true,fieldCount:details?3:1};})};return {d,order};
}
it("links/creates before updates, recovers uncertain operations first, and limits updates to affected policies",async()=>{
 const {d,order}=fixture();expect(await runGhlImportPipeline(d)).toEqual({policies:2,linked:1,created:1,held:1,operationsCompleted:4,fieldsChanged:5});expect(order).toEqual(["contacts","recover","Affected/true","Affected/false","Statement/false"]);expect(d.send).not.toHaveBeenCalledWith("Unrelated",expect.anything());expect(d.send).not.toHaveBeenCalledWith("Held",expect.anything());
});
it("stops after uncertain recovery or a lost write response rather than sending later proposals",async()=>{
 const f=fixture();f.d.recover=vi.fn().mockRejectedValue(new Error("uncertain note"));await expect(runGhlImportPipeline(f.d)).rejects.toThrow();expect(f.d.send).not.toHaveBeenCalled();
 const g=fixture();g.d.send=vi.fn().mockRejectedValue(new Error("response lost"));await expect(runGhlImportPipeline(g.d)).rejects.toThrow();expect(g.d.send).toHaveBeenCalledTimes(1);expect(g.d.statementPreview).not.toHaveBeenCalled();
});
it("rechecks the job lease before each external step",async()=>{
 const f=fixture();f.d.heartbeat=vi.fn().mockRejectedValue(new Error("revoked"));await expect(runGhlImportPipeline(f.d)).rejects.toThrow();expect(f.d.contacts).not.toHaveBeenCalled();expect(f.d.send).not.toHaveBeenCalled();
});
