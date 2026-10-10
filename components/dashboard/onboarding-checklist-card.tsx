"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check, Circle, X } from "lucide-react";
import { dismissOnboardingChecklist } from "@/app/(dashboard)/onboarding/actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Owner-only, dismissible nudge shown on the dashboard until onboarding is
 * finished or dismissed (agencies.onboarding_completed_at). "Done" state
 * is computed live from data the dashboard already loaded - it's not
 * persisted per-step, matching the "keep onboarding state lightweight"
 * requirement.
 */
export function OnboardingChecklistCard({
  hasCompensation,
  hasTeammates,
  hasStatements,
  hasCarrierLogin,
}: {
  hasCompensation: boolean;
  hasTeammates: boolean;
  hasStatements: boolean;
  hasCarrierLogin: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | undefined, FormData>(
    async () => dismissOnboardingChecklist(),
    undefined
  );

  const items = [
    { label: "Set up career levels and rates", done: hasCompensation, href: "/compensation" },
    { label: "Add your team", done: hasTeammates, href: "/users" },
    { label: "Upload a carrier statement", done: hasStatements, href: "/statements" },
    { label: "Connect your carrier login", done: hasCarrierLogin, href: "/carriers" },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Finish setting up your agency</CardTitle>
          <CardDescription>
            A few quick steps to get CommissionFlow ready for your team.
          </CardDescription>
        </div>
        <form action={formAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            aria-label="Dismiss setup checklist"
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary/60"
          >
            {item.done ? (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className={cn(item.done && "text-muted-foreground")}>{item.label}</span>
          </Link>
        ))}
        {state?.error && <p className="px-2 text-sm text-destructive">{state.error}</p>}
      </CardContent>
    </Card>
  );
}
