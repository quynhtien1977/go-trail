import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";

export const metadata: Metadata = {
  title: "Go-Trail — Xe bus trekking có Leader dẫn đoàn",
  description: "Hệ thống đặt vé xe bus khứ hồi kèm Leader dẫn đoàn trekking chuyên nghiệp. Chinh phục Bà Đen, Chứa Chan, Núi Dinh cùng Go-Trail.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-neutral-900 font-sans">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
