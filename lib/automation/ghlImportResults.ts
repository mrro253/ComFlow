export const holdExplanations={
 identity:"The client could not be matched confidently. No duplicate contact was created.",
 assignment:"The contact or commission belongs to a different agent. Nothing was reassigned.",
 date:"The policy dates do not agree. The current GHL policy was kept.",
 payment:"Commission evidence does not support an Active update, such as a chargeback or deduction.",
 unavailable:"The original source or current GHL information could not be verified.",
 unsupported:"The available information does not support an automatic update. Current GHL values were kept.",
} as const;
export type HoldReason=keyof typeof holdExplanations;
export function holdReason(reason:string):HoldReason{
 if(/different agent|another.*user|credited|assignment|belongs to/i.test(reason))return "assignment";
 if(/date|newer.*policy|policy differs|policy.*newer/i.test(reason))return "date";
 if(/chargeback|deduction|payment evidence|No Active assumption/i.test(reason))return "payment";
 if(/unavailable|incomplete|unconfirmed|\bchanged\b|unverified|source.*verif/i.test(reason))return "unavailable";
 if(/identity|match|duplicate|contact|name|MBI/i.test(reason))return "identity";
 return "unsupported";
}
export function resultCount(value:unknown){return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:0;}
export function readImportSummary(raw:unknown){
 const s=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
 const reasons=Array.isArray(s.holdReasons)?s.holdReasons.flatMap((r:unknown)=>{if(!r||typeof r!=="object")return [];const x=r as Record<string,unknown>;return typeof x.reason==="string"&&Object.hasOwn(holdExplanations,x.reason)&&resultCount(x.count)>0?[{reason:x.reason as HoldReason,count:resultCount(x.count)}]:[];}).slice(0,6):[];
 return {policies:resultCount(s.policies),linked:resultCount(s.linked),created:resultCount(s.created),held:resultCount(s.held),updates:resultCount(s.operationsCompleted),fields:resultCount(s.fieldsChanged),reasons};
}

export function importResultStatus(job:{state:string;attempts:number;summary:unknown},enabled:boolean){
 const s=readImportSummary(job.summary),attention=job.state==="needs_attention"||job.state==="completed"&&(s.held>0||s.reasons.length>0);
 const label=job.state==="queued"?(!enabled?"Automatic processing is off":job.attempts>0?"Waiting to retry":"Waiting to process"):job.state==="running"?"Updating GHL":job.state==="completed"?(attention?"Finished - some items were not updated":"Finished"):job.state==="needs_attention"?"Needs attention":"Stopped";
 return {attention,label};
}
