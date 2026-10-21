"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle>The dashboard could not load</CardTitle>
        <CardDescription>Check your connection and try again. Retrying only reloads the dashboard; it does not download statements or change commission records.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline"><Link href="/payments">View commission activity</Link></Button>
      </CardContent>
    </Card>
  );
}
