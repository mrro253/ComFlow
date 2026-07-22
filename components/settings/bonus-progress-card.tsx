"use client";

import { useActionState } from "react";
import { awardCommissionPlanBonus } from "@/app/(dashboard)/settings/planActions";
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
import { Button } from "@/components/ui/button";
import { formatCurrency, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BonusProgressRow } from "@/lib/reporting/bonusProgress";

function periodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function BonusProgressCard({ rows }: { rows: BonusProgressRow[] }) {
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonuses</CardTitle>
        <CardDescription>
          Progress toward each plan&apos;s monthly enrollment bonus for {periodLabel(rows[0].period)}
          . Awarding a bonus adds a one-time commission row for that person and can&apos;t be
          repeated for the same month.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Teammate</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="text-right">Bonus</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <BonusProgressRowItem key={`${row.bonus.id}-${row.user.id}`} row={row} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BonusProgressRowItem({ row }: { row: BonusProgressRow }) {
  const [state, formAction, isPending] = useActionState(
    awardCommissionPlanBonus,
    undefined
  );

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">
              {initials(row.user.firstName, row.user.lastName)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {row.user.firstName} {row.user.lastName}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{row.planName}</TableCell>
      <TableCell className="text-muted-foreground">
        {row.enrollmentCount} / {row.bonus.thresholdCount} enrollments
        {!row.qualified && ` (${row.remaining} to go)`}
      </TableCell>
      <TableCell className="text-right font-medium">
        {formatCurrency(row.bonus.bonusAmount)}
      </TableCell>
      <TableCell className="text-right">
        {row.alreadyAwarded ? (
          <Badge variant="secondary">Awarded</Badge>
        ) : row.qualified ? (
          <form action={formAction} className="inline-flex flex-col items-end gap-1">
            <input type="hidden" name="bonusId" value={row.bonus.id} />
            <input type="hidden" name="userId" value={row.user.id} />
            <input type="hidden" name="period" value={row.period} />
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Awarding..." : "Award"}
            </Button>
            {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
          </form>
        ) : (
          <Badge variant="outline">Not yet</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
