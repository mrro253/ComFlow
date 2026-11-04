import Link from "next/link";
import {ghlAutomationState} from "../automationActions";
import {GhlSyncResults} from "@/components/settings/ghl-sync-results";
export default async function GhlResultsPage(){
 let state:Awaited<ReturnType<typeof ghlAutomationState>>;
 try{state=await ghlAutomationState();}catch{return <div className="max-w-4xl space-y-4"><h1 className="text-2xl font-semibold">GHL sync results</h1><p>Results are unavailable. Check your saved connection and GHL User ID assignment.</p><Link className="underline" href="/settings/ghl">Open GHL setup</Link></div>;}
 return <div className="max-w-4xl space-y-5"><Link className="text-sm underline" href="/settings/ghl">Back to GHL setup</Link><h1 className="text-2xl font-semibold">GHL sync results</h1><p>See what happened in GHL after each statement import. Commission imports and GHL updates are separate: a GHL delay does not undo your imported statement.</p><GhlSyncResults initial={state}/></div>;
}
