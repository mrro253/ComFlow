import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import { listCareerLevels, listCompensationRules } from "@/lib/repositories/compensationSettingsRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { canAccessOnboarding } from "@/lib/onboarding";
import { BonusesSection, LevelsSection, RulesSection } from "@/components/compensation/sections";
import { CrmConnectionCard } from "@/components/settings/crm-connection-card";
import { UsersCard } from "@/components/settings/users-card";
import { WelcomeAgencyCard } from "@/components/onboarding/welcome-agency-card";
import { FinishOnboardingCard } from "@/components/onboarding/finish-onboarding-card";
import { activeLevelNames } from "@/lib/carriers/careerLevels";

const STEPS = [
  { number: 1, label: "Welcome" },
  { number: 2, label: "Compensation" },
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

  const [agency, users, levels, rules] = await Promise.all([
    getAgencyById(user.agencyId),
    listUsersForAgency(user.agencyId),
    listCareerLevels(user.agencyId),
    listCompensationRules(user.agencyId),
  ]);

  if (!agency) redirect("/dashboard");
  const today = new Date().toISOString().slice(0, 10);

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
          Set this agency&apos;s career levels, what each level is paid, and whether you use
          bonuses. You can change any of this later on Compensation.
        </p>
        <LevelsSection levels={levels} />
        <RulesSection rules={rules} levels={levels} today={today} />
        <BonusesSection enabled={agency.bonusesEnabled} />
      </div>

      <div className="flex flex-col gap-3">
        <StepHeading number={STEPS[2].number} label={STEPS[2].label} />
        <p className="text-sm text-muted-foreground">
          Add your Managers and Agents now, or come back to this any time from
          Users. Teammates get a temporary password to sign in with.
        </p>
        <UsersCard users={users} editable levels={activeLevelNames(levels)} />
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
