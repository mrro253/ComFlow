import {commissionStatusLabels} from "./commissionStatus";
export const waitingExplanations={no_statements:"No statements for this carrier yet",match_unverified:"A possible match is not verified",not_reported:"No matching commission reported yet"} as const;
export function trackingSummary(sales:{commission:{label:string;waitingReason:keyof typeof waitingExplanations|null;outcomeConflict:boolean}}[]){
 return {total:sales.length,counts:Object.fromEntries(commissionStatusLabels.map(label=>[label,sales.filter(s=>s.commission.label===label).length])),waiting:Object.entries(waitingExplanations).map(([key,label])=>({key,label,count:sales.filter(s=>s.commission.waitingReason===key).length})).filter(r=>r.count>0),outcomeConflicts:sales.filter(s=>s.commission.outcomeConflict).length};
}
