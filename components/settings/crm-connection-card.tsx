"use client";

import { useActionState } from "react";
import { Plug } from "lucide-react";
import { connectCRMStub } from "@/app/(dashboard)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { CRMConnection } from "@/types/domain";
import type { ActionResult } from "@/app/(auth)/actions";

export function CrmConnectionCard({
  connection,
  editable,
}: {
  connection: CRMConnection | null;
  editable: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | undefined, FormData>(
    async () => connectCRMStub(),
    undefined
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>CRM connection</CardTitle>
          <CardDescription>
            GoHighLevel is the only supported provider for MVP.
          </CardDescription>
        </div>
        <Plug className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <span className="text-sm font-medium">GoHighLevel</span>
        {connection ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </CardContent>
      {connection?.lastSyncAt && (
        <CardContent className="pt-0 text-xs text-muted-foreground">
          Last synced {formatDate(connection.lastSyncAt)}
        </CardContent>
      )}
      {editable && (
        <CardFooter className="flex flex-col items-start gap-2">
          <form action={formAction}>
            <Button type="submit" variant={connection ? "outline" : "default"} disabled={isPending}>
              {connection ? "Reconnect" : "Connect GoHighLevel"}
            </Button>
          </form>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <p className="text-xs text-muted-foreground">
            TODO: this stands in for the real OAuth flow - see{" "}
            <code className="rounded bg-muted px-1 py-0.5">lib/crm/gohighlevel/provider.ts</code>.
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
