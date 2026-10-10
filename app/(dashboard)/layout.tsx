import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const agency = await getAgencyById(user.agencyId);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col border-r border-border bg-card px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            C
          </div>
          <span className="text-sm font-semibold leading-tight">
            {agency?.name ?? "CommissionFlow"}
          </span>
        </div>
        <SidebarNav user={user} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-6">
          <div className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.firstName} {user.lastName}</span>
          </div>
          <UserMenu user={user} />
        </header>
        <main className="flex-1 bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
