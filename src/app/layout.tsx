import type { Metadata } from "next";
import { Livvic } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";

const livvic = Livvic({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-livvic",
  display: "swap",
});

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
    <html lang="vi" className={`${livvic.variable} ${livvic.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-neutral-900 font-sans">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
