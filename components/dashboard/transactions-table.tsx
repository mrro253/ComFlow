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
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { BusinessType, CommissionRole } from "@/types/domain";

export interface TransactionRow {
  id: string;
  recipientName: string;
  role: CommissionRole;
  businessType: BusinessType;
  opportunityId: string;
  saleAmount: number;
  commissionAmount: number;
  createdAt: string;
}

const ROLE_BADGE: Record<CommissionRole, { label: string; variant: "default" | "secondary" | "outline" }> = {
  agent: { label: "Agent", variant: "default" },
  manager: { label: "Manager override", variant: "secondary" },
  owner: { label: "Owner override", variant: "outline" },
  bonus: { label: "Bonus", variant: "secondary" },
};

const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  new: "New business",
  renewal: "Renewal",
};

export function TransactionsTable({
  transactions,
  showRecipient = true,
  title = "Recent commissions",
  description,
}: {
  transactions: TransactionRow[];
  showRecipient?: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {showRecipient && <TableHead>Recipient</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>Opportunity</TableHead>
              <TableHead>Business</TableHead>
              <TableHead className="text-right">Sale amount</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={showRecipient ? 7 : 6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No commissions yet. They&apos;ll appear here once opportunities are enrolled.
                </TableCell>
              </TableRow>
            )}
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                {showRecipient && (
                  <TableCell className="font-medium">{tx.recipientName}</TableCell>
                )}
                <TableCell>
                  <Badge variant={ROLE_BADGE[tx.role].variant}>
                    {ROLE_BADGE[tx.role].label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{tx.opportunityId}</TableCell>
                <TableCell className="text-muted-foreground">
                  {tx.role === "bonus" ? "—" : BUSINESS_TYPE_LABEL[tx.businessType]}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(tx.saleAmount)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(tx.commissionAmount)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatDate(tx.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
