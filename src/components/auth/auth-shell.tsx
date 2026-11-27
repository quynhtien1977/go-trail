import type { ReactNode } from "react";
import { Navbar } from "@/components/ui/navbar";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#fafaf8] text-zinc-900">
      <Navbar />
      <main className="flex flex-1 flex-col items-center px-5 pb-16 pt-[146px] sm:px-8 sm:pb-20 sm:pt-[166px]">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
      <footer className="px-5 py-6 text-center text-xs leading-6 text-zinc-500">
        Go Trail · Cần hỗ trợ?{" "}
        <a
          href="tel:0972699242"
          className="rounded-sm text-zinc-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest-dark"
        >
          0972 699 242
        </a>
      </footer>
    </div>
  );
}
