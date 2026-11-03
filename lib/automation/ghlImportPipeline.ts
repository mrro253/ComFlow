export interface ImportAutomationSummary {policies:number;linked:number;created:number;held:number;operationsCompleted:number;fieldsChanged:number}
export interface ImportAutomationDependencies {
 heartbeat:()=>Promise<void>;
 contacts:()=>Promise<{result:string}[]>;
 recover:()=>Promise<number|{operations:number;fields:number}>;
 initialSummary?:Partial<ImportAutomationSummary>;
 checkpoint?:(summary:ImportAutomationSummary)=>Promise<void>;
 policyPreview:()=>Promise<{code:string;detailsProposal?:boolean;statusProposal:boolean}[]>;
 statementPreview:()=>Promise<{code:string;proposal:boolean}[]>;
 affectedCodes:Set<string>;
 send:(code:string,details:boolean)=>Promise<{changed:boolean;fieldCount:number}>;
}
/** External mutations stay in the existing durable contact/status journals. */
export async function runGhlImportPipeline(d:ImportAutomationDependencies){
 const summary:ImportAutomationSummary={policies:0,linked:0,created:0,held:0,operationsCompleted:0,fieldsChanged:0};
 for(const key of Object.keys(summary) as (keyof ImportAutomationSummary)[]){const n=d.initialSummary?.[key];if(typeof n==="number"&&Number.isSafeInteger(n)&&n>=0)summary[key]=n;}
 const save=()=>d.checkpoint?.({...summary});
 await d.heartbeat();const contacts=await d.contacts();summary.policies=contacts.length;
 summary.created=Math.max(summary.created,contacts.filter(r=>r.result==="Created and linked").length);
 summary.linked=contacts.filter(r=>["Linked","Already linked","Created and linked"].includes(r.result)).length;
 summary.held=contacts.filter(r=>r.result==="Needs review").length;
 await save();await d.heartbeat();const recovered=await d.recover();summary.operationsCompleted+=typeof recovered==="number"?recovered:recovered.operations;summary.fieldsChanged+=typeof recovered==="number"?0:recovered.fields;await save();
 async function send(code:string,details:boolean){await d.heartbeat();const r=await d.send(code,details);summary.operationsCompleted++;summary.fieldsChanged+=r.fieldCount;await save();}
 // Re-read after details: correcting a plan can make an Active proposal eligible.
 for(const row of await d.policyPreview())if(d.affectedCodes.has(row.code)&&row.detailsProposal)await send(row.code,true);
 for(const row of await d.policyPreview())if(d.affectedCodes.has(row.code)&&row.statusProposal)await send(row.code,false);
 for(const row of await d.statementPreview())if(row.proposal)await send(row.code,false);
 await d.heartbeat();return summary;
}
