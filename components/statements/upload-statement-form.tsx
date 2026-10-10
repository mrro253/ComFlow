"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { uploadStatement } from "@/app/(dashboard)/statements/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm";

export function UploadStatementForm({
  carriers,
  independents,
  ownBookOnly = false,
}: {
  carriers: string[];
  independents: { id: string; name: string }[];
  /** Independent owner-level profile: uploads always go to their own book. */
  ownBookOnly?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(uploadStatement, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="carrier">Carrier</Label>
          <select id="carrier" name="carrier" className={SELECT_CLASS} defaultValue={carriers[0]}>
            {carriers.map((carrier) => (
              <option key={carrier} value={carrier}>
                {carrier}
              </option>
            ))}
          </select>
        </div>
        {!ownBookOnly && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="ownerUserId">Statement belongs to</Label>
            <select id="ownerUserId" name="ownerUserId" className={SELECT_CLASS} defaultValue="">
              <option value="">The agency</option>
              {independents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} (independent)
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="file">Statement PDF</Label>
          <Input id="file" name="file" type="file" accept="application/pdf,.pdf" required />
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={isPending}>
          <Upload className="h-4 w-4" />
          {isPending ? "Uploading..." : "Upload and preview"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing is imported until you review the preview and approve it.
        </p>
      </div>
    </form>
  );
}
