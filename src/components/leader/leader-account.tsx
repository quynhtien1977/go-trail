"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoleBadge } from "@/components/ui/role-badge";
import { buttonOutlineDanger } from "./leader-ui-parts";

export function LeaderAccount() {
  const { data: session } = useSession();
  const user = session?.user;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <section className="flex items-center gap-4 rounded-[5px] border border-[#E0E0E0] bg-white p-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-[5px] bg-[#186734] text-white">
          <UserRound aria-hidden="true" className="size-6" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate font-bold">{user?.name ?? "Leader"}</p>
          {user?.email && <p className="truncate text-sm text-[#5C636A]">{user.email}</p>}
          {user?.role && <RoleBadge role={user.role} />}
        </div>
      </section>
      <button type="button" onClick={() => signOut({ callbackUrl: "/staff/login" })} className={cn(buttonOutlineDanger, "w-full")}>
        <LogOut aria-hidden="true" className="size-4" /> Đăng xuất
      </button>
    </div>
  );
}
