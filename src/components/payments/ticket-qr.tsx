"use client";

import { useEffect, useState } from "react";
import type { TicketView } from "@/lib/payment-ui";
import { issuedTicketCode } from "@/lib/payment-ui";

export function TicketQr({ ticket }: { ticket: TicketView }) {
  const code = issuedTicketCode(ticket);
  const [result, setResult] = useState<{ code: string; image?: string; failed?: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    async function generate() {
      try {
        const { default: QRCode } = await import("qrcode");
        const image = await QRCode.toDataURL(code!, { width: 288, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
        if (!cancelled) setResult({ code: code!, image });
      } catch { if (!cancelled) setResult({ code: code!, failed: true }); }
    }
    void generate();
    return () => { cancelled = true; };
  }, [code, revision]);
  if (!code) return <p role="status" className="py-6 text-center text-sm text-[#5C636A]">Mã QR chỉ hiển thị khi vé hợp lệ, hóa đơn đã thanh toán và mã vé đã được phát hành.</p>;
  if (result?.code !== code) return <p role="status" className="py-10 text-center text-sm">Đang chuẩn bị mã QR…</p>;
  if (result.failed) return <div role="alert" className="space-y-3 py-6 text-center"><p className="text-sm text-[#C62828]">Không thể hiển thị mã QR. Vui lòng thử lại hoặc liên hệ Go-Trail.</p><button type="button" onClick={() => { setResult(null); setRevision(value => value + 1); }} className="min-h-11 rounded-[5px] border border-[#6B7280] px-4 text-sm font-semibold">Thử tạo lại mã QR</button></div>;
  return <figure className="py-4 text-center">
    {/* Generated locally from the issued ticket code; never sent to a remote QR service. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={result.image} alt={`Mã QR vé ${ticket.id}, ghế ${ticket.seatLabel}`} width={288} height={288} className="mx-auto h-auto max-w-full" />
    <figcaption className="mt-3 text-sm text-[#5C636A]">Xuất trình mã QR này cho Leader khi lên xe. Không chia sẻ mã vé cho người khác.</figcaption>
  </figure>;
}
