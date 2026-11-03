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
  return <div className="max-w-3xl space-y-6">
    <Link className="text-sm underline" href="/settings">Back to Settings</Link><h1 className="text-2xl font-semibold">GoHighLevel setup</h1>
    <p>This connects your CRM for setup only. Contact matching and updates are not enabled, and no GHL contacts will be read or changed.</p>
    <section className="rounded-lg border p-5 space-y-3"><h2 className="text-lg font-semibold">Your own GHL location</h2><p className="text-sm">Use this if you have a separate sub-account. Shared agency users can use the connection below instead.</p>
      {personal && <><p>Verified: {personal.location_name} · Sub-account Location ID: {personal.location_id}</p><GhlManageForm id={personal.id} action="disconnect"/></>}
      <details open={!personal}><summary className="cursor-pointer font-medium">{personal?"Replace your saved token or location":"Connect your location"}</summary><div className="mt-3"><GhlConnectForm mode="personal"/></div></details>
    </section>
    <section className="rounded-lg border p-5 space-y-3"><h2 className="text-lg font-semibold">Shared agency location</h2>
      {shared ? <p>Verified: {shared.location_name} · Sub-account Location ID: {shared.location_id}</p>:<p>The agency owner connects this once. Agents do not need copies of the agency token.</p>}
      {user.role==="owner" ? <>
        {shared && <><GhlManageForm id={shared.id} action="disconnect"/><h3 className="font-medium">Agent mappings</h3><ul className="text-sm space-y-2">{setup.mappings.filter(m=>m.connection_id===shared.id).map(m=><li key={m.user_id}>{team.find(p=>p.id===m.user_id)?.name??"Teammate"} → GHL User ID: {m.ghl_user_id}</li>)}</ul><GhlManageForm id={shared.id} action="map" team={team}/><details><summary className="cursor-pointer text-sm">Remove a mapping</summary><GhlManageForm id={shared.id} action="unmap" team={team}/></details></>}
        <details open={!shared}><summary className="cursor-pointer font-medium">{shared?"Replace shared connection":"Connect the agency location"}</summary><p className="my-3 text-sm">Replacing the shared connection clears its agent mappings. Verify and map agents again afterward.</p><GhlConnectForm mode="shared"/></details>
      </>:<p className="text-sm">{setup.mappings.some(m=>m.user_id===user.id)?"Your shared-location mapping is saved. Contact access is not enabled yet.":"Ask your agency owner to map your ComFlow account to your GHL user."}</p>}
    </section>
    <details className="rounded-lg border p-5"><summary className="cursor-pointer font-medium">How to get the token securely</summary><ol className="mt-3 list-decimal pl-5 space-y-2 text-sm"><li>In the intended GHL sub-account, ask an authorized admin to create a Private Integration named ComFlow under Settings → Private Integrations.</li><li>For this setup, allow locations.readonly. Shared user verification also needs users.readonly. Do not grant contact write permissions for this phase.</li><li>Copy the token directly into the masked field here, along with that sub-account’s Location ID from Business Profile. Do not send it in chat or GitHub.</li><li>Save and test verifies only location/user metadata. The token is encrypted server-side and never displayed again.</li></ol><p className="mt-3 text-sm">For shared locations, find the GHL User ID in Users. It identifies a person, not a sub-account. An agent mapping does not yet grant contact access. Contact ownership checks will be built and tested before matching is enabled.</p><a className="mt-3 inline-block text-sm underline" href="https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know">GHL’s Private Integration guide</a></details>
  </div>;
}
