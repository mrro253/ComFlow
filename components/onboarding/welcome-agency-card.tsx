"use client";

import { useActionState } from "react";
import { updateOnboardingAgencyName } from "@/app/(dashboard)/onboarding/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WelcomeAgencyCard({
  firstName,
  agencyName,
}: {
  firstName: string;
  agencyName: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateOnboardingAgencyName,
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome, {firstName}</CardTitle>
        <CardDescription>
          Let&apos;s get your agency ready to track commissions. You can complete
          every step below right now, or come back and finish later - nothing
          here is required to keep using CommissionFlow.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="agencyName">Agency name</Label>
          <Input
            id="agencyName"
            name="name"
            defaultValue={agencyName}
            required
            className="max-w-sm"
          />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            {isPending ? "Saving..." : "Save name"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
