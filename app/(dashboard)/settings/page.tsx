import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import { listPlansWithDetails } from "@/lib/repositories/commissionPlanRepository";
import { listCareerLevels } from "@/lib/repositories/compensationSettingsRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { activeLevelNames } from "@/lib/carriers/careerLevels";
import { buildBonusProgressRows } from "@/lib/reporting/bonusProgress";
import { CompPlansSection } from "@/components/settings/comp-plans-section";
import { BonusProgressCard } from "@/components/settings/bonus-progress-card";
import { CrmConnectionCard } from "@/components/settings/crm-connection-card";
import { UsersCard } from "@/components/settings/users-card";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isOwner = user.role === "owner";

  const [plans, users, careerLevels, agency] = await Promise.all([
    listPlansWithDetails(user.agencyId),
    listUsersForAgency(user.agencyId),
    listCareerLevels(user.agencyId),
    getAgencyById(user.agencyId),
  ]);
  const levels = activeLevelNames(careerLevels);

  // Bonus progress surfaces individual enrollment counts agency-wide, so
  // it's kept an Owner-only administrative view rather than shown to
  // every teammate (unlike plan rates, which are visible to everyone).
  const bonusProgressRows = isOwner ? await buildBonusProgressRows(users, plans) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "Team, CRM, and leftover plan screens. Career levels and rates live under Compensation."
              : "View-only. Ask an Owner to make changes here."}
          </p>
        </div>
        {isOwner && (
          <Link
            href="/onboarding"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Reopen setup guide
          </Link>
        )}
      </div>

      {isOwner && (
        <p className="text-sm">
          Career levels, rates and the bonuses on/off setting are on{" "}
          <Link href="/compensation" className="font-medium underline">
            Compensation
          </Link>
          .
        </p>
      )}
      <CompPlansSection plans={plans} editable={isOwner} />
      {isOwner && agency?.bonusesEnabled && <BonusProgressCard rows={bonusProgressRows} />}
      <CrmConnectionCard />
      <UsersCard users={users} editable={isOwner} levels={levels} />
    </div>
  );
}
