"use client";
import { useActionState,useEffect,useRef } from "react";
import { saveGhlConnection,manageGhlSetup,type GhlSetupResult } from "@/app/(dashboard)/settings/ghl/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const initial:GhlSetupResult={};
function Result({state}:{state:GhlSetupResult}) {return <>{state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}{state.info && <p role="status" className="text-sm">{state.info}</p>}</>;}
export function GhlConnectForm({mode}:{mode:"personal"|"shared"}) {
  const [state,action,pending]=useActionState(saveGhlConnection,initial); const token=useRef<HTMLInputElement>(null);
  useEffect(()=>{if((state.info||state.error)&&token.current)token.current.value="";},[state]);
  return <form action={action} className="space-y-3">
    <input type="hidden" name="mode" value={mode}/>
    <label className="block text-sm">GHL Location ID<Input name="locationId" required pattern="[A-Za-z0-9]{6,80}" autoComplete="off"/></label>
    <label className="block text-sm">Private Integration Token<Input ref={token} name="token" type="password" required minLength={20} maxLength={4096} autoComplete="off" spellCheck={false}/></label>
    <Button type="submit" disabled={pending}>{pending?"Verifying…":"Save and test connection"}</Button>
    <Result state={state}/>
  </form>;
}
export function GhlManageForm({id,action:operation,team=[]}:{id:string;action:"disconnect"|"map"|"unmap";team?:{id:string;name:string}[]}) {
  const [state,action,pending]=useActionState(manageGhlSetup,initial);
  return <form action={action} className="space-y-3">
    <input type="hidden" name="id" value={id}/><input type="hidden" name="action" value={operation}/>
    {operation!=="disconnect" && <label className="block text-sm">ComFlow teammate<select name="userId" required className="block w-full rounded-md border bg-background p-2"><option value="">Choose a teammate</option>{team.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
    {operation==="map" && <label className="block text-sm">GHL user ID<Input name="ghlUserId" required pattern="[A-Za-z0-9]{6,80}" autoComplete="off"/></label>}
    <Button type="submit" variant="outline" disabled={pending}>{pending?"Saving…":operation==="map"?"Verify and map agent":operation==="unmap"?"Remove agent mapping":"Disconnect"}</Button><Result state={state}/>
  </form>;
}
