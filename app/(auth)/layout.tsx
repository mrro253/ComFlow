import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            C
          </div>
          <span className="text-lg font-semibold">CommissionFlow</span>
        </div>
        {children}
      </div>
    </div>
  );
}
