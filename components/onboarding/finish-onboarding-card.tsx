"use client";

import { useActionState } from "react";
import { finishOnboarding } from "@/app/(dashboard)/onboarding/actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function FinishOnboardingCard() {
  const [state, formAction, isPending] = useActionState<ActionResult | undefined, FormData>(
    async () => finishOnboarding(),
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>That&apos;s it</CardTitle>
        <CardDescription>
          Finish now, or skip the rest and pick it up later - you can always
          reopen this checklist from Settings.
        </CardDescription>
      </CardHeader>
      {state?.error && (
        <CardContent className="pt-0">
          <p className="text-sm text-destructive">{state.error}</p>
        </CardContent>
      )}
      <CardFooter className="gap-2">
        <form action={formAction}>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Finishing..." : "Finish setup"}
          </Button>
        </form>
        <form action={formAction}>
          <Button type="submit" variant="ghost" disabled={isPending}>
            I&apos;ll finish later
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
