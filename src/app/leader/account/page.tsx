import type { Metadata } from "next";
import { LeaderShell } from "@/components/leader/leader-shell";
import { LeaderAccount } from "@/components/leader/leader-account";
import { requireLeaderPage } from "../require-leader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tài khoản — Go-Trail Leader" };

export default async function LeaderAccountPage() {
  await requireLeaderPage("/leader/account");
  return (
    <LeaderShell topBar={{ kind: "detail", title: "Tài khoản", backHref: "/leader" }}>
      <LeaderAccount />
    </LeaderShell>
  );
}
