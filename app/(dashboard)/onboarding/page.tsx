import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import { listPlansWithDetails } from "@/lib/repositories/commissionPlanRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { canAccessOnboarding } from "@/lib/onboarding";
import { CompPlansSection } from "@/components/settings/comp-plans-section";
import { CrmConnectionCard } from "@/components/settings/crm-connection-card";
import { UsersCard } from "@/components/settings/users-card";
import { WelcomeAgencyCard } from "@/components/onboarding/welcome-agency-card";
import { FinishOnboardingCard } from "@/components/onboarding/finish-onboarding-card";

const STEPS = [
  { number: 1, label: "Welcome" },
  { number: 2, label: "Commission plan" },
  { number: 3, label: "Build your team" },
  { number: 4, label: "GoHighLevel (coming soon)" },
  { number: 5, label: "Finish" },
] as const;

function StepHeading({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
        {number}
      </span>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
    </div>
  );
}

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessOnboarding(user.role)) redirect("/dashboard");

  const [agency, plans, users] = await Promise.all([
    getAgencyById(user.agencyId),
    listPlansWithDetails(user.agencyId),
    listUsersForAgency(user.agencyId),
  ]);

  // Defensive: a valid session/profile always implies a valid agency, but
  // don't render a broken page if that invariant is ever violated.
  if (!agency) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Set up {agency.name}</h1>
        <p className="text-sm text-muted-foreground">
          A short checklist to get CommissionFlow ready for your team. Nothing
          here is required right away - finish now or pick it up later from
          Settings.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <StepHeading number={STEPS[0].number} label={STEPS[0].label} />
        <WelcomeAgencyCard firstName={user.firstName} agencyName={agency.name} />
      </div>

      <div className="flex flex-col gap-3">
        <StepHeading number={STEPS[1].number} label={STEPS[1].label} />
        <p className="text-sm text-muted-foreground">
          We&apos;ve set your default plan to the standard 10% agent / 2% manager
          / 1% owner split. Review and adjust it below - your changes replace
          these starting defaults.
        </p>
        <CompPlansSection plans={plans} editable />
      </div>

      <div className="flex flex-col gap-3">
        <StepHeading number={STEPS[2].number} label={STEPS[2].label} />
        <p className="text-sm text-muted-foreground">
          Add your Managers and Agents now, or come back to this any time from
          Settings. Teammates get a temporary password to sign in with.
        </p>
        <UsersCard users={users} editable />
      </div>

      <div className="flex flex-col gap-3">
        <StepHeading number={STEPS[3].number} label={STEPS[3].label} />
        <CrmConnectionCard />
      </div>

      <div className="flex flex-col gap-3">
        <StepHeading number={STEPS[4].number} label={STEPS[4].label} />
        <FinishOnboardingCard />
      </div>
    </div>
  );
}
