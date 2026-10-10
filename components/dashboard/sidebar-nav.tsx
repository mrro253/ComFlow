"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, CircleDollarSign, FileText, KeyRound, LayoutDashboard, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/domain";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Omit to show for every role. */
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/payments", label: "Payments", icon: CircleDollarSign },
  { href: "/statements", label: "Statements", icon: FileText, roles: ["owner"] },
  { href: "/carriers", label: "Carriers", icon: KeyRound, roles: ["owner", "agent"] },
  { href: "/users", label: "Users", icon: Users, roles: ["owner", "manager"] },
  { href: "/compensation", label: "Compensation", icon: Calculator, roles: ["owner"] },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
