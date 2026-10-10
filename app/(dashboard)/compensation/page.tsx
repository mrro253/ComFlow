import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import { listCareerLevels, listCompensationRules } from "@/lib/repositories/compensationSettingsRepository";
import { BonusesSection, LevelsSection, RulesSection } from "@/components/compensation/sections";

/**
 * Owner-only: how this agency pays its Career agents. Everything here is per-agency
 * data (nothing is hard-coded), so each company sets its own levels, rates and options.
 */
export default async function CompensationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/dashboard");

  const [agency, levels, rules] = await Promise.all([
    getAgencyById(user.agencyId),
    listCareerLevels(user.agencyId),
    listCompensationRules(user.agencyId),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compensation</h1>
        <p className="text-sm text-muted-foreground">
          Set your career levels, what each level is paid, and whether you use bonuses. Carrier statements
          decide what is actually paid; these settings decide what your Career agents earn from it.
        </p>
      </div>
      <LevelsSection levels={levels} />
      <RulesSection rules={rules} levels={levels} today={today} />
      <BonusesSection enabled={agency?.bonusesEnabled ?? false} />
    </div>
  );
}
