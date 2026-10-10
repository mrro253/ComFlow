import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Informational only. GoHighLevel is an OUTPUT target (match contacts, push
 * statuses) and never a source of payable amounts.
 * TODO: replace with a real connect flow once the GHL output integration is built.
 */
export function CrmConnectionCard() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>GoHighLevel (output only)</CardTitle>
          <CardDescription>
            Planned: match statement clients to GoHighLevel contacts and push policy
            statuses back. It will never create or change commission amounts - those come
            only from carrier statements.
          </CardDescription>
        </div>
        <Plug className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <span className="text-sm font-medium">GoHighLevel</span>
        <Badge variant="outline">Coming soon</Badge>
      </CardContent>
    </Card>
  );
}
