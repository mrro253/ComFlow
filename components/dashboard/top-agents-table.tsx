import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency, initials } from "@/lib/utils";
import type { TopAgentRow } from "@/lib/reporting/metrics";

export function TopAgentsTable({ agents }: { agents: TopAgentRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top agents</CardTitle>
        <CardDescription>Ranked by total commission earned.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Opportunities</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No agent commissions yet.
                </TableCell>
              </TableRow>
            )}
            {agents.map((agent, index) => (
              <TableRow key={agent.userId}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">
                        {initials(agent.firstName, agent.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">
                      {agent.firstName} {agent.lastName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {agent.opportunityCount}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(agent.totalSales)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(agent.totalCommission)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
