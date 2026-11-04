import {expect,it} from "vitest";
import {holdReason,holdExplanations,readImportSummary,importResultStatus} from "./ghlImportResults";
it("distinguishes a complete run from a finished run with held checks",()=>{
 expect(importResultStatus({state:"completed",attempts:1,summary:{held:1}},true)).toMatchObject({attention:true,label:"Finished - some items were not updated"});
 expect(importResultStatus({state:"completed",attempts:1,summary:{}},true)).toMatchObject({attention:false,label:"Finished"});
});
it("distinguishes automatic retry, off, paused and stopped runs",()=>{
 const view=(state:string,enabled=true,attempts=1)=>importResultStatus({state,attempts,summary:{}},enabled).label;
 expect(view("queued")).toBe("Waiting to retry");expect(view("queued",true,0)).toBe("Waiting to process");expect(view("queued",false)).toBe("Automatic processing is off");expect(view("needs_attention")).toBe("Needs attention");expect(view("cancelled")).toBe("Stopped");
});
it("accepts legacy summaries and rejects invalid counters or provider text",()=>{
 const s=readImportSummary({linked:-3,created:"999",operationsCompleted:Infinity,holdReasons:[{reason:"Secret provider error with client name",count:3}]});
 expect(s.linked+s.created+s.updates).toBe(0);expect(s.reasons).toEqual([]);expect(readImportSummary(null).linked).toBe(0);
 expect(readImportSummary({linked:3,created:1,held:2,operationsCompleted:4,holdReasons:[{reason:"date",count:2}]})).toMatchObject({linked:3,created:1,held:2,updates:4,reasons:[{reason:"date",count:2}]});
});
it("converts raw hold explanations to fixed categories without saving their contents",()=>{
 expect(holdReason("A possible contact belongs to another GHL user")).toBe("assignment");expect(holdReason("Policy effective dates differ")).toBe("date");expect(holdReason("No Active assumption: chargeback")).toBe("payment");expect(holdReason("Full MBI identity conflict")).toBe("identity");expect(holdExplanations.date).toContain("policy dates do not agree");
});
