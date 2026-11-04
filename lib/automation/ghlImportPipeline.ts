import {holdReason,type HoldReason} from "./ghlImportResults";
export interface ImportAutomationSummary {policies:number;linked:number;created:number;held:number;operationsCompleted:number;fieldsChanged:number;holdReasons?:{reason:HoldReason;count:number}[]}
export interface ImportAutomationDependencies {
 heartbeat:()=>Promise<void>;
 contacts:()=>Promise<{result:string;reason?:string}[]>;
 recover:()=>Promise<number|{operations:number;fields:number}>;
 initialSummary?:Partial<ImportAutomationSummary>;
 checkpoint?:(summary:ImportAutomationSummary)=>Promise<void>;
 policyPreview:()=>Promise<{code:string;detailsProposal?:boolean;statusProposal:boolean;fields?:{label:string;decision:string}[]}[]>;
 statementPreview:()=>Promise<{code:string;proposal:boolean;note?:string}[]>;
 affectedCodes:Set<string>;
 send:(code:string,details:boolean)=>Promise<{changed:boolean;fieldCount:number}>;
}
/** External mutations stay in the existing durable contact/status journals. */
export async function runGhlImportPipeline(d:ImportAutomationDependencies){
 const summary:ImportAutomationSummary={policies:0,linked:0,created:0,held:0,operationsCompleted:0,fieldsChanged:0};
 for(const key of Object.keys(summary) as (Exclude<keyof ImportAutomationSummary,"holdReasons">)[]){const n=d.initialSummary?.[key];if(typeof n==="number"&&Number.isSafeInteger(n)&&n>=0)summary[key]=n;}
 const save=()=>d.checkpoint?.({...summary});
 await d.heartbeat();const contacts=await d.contacts();summary.policies=contacts.length;
 summary.created=Math.max(summary.created,contacts.filter(r=>r.result==="Created and linked").length);
 summary.linked=contacts.filter(r=>["Linked","Already linked","Created and linked"].includes(r.result)).length;
 summary.held=contacts.filter(r=>r.result==="Needs review").length;
 const reasons=new Map<HoldReason,number>();
 const explain=(text:string)=>{const reason=holdReason(text);reasons.set(reason,(reasons.get(reason)??0)+1);};
 for(const row of contacts)if(row.result==="Needs review")explain(row.reason??"Contact identity needs review");
 const saveReasons=()=>{summary.holdReasons=[...reasons].map(([reason,count])=>({reason,count}));};saveReasons();
 await save();await d.heartbeat();const recovered=await d.recover();summary.operationsCompleted+=typeof recovered==="number"?recovered:recovered.operations;summary.fieldsChanged+=typeof recovered==="number"?0:recovered.fields;await save();
 async function send(code:string,details:boolean){await d.heartbeat();const r=await d.send(code,details);summary.operationsCompleted++;summary.fieldsChanged+=r.fieldCount;await save();}
 // Re-read after details: correcting a plan can make an Active proposal eligible.
 for(const row of await d.policyPreview())if(d.affectedCodes.has(row.code)&&row.detailsProposal)await send(row.code,true);
 for(const row of await d.policyPreview())if(d.affectedCodes.has(row.code)&&row.statusProposal)await send(row.code,false);
 for(const row of await d.policyPreview())if(d.affectedCodes.has(row.code)){
  const held=new Set<HoldReason>();for(const field of row.fields??[])if(field.label!=="Medicare policy member ID"&&field.decision.startsWith("Keep unchanged"))held.add(holdReason(field.decision));
  for(const reason of held)reasons.set(reason,(reasons.get(reason)??0)+1);
 }
 for(const row of await d.statementPreview()){if(row.proposal)await send(row.code,false);else if(row.note&&!row.note.startsWith("Already Active")&&!row.note.startsWith("Only Active status is supported"))explain(row.note);}
 saveReasons();
 await d.heartbeat();return summary;
}
