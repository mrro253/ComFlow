"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";
import type { CurrentUser } from "@/types/domain";

const ROLE_LABEL: Record<CurrentUser["role"], string> = {
  owner: "Owner",
  manager: "Manager",
  agent: "Agent",
};

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md p-1 text-left outline-none hover:bg-secondary/60">
        <Avatar>
          <AvatarFallback>{initials(user.firstName, user.lastName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <p className="font-medium text-foreground">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs">{ROLE_LABEL[user.role]}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
