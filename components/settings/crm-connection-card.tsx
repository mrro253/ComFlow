import { Plug } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Setup entry point. Contact matching/updates remain disabled; GHL is never
 * a source of payable amounts.
 */
export function CrmConnectionCard() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>GoHighLevel</CardTitle>
          <CardDescription>
            Connect your sub-account and see which enrollments have matching GHL contacts.
            Contact updates and linking are disabled. Commission amounts come only
            from carrier statements.
          </CardDescription>
        </div>
        <Plug className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <span className="text-sm font-medium">GoHighLevel</span>
        <Badge variant="outline">Read-only preview</Badge>
        <Link className="rounded-md border px-4 py-2 text-sm font-medium" href="/settings/ghl">Connect GoHighLevel</Link>
      </CardContent>
    </Card>
  );
}
