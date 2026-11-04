import {expect,it} from "vitest";
import {trackingSummary} from "../trackingSummary";
it("separates missing carrier statements from unverified matches and unreported commissions",()=>{
 const rows=[{label:"Not paid yet",waitingReason:"no_statements" as const,outcomeConflict:false},{label:"Not paid yet",waitingReason:"match_unverified" as const,outcomeConflict:false},{label:"Not paid yet",waitingReason:"not_reported" as const,outcomeConflict:false},{label:"Paid",waitingReason:null,outcomeConflict:false},{label:"No commission expected",waitingReason:null,outcomeConflict:true}].map(commission=>({commission}));
 const result=trackingSummary(rows);expect(result.total).toBe(5);expect(result.counts["Not paid yet"]).toBe(3);expect(result.waiting.map(r=>r.count)).toEqual([1,1,1]);expect(result.outcomeConflicts).toBe(1);
});
