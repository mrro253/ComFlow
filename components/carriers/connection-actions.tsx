"use client";

import { useActionState } from "react";
import { RefreshCw, Unplug } from "lucide-react";
import { disconnectCarrierLogin, syncCarrierNow } from "@/app/(dashboard)/carriers/actions";
import { Button } from "@/components/ui/button";

export function ConnectionActions({ connectionId, syncPending, syncBusy = false, enrollmentSource = false }: { connectionId: string; syncPending: boolean; syncBusy?: boolean; enrollmentSource?: boolean }) {
  const [syncState, syncAction, syncing] = useActionState(syncCarrierNow, undefined);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={syncAction}>
          <input type="hidden" name="connectionId" value={connectionId} />
          <Button type="submit" disabled={syncing || syncPending || syncBusy}>
            <RefreshCw className={`h-4 w-4${syncBusy ? " animate-spin" : ""}`} />
            {syncPending ? "Sync queued" : syncBusy ? "Sync in progress" : syncing ? "Requesting..." : enrollmentSource ? "Sync enrollments" : "Sync now"}
          </Button>
        </form>
      </div>
      {syncState?.error && (
        <p role="alert" className="text-sm text-destructive">{syncState.error}</p>
      )}
      {syncState?.info && (syncBusy || syncPending) && (
        <p role="status" className="text-sm text-muted-foreground">{syncState.info}</p>
      )}
    </div>
  );
}

export function RemoveCarrierLogin({ connectionId, busy }: { connectionId: string; busy: boolean }) {
  const [state, action, pending] = useActionState(disconnectCarrierLogin, undefined);
  return <form action={action}>
    <input type="hidden" name="connectionId" value={connectionId} />
    <Button type="submit" variant="ghost" disabled={pending || busy}><Unplug className="h-4 w-4" />Remove login</Button>
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
  </form>;
}
