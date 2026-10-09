"use client";

import { useActionState } from "react";
import { RefreshCw, Unplug } from "lucide-react";
import { disconnectCarrierLogin, syncCarrierNow } from "@/app/(dashboard)/carriers/actions";
import { Button } from "@/components/ui/button";

export function ConnectionActions({ connectionId, syncPending }: { connectionId: string; syncPending: boolean }) {
  const [syncState, syncAction, syncing] = useActionState(syncCarrierNow, undefined);
  const [disconnectState, disconnectAction, disconnecting] = useActionState(disconnectCarrierLogin, undefined);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={syncAction}>
          <input type="hidden" name="connectionId" value={connectionId} />
          <Button type="submit" variant="outline" disabled={syncing || syncPending}>
            <RefreshCw className="h-4 w-4" />
            {syncPending ? "Sync queued" : syncing ? "Requesting..." : "Sync now"}
          </Button>
        </form>
        <form action={disconnectAction}>
          <input type="hidden" name="connectionId" value={connectionId} />
          <Button type="submit" variant="ghost" disabled={disconnecting}>
            <Unplug className="h-4 w-4" />
            Remove login
          </Button>
        </form>
      </div>
      {(syncState?.error ?? disconnectState?.error) && (
        <p className="text-sm text-destructive">{syncState?.error ?? disconnectState?.error}</p>
      )}
      {(syncState?.info ?? disconnectState?.info) && (
        <p className="text-sm text-success">{syncState?.info ?? disconnectState?.info}</p>
      )}
    </div>
  );
}
