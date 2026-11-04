import Link from "next/link";
import { FileClock, ShieldCheck } from "lucide-react";
import type { PrivatePhase } from "./use-private-page";

export function PrivateReadNotice({ phase, kind, onRetry }: { phase: PrivatePhase; kind: "tickets" | "payments"; onRetry: () => void }) {
  if (phase === "ready") return null;
  const payment = kind === "payments";
  if (phase === "auth-loading" || phase === "loading") return <p role="status" className="py-12 text-center text-sm text-[#5C636A]">{phase === "auth-loading" ? "Đang kiểm tra phiên đăng nhập…" : payment ? "Đang tải giao dịch…" : "Đang tải vé của bạn…"}</p>;
  if (phase === "sign-in") return <div className="space-y-4 py-10 text-center"><p className="text-sm">Vui lòng đăng nhập để xem {payment ? "thông tin đối soát" : "vé của bạn"}.</p><Link href={`${payment ? "/staff/login" : "/login"}?callbackUrl=${encodeURIComponent(payment ? "/admin/reconciliation" : "/account/tickets")}`} className="inline-flex min-h-11 items-center rounded-[5px] bg-[#FEBB02] px-4 text-sm font-bold text-black">Đăng nhập</Link></div>;
  if (phase === "forbidden") return <div role="alert" className="space-y-3 py-10 text-center"><ShieldCheck aria-hidden="true" className="mx-auto size-8 text-[#5C636A]" /><p className="text-sm">Bạn không có quyền xem thông tin này. Vui lòng kiểm tra tài khoản đang đăng nhập.</p></div>;
  if (phase === "error") return <div role="alert" className="space-y-4 py-10 text-center"><p className="text-sm text-[#C62828]">Không thể cập nhật {payment ? "giao dịch" : "danh sách vé"}. Thông tin cũ đã được ẩn để tránh nhầm lẫn.</p><button type="button" onClick={onRetry} className="min-h-11 rounded-[5px] border border-[#6B7280] px-4 text-sm font-semibold">Thử tải lại</button></div>;
  return <div className="space-y-3 py-10 text-center"><FileClock aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" /><h2 className="font-bold">{payment ? "Danh sách giao dịch chưa sẵn sàng" : "Danh sách vé chưa sẵn sàng"}</h2><p className="mx-auto max-w-md text-sm leading-6 text-[#5C636A]">{payment ? "Chưa thể tải dữ liệu đối soát lúc này. Chỉ giao dịch do hệ thống cung cấp mới được hiển thị và không có thao tác xác nhận tiền tại đây." : "Thông tin vé sẽ hiển thị khi dịch vụ phát hành vé sẵn sàng. Bạn vẫn có thể xem trạng thái và hướng dẫn thanh toán bằng số hóa đơn."}</p></div>;
}
