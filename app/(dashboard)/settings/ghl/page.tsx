import { GhlImportAutomation } from "@/components/settings/ghl-import-automation";
import { ghlAutomationState } from "./automationActions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listGhlSetup } from "@/lib/repositories/ghlSetupRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { GhlConnectForm,GhlManageForm } from "@/components/settings/ghl-setup-forms";

export default async function GhlSetupPage() {
  const user=await getCurrentUser(); if(!user)redirect("/login");
  let setup:Awaited<ReturnType<typeof listGhlSetup>>;
  try {setup=await listGhlSetup();} catch {return <div className="space-y-4"><h1 className="text-2xl font-semibold">GoHighLevel setup</h1><p>Secure connection setup is waiting for its database update. No token has been requested or saved.</p></div>;}
  const personal=setup.connections.find(c=>c.mode==="personal"&&c.user_id===user.id),shared=setup.connections.find(c=>c.mode==="shared");
  const team=user.role==="owner"?(await listUsersForAgency(user.agencyId)).filter(p=>p.active).map(p=>({id:p.id,name:`${p.firstName} ${p.lastName}`})):[];
  let automation:Awaited<ReturnType<typeof ghlAutomationState>>|null=null;if(["owner","agent"].includes(user.role)&&shared){try{automation=await ghlAutomationState();}catch{/* Setup remains usable while migration is pending. */}}
  return <div className="max-w-3xl space-y-6">
    <Link className="text-sm underline" href="/settings">Back to Settings</Link><h1 className="text-2xl font-semibold">GoHighLevel setup</h1>
    <p>Connect a sub-account once, then assign yourself or your teammates by GHL User ID.</p><p>Manage matching and policy updates here. Automatic processing can run after future statement imports; uncertain matches remain available for review.</p>
    <Link href="/settings/ghl/preview" className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Preview contact matches — read only</Link>
    <Link href="/settings/ghl/updates" className="inline-flex rounded-md border px-4 py-2 text-sm font-medium">Review policy updates</Link>
    {automation&&<GhlImportAutomation initial={automation}/>}
    <section className="rounded-lg border p-5 space-y-3"><h2 className="text-lg font-semibold">{user.role==="owner"?"Step 1: Connect your GHL sub-account":"Your agency connection"}</h2>
      {shared ? <p>Verified: {shared.location_name} · Sub-account Location ID: {shared.location_id}</p>:<p>Connect this once for yourself or your agency. After saving, assign yourself and any teammates using their GHL User IDs. Assigned agents do not need a Location ID or token.</p>}
      {user.role==="owner" ? <>
        <details open={!shared}><summary className="cursor-pointer font-medium">{shared?"Manage connection":"Enter sub-account connection details"}</summary>{shared && <><p className="my-3 text-sm">Replacing this connection clears its user assignments. Assign users again afterward.</p><GhlManageForm id={shared.id} action="disconnect"/></>}<div className="mt-3"><GhlConnectForm mode="shared"/></div></details>
      </>:<p className="text-sm">{setup.mappings.some(m=>m.user_id===user.id)?"Your GHL User ID is assigned. Matching and automatic updates use only your credited commissions and contacts assigned to you in GHL.":"Your agency owner handles setup. Ask them to assign your ComFlow account using your GHL User ID from GHL → Users. You do not need to enter a Location ID or token."}</p>}
    </section>
    {user.role==="owner" && <section className="rounded-lg border p-5 space-y-3">
      <h2 className="text-lg font-semibold">Step 2: Assign yourself or teammates</h2>
      <p className="text-sm">Select a ComFlow user and enter their GHL User ID from GHL → Users. Choose yourself if you are the only person using this sub-account.</p>
      {shared ? <><ul className="text-sm space-y-2">{setup.mappings.filter(m=>m.connection_id===shared.id).map(m=><li key={m.user_id}>{team.find(p=>p.id===m.user_id)?.name??"Teammate"} · GHL User ID: {m.ghl_user_id}</li>)}</ul><GhlManageForm id={shared.id} action="map" team={team}/><details><summary className="cursor-pointer text-sm">Remove a user assignment</summary><GhlManageForm id={shared.id} action="unmap" team={team}/></details></>:<p className="rounded-md bg-muted p-3 text-sm">Save the connection in Step 1 to enable the user selection and GHL User ID field here.</p>}
    </section>}
    {(user.role!=="owner" || personal) && <details className="rounded-lg border p-5 space-y-3"><summary className="cursor-pointer font-medium">Manage a separate personal connection</summary><p className="text-sm">Only use this if you have a separate sub-account outside your agency connection. This connection is private to your ComFlow account.</p>
      {personal && <><p>Verified: {personal.location_name} · Sub-account Location ID: {personal.location_id}</p><GhlManageForm id={personal.id} action="disconnect"/></>}
      <details open={!personal}><summary className="cursor-pointer font-medium">{personal?"Replace your saved token or location":"Connect your location"}</summary><div className="mt-3"><GhlConnectForm mode="personal"/></div></details>
    </details>}
    <details className="rounded-lg border p-5"><summary className="cursor-pointer font-medium">How to get the token securely</summary><ol className="mt-3 list-decimal pl-5 space-y-2 text-sm"><li>In the intended GHL sub-account, ask an authorized admin to create a Private Integration named ComFlow under Settings → Private Integrations.</li><li>Allow locations.readonly and users.readonly for setup; contacts.readonly and locations/customFields.readonly for previews; contacts.write for separately reviewed status updates.</li><li>Copy the token directly into the masked field here, along with that sub-account’s Location ID from Business Profile. Do not send it in chat or GitHub.</li><li>Save and test verifies only location/user metadata. The token is encrypted server-side and never displayed again.</li></ol><p className="mt-3 text-sm">For shared locations, find the GHL User ID in Users. It identifies a person, not a sub-account. Contact previews and reviewed updates are limited to contacts assigned to that mapped GHL user.</p><a className="mt-3 inline-block text-sm underline" href="https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know">GHL’s Private Integration guide</a></details>
  </div>;
}
