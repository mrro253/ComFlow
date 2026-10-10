import { activeLevelNames, VISIBILITY_LABEL } from "@/lib/carriers/careerLevels";
import {
  currentRules,
  describeRate,
  ruleTiming,
  type RuleRow,
} from "@/lib/carriers/compensation/ruleSettings";
import { AddLevelForm, BonusToggle, LevelControls, RuleForm } from "@/components/compensation/forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CareerLevelRecord } from "@/types/domain";

/** Owner-only sections shared by the Compensation page and the onboarding checklist. */

export function LevelsSection({ levels }: { levels: CareerLevelRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Career levels</CardTitle>
        <CardDescription>
          Your agency&apos;s own ladder, lowest first. Visibility decides whether someone at that level also
          sees the payments and statements of the people who report to them.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Visibility</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {levels.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No levels yet. Add your first level below, then you can add Career agents and set rates.
                </TableCell>
              </TableRow>
            )}
            {levels.map((level) => (
              <TableRow key={level.id}>
                <TableCell className="text-muted-foreground">{level.rank}</TableCell>
                <TableCell className="font-medium">
                  {level.name}
                  <p className="text-xs font-normal text-muted-foreground">{VISIBILITY_LABEL[level.visibility]}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={level.active ? "success" : "outline"}>{level.active ? "Active" : "Off"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <LevelControls level={level} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <AddLevelForm />
    </Card>
  );
}

export function RulesSection({
  rules,
  levels,
  today,
}: {
  rules: RuleRow[];
  levels: CareerLevelRecord[];
  today: string;
}) {
  const names = activeLevelNames(levels);
  const shown = currentRules(rules, today, [...levels].sort((a, b) => a.rank - b.rank).map((l) => l.name));
  const products = [...new Set(rules.map((r) => r.product))].sort();
  const categories = [...new Set(rules.map((r) => r.commissionType))].sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compensation rates</CardTitle>
        <CardDescription>
          What each Career level is paid per payment category, as a fixed dollar amount or a percentage
          (for example a percent of annual premium for final expense). Only rates that are set are used;
          a missing rate is &quot;Not configured&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Ends</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No rates set yet.
                </TableCell>
              </TableRow>
            )}
            {shown.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.product}</TableCell>
                <TableCell>{rule.careerLevel ?? "All"}</TableCell>
                <TableCell>{rule.commissionType}</TableCell>
                <TableCell>
                  {describeRate(rule)}
                  {ruleTiming(rule, today) === "upcoming" && (
                    <Badge variant="secondary" className="ml-2">
                      Upcoming
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{rule.effectiveFrom}</TableCell>
                <TableCell className="text-muted-foreground">{rule.effectiveTo ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {names.length > 0 ? (
        <RuleForm levels={names} products={products} categories={categories} />
      ) : (
        <p className="border-t border-border p-6 text-sm text-muted-foreground">
          Add a career level above before setting rates.
        </p>
      )}
    </Card>
  );
}

export function BonusesSection({ enabled }: { enabled: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonuses</CardTitle>
        <CardDescription>
          Off by default. Bonuses are an optional agency setting.{" "}
          {enabled
            ? "Bonuses are ON for your agency."
            : "Bonuses are OFF for your agency."}{" "}
          Note: bonus amounts are not calculated from carrier statements yet; this only records your choice.
        </CardDescription>
      </CardHeader>
      <BonusToggle enabled={enabled} />
    </Card>
  );
}
