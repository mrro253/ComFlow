import { expect,it,vi } from "vitest";
import { executeStatusWrite } from "./statusWriteEngine";
import type { PolicyOperation } from "@/lib/repositories/ghlPolicyOperationRepository";
function fixture(){
 let op={id:"e0140000-0000-4000-8000-000000000001",phase:"prepared",note_id:null,field_id:"StatusField123",source_code:"SYNTHETIC1",statement_month:"2026-03",previous_status:"Unknown"} as PolicyOperation;
 let active=false,note=false;const order:string[]=[];
 const deps={validate:vi.fn(async()=>active?"active" as const:"previous" as const),findNote:vi.fn(async()=>note?"Note123":null),createNote:vi.fn(async()=>{order.push("note");note=true;return "Note123";}),setActive:vi.fn(async()=>{order.push("field");active=true;}),checkpoint:vi.fn(async(phase:PolicyOperation["phase"],noteId?:string)=>{order.push(phase);op={...op,phase,note_id:noteId??op.note_id};return op;})};
 return {deps,order,get operation(){return op;},setActive:()=>{active=true;},setNote:()=>{note=true;}};
}
it("saves/validates history before the one-field change and confirms the final value",async()=>{
 const f=fixture();expect(await executeStatusWrite(f.operation,f.deps)).toEqual({changed:true});expect(f.operation.phase).toBe("completed");expect(f.order.indexOf("note_pending")).toBeLessThan(f.order.indexOf("note"));expect(f.order.indexOf("note")).toBeLessThan(f.order.indexOf("field"));expect(f.deps.setActive).toHaveBeenCalledWith("StatusField123");
});
it("reconciles a note that succeeded before a lost response without posting it twice",async()=>{
 const f=fixture();f.deps.createNote.mockImplementationOnce(async()=>{f.setNote();throw new Error("lost response");});await expect(executeStatusWrite(f.operation,f.deps)).rejects.toThrow();expect(f.operation.phase).toBe("note_pending");
 await executeStatusWrite(f.operation,f.deps);expect(f.deps.createNote).toHaveBeenCalledTimes(1);expect(f.deps.setActive).toHaveBeenCalledTimes(1);
});
it("does not blindly repeat an unconfirmed POST when the history note cannot be found",async()=>{
 const f=fixture();f.deps.createNote.mockRejectedValueOnce(new Error("unknown"));await expect(executeStatusWrite(f.operation,f.deps)).rejects.toThrow();await expect(executeStatusWrite(f.operation,f.deps)).rejects.toThrow("not be posted again");expect(f.deps.createNote).toHaveBeenCalledTimes(1);expect(f.deps.setActive).not.toHaveBeenCalled();
});
it("resolves a field update that succeeded before a lost response without a duplicate note or PUT",async()=>{
 const f=fixture();f.deps.setActive.mockImplementationOnce(async()=>{f.setActive();throw new Error("lost response");});await expect(executeStatusWrite(f.operation,f.deps)).rejects.toThrow();expect(f.operation.phase).toBe("field_pending");await executeStatusWrite(f.operation,f.deps);expect(f.deps.createNote).toHaveBeenCalledTimes(1);expect(f.deps.setActive).toHaveBeenCalledTimes(1);expect(f.operation.phase).toBe("completed");
});
it("stops if history disappears or current policy evidence changes before the PUT",async()=>{
 const f=fixture();f.deps.findNote.mockResolvedValueOnce(null).mockResolvedValueOnce(null);await expect(executeStatusWrite(f.operation,f.deps)).rejects.toThrow("History preservation");expect(f.deps.setActive).not.toHaveBeenCalled();
 const g=fixture();g.deps.validate.mockResolvedValueOnce("previous").mockResolvedValueOnce("previous").mockRejectedValueOnce(new Error("changed"));await expect(executeStatusWrite(g.operation,g.deps)).rejects.toThrow("changed");expect(g.deps.setActive).not.toHaveBeenCalled();
});
it("does not create a history note when an untouched prepared operation is already Active",async()=>{
 const f=fixture();f.setActive();expect(await executeStatusWrite(f.operation,f.deps)).toEqual({changed:false});expect(f.deps.createNote).not.toHaveBeenCalled();expect(f.deps.setActive).not.toHaveBeenCalled();
});
it("does not dispatch the PUT if its lease was lost during final remote validation",async()=>{
 const f=fixture(),checkpoint=f.deps.checkpoint.getMockImplementation()!;let checks=0;
 f.deps.checkpoint.mockImplementation(async(phase,noteId)=>{if(phase==="field_pending"&&++checks===2)throw new Error("lost lease");return checkpoint(phase,noteId);});
 await expect(executeStatusWrite(f.operation,f.deps)).rejects.toThrow("lost lease");expect(f.deps.setActive).not.toHaveBeenCalled();
});
