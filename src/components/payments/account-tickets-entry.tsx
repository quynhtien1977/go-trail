import Link from "next/link";
import { Ticket } from "lucide-react";

export function AccountTicketsEntry() {
  return <section aria-labelledby="account-tickets-title" className="md:col-span-2 rounded-[8px] border border-neutral-300 bg-white p-6 sm:p-8">
    <Ticket aria-hidden="true" className="size-7 text-[#186734]" /><h2 id="account-tickets-title" className="mt-4 text-xl font-bold text-[#212529]">Vé xe và chuyến trekking của tôi</h2>
    <p className="mt-3 text-sm leading-6 text-[#5C636A]">Xem vé, mã QR đã phát hành, điểm đón và hóa đơn của bạn. Danh sách sẽ phản ánh dữ liệu từ hệ thống khi dịch vụ vé sẵn sàng.</p>
    <Link href="/account/tickets" className="mt-5 inline-flex min-h-11 items-center rounded-[5px] bg-[#186734] px-4 text-sm font-bold text-white">Mở vé của tôi</Link>
    <p className="mt-4 text-xs text-[#5C636A]">Vé đã mua không hủy, không hoàn và không chuyển chuyến.</p>
  </section>;
}
