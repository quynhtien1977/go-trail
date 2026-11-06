"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { BookingClientError, createSeatHold, fetchBookingPickupPreferences } from "@/lib/booking-client";
import { buildHoldInput, emptyPassengerDraft, holdAttempt, validatePassengerDraft,
  type CheckoutPickup, type DeparturePickupSource, type HoldAttempt, type PassengerDraft, type PassengerErrors } from "@/lib/booking-checkout";
import { formatVietnamDateTime, formatVnd } from "@/lib/catalog-client";
import { PassengerFields, type PassengerSeat } from "./passenger-fields";

type ReviewPassenger = { seat: PassengerSeat; draft: PassengerDraft; pickup: CheckoutPickup };
const actionStyle = "inline-flex min-h-11 items-center justify-center rounded-[5px] px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-[#5C636A]";

export function PassengerCheckout({ tripId, tripName, departureId, departureDate, price, seats, available,
  departurePickups, onConflict, onLockChange }: {
  tripId: number; tripName: string; departureId: number; departureDate: string; price: string;
  seats: PassengerSeat[]; available: boolean; departurePickups?: DeparturePickupSource;
  onConflict: () => void; onLockChange: (locked: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const attempt = useRef<HoldAttempt | null>(null);
  const sending = useRef(false);
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, PassengerDraft>>({});
  const [errors, setErrors] = useState<Record<number, PassengerErrors>>({});
  const [catalog, setCatalog] = useState<{ options: CheckoutPickup[]; loading: boolean; error: boolean }>({ options: [], loading: true, error: false });
  const [pickupRevision, setPickupRevision] = useState(0);
  const [review, setReview] = useState<ReviewPassenger[] | null>(null);
  const [policy, setPolicy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const confirmed = departurePickups?.departure_id === departureId;
  const pickups: CheckoutPickup[] = confirmed ? departurePickups.pickups.map(item => ({ ...item, key: `departure-${item.dep_pickup_id}` })) : catalog.options;
  const pickupLoading = !confirmed && catalog.loading;
  const authenticated = sessionStatus === "authenticated" && !needsLogin;
  const canBook = authenticated && (session?.user.role === "Customer" || session?.user.role === "Admin");

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    if (!open || confirmed) return;
    const controller = new AbortController();
    async function load() {
      try {
        const options: CheckoutPickup[] = [];
        let page = 1;
        while (!controller.signal.aborted) {
          const data = await fetchBookingPickupPreferences(tripId, page, controller.signal);
          options.push(...data.items.filter(item => item.is_active).map(item => ({ key: `catalog-${item.pickup_id}`, name: item.name, address: item.address })));
          if (page >= data.pagination.totalPages || !data.items.length) break;
          page++;
        }
        if (!controller.signal.aborted) setCatalog({ options: [...new Map(options.map(item => [item.key, item])).values()], loading: false, error: false });
      } catch { if (!controller.signal.aborted) setCatalog({ options: [], loading: false, error: true }); }
    }
    void load();
    return () => controller.abort();
  }, [open, confirmed, tripId, pickupRevision]);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!uncertain || !needsLogin) return;
    // Auth.js refreshes the shared session on focus; keep this request/key in the original tab.
    const resume = () => setNeedsLogin(false);
    window.addEventListener("focus", resume);
    return () => window.removeEventListener("focus", resume);
  }, [uncertain, needsLogin]);

  function updateDraft(id: number, patch: Partial<PassengerDraft>) {
    setDrafts(current => ({ ...current, [id]: { ...(current[id] ?? emptyPassengerDraft()), ...patch } }));
    setErrors(current => ({ ...current, [id]: { ...current[id], ...Object.fromEntries(Object.keys(patch).map(key => [key, undefined])) } }));
  }

  function reviewDetails(event: FormEvent) {
    event.preventDefault();
    if (!seats.length || !available) return;
    const nextErrors = Object.fromEntries(seats.map(seat => [seat.id, validatePassengerDraft(drafts[seat.id] ?? emptyPassengerDraft(), pickups)]));
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(value => Object.keys(value).length)) {
      requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setReview(seats.map(seat => ({ seat, draft: { ...drafts[seat.id] }, pickup: pickups.find(item => item.key === drafts[seat.id].pickup_key)! })));
    setPolicy(false);
    setSubmitError("");
    dialog.current?.scrollTo({ top: 0 });
  }

  const selectionChanged = review && JSON.stringify(review.map(item => item.seat.id).sort((a, b) => a - b)) !== JSON.stringify(seats.map(seat => seat.id).sort((a, b) => a - b));
  const prepared = review && buildHoldInput(review.map(item => ({ seat_id: item.seat.id, draft: item.draft })), pickups, "preview_key_000000");

  async function submitHold() {
    if (sending.current || !canBook || !policy || (!uncertain && (!available || selectionChanged || !prepared))) return;
    const nextAttempt = uncertain ? attempt.current : prepared && holdAttempt(attempt.current, prepared, () => crypto.randomUUID());
    if (!nextAttempt) return;
    attempt.current = nextAttempt;
    sending.current = true;
    setSubmitting(true);
    onLockChange(true);
    setSubmitError("");
    const controller = new AbortController();
    request.current = controller;
    let unresolved = false;
    try {
      const hold = await createSeatHold(departureId, nextAttempt.input, controller.signal);
      if (!Number.isInteger(hold.invoice_id) || hold.invoice_id < 1 || hold.departure_id !== departureId) throw new BookingClientError(502, "INVALID_RESPONSE", "Thông tin hóa đơn chưa sẵn sàng.");
      setUncertain(false);
      router.push(`/checkout/invoices/${hold.invoice_id}`);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof BookingClientError && cause.status < 500) {
        // A rejected retry does not resolve an earlier request whose response was lost.
        unresolved = uncertain;
        setUncertain(uncertain);
        if (cause.status === 401) { setNeedsLogin(true); setSubmitError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi giữ ghế."); }
        else if (cause.status === 409) { if (!uncertain) attempt.current = null; onConflict(); setSubmitError("Ghế hoặc chuyến vừa thay đổi trạng thái. Vui lòng quay lại sơ đồ ghế đã cập nhật để kiểm tra lựa chọn."); }
        else if (cause.status === 429) setSubmitError("Bạn thao tác quá nhanh. Vui lòng chờ một lúc rồi thử lại.");
        else if (cause.status === 403) setSubmitError("Tài khoản hiện tại không có quyền đặt vé cho chuyến này.");
        else if (cause.status === 422) setSubmitError("Thông tin hành khách, điểm đón hoặc số ghế chưa được chấp nhận. Vui lòng kiểm tra lại thông tin.");
        else setSubmitError("Chuyến này hiện không nhận đặt vé. Vui lòng kiểm tra lại lịch khởi hành.");
      } else {
        unresolved = true;
        setUncertain(true);
        setSubmitError("Chưa xác định được kết quả giữ ghế. Hãy thử lại cùng yêu cầu để kiểm tra; không tạo yêu cầu đặt vé mới.");
      }
    } finally {
      if (!controller.signal.aborted) {
        sending.current = false;
        setSubmitting(false);
        onLockChange(unresolved);
      }
    }
  }

  return (
    <>
      <button type="button" disabled={(!seats.length || !available) && !uncertain} onClick={() => setOpen(true)}
        className={`${actionStyle} w-full bg-[#FEBB02] text-black hover:bg-[#E5A800]`}>
        {uncertain ? "Kiểm tra yêu cầu giữ ghế" : "Nhập thông tin hành khách"}
      </button>
      {!seats.length && <p className="mt-2 text-xs text-[#5C636A]">Chọn ghế để tiếp tục nhập thông tin và kiểm tra đơn.</p>}
      <dialog ref={dialog} aria-labelledby="passenger-checkout-title" aria-describedby="passenger-checkout-description"
        onClose={() => setOpen(false)} onCancel={event => { if (sending.current) event.preventDefault(); }}
        className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-3xl overflow-y-auto rounded-[8px] border border-neutral-300 bg-white p-0 text-[#212529] shadow-xl backdrop:bg-black/60">
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-semibold text-[#186734]">Go-Trail · Đặt vé</p><h2 id="passenger-checkout-title" className="mt-2 text-xl font-bold sm:text-2xl">{review ? "Kiểm tra đơn đặt vé" : "Thông tin hành khách"}</h2></div>
            <button type="button" disabled={submitting} aria-label="Đóng thông tin hành khách" onClick={() => setOpen(false)} className="flex size-11 shrink-0 items-center justify-center rounded-[5px] border border-[#6B7280] disabled:opacity-50"><X aria-hidden="true" className="size-5" /></button>
          </div>
          <p id="passenger-checkout-description" className="mt-3 text-sm text-[#5C636A]">Ghế chỉ được giữ sau khi hệ thống tạo hóa đơn thành công. Thông tin nhập ở đây chưa được gửi khi bạn kiểm tra đơn.</p>
          <ol aria-label="Các bước đặt vé" className="my-5 grid grid-cols-3 border-y border-neutral-200 py-3 text-center text-xs sm:text-sm">
            <li>1. Chọn ghế</li><li aria-current={!review ? "step" : undefined} className={!review ? "font-bold text-[#186734]" : ""}>2. Hành khách</li><li aria-current={review ? "step" : undefined} className={review ? "font-bold text-[#186734]" : ""}>3. Kiểm tra đơn</li>
          </ol>
          <p className="font-bold break-words">{tripName}</p>
          <p className="mt-1 text-sm text-[#5C636A]">Khởi hành: {formatVietnamDateTime(departureDate, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
          {!confirmed && <p className="my-4 border-l-4 border-neutral-300 pl-3 text-sm text-[#5C636A]">Bạn có thể nhập hành khách và kiểm tra đơn trước. Điểm đón bên dưới là lựa chọn dự kiến theo tuyến; lịch đón của chuyến chưa sẵn sàng nên chưa thể gửi giữ ghế.</p>}
          {pickupLoading && <p role="status" className="my-4 text-sm">Đang tải điểm đón…</p>}
          {!confirmed && catalog.error && <div role="alert" className="my-4 text-sm text-[#C62828]">Không thể tải điểm đón. <button type="button" onClick={() => { setCatalog(current => ({ ...current, loading: true, error: false })); setPickupRevision(value => value + 1); }} className="min-h-11 font-semibold underline">Thử tải lại điểm đón</button></div>}
          {!pickupLoading && !catalog.error && !pickups.length && <p className="my-4 text-sm text-[#5C636A]">Chưa có điểm đón cho lựa chọn này. Bạn vẫn có thể nhập thông tin hành khách, sau đó liên hệ Go-Trail để được hỗ trợ.</p>}

          {!review ? (
            <form noValidate onSubmit={reviewDetails} className="mt-5">
              <p className="mb-4 text-xs text-[#5C636A]">Các mục có dấu * là bắt buộc.</p>
              {seats.map(seat => <PassengerFields key={seat.id} seat={seat} draft={drafts[seat.id] ?? emptyPassengerDraft()} errors={errors[seat.id] ?? {}}
                pickups={pickups} loading={pickupLoading} confirmed={confirmed} onChange={patch => updateDraft(seat.id, patch)} />)}
              {!seats.length && <p role="status" className="py-5 text-sm">Không còn ghế trong lựa chọn. Vui lòng quay lại sơ đồ ghế.</p>}
              <p className="border-t border-neutral-200 py-4 text-sm">Vé đã mua không hủy, không hoàn và không chuyển chuyến.</p>
              <div className="flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setOpen(false)} className={`${actionStyle} border border-[#6B7280]`}>Quay lại chọn ghế</button><button type="submit" disabled={!seats.length || !available || pickupLoading || !pickups.length} className={`${actionStyle} bg-[#FEBB02] text-black hover:bg-[#E5A800]`}>Kiểm tra thông tin</button></div>
            </form>
          ) : (
            <div className="mt-5 space-y-5">
              <h3 className="text-lg font-bold">Hành khách và điểm đón</h3>
              <ul className="divide-y divide-neutral-200">
                {review.map(({ seat, draft, pickup }) => <li key={seat.id} className="space-y-1 py-4 text-sm break-words"><p className="font-bold">{seat.vehicle} · Ghế {seat.label}</p><p>{draft.passenger_name.trim()} · {draft.passenger_phone}</p><p>Liên hệ khẩn cấp: {draft.emergency_contact.trim()}</p><p>{confirmed ? "Điểm đón" : "Điểm đón dự kiến"}: {pickup.name}</p><p className="text-[#5C636A]">{pickup.address}</p><p className="text-[#5C636A]">{pickup.pickup_time ? `Giờ đón: ${formatVietnamDateTime(pickup.pickup_time, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Chưa có giờ đón theo chuyến"}</p><p className="text-[#186734]">Đã xác nhận cam kết sức khỏe</p></li>)}
              </ul>
              <dl className="divide-y divide-neutral-200 border-y border-neutral-200 text-sm"><div className="flex justify-between gap-3 py-3"><dt>Số ghế</dt><dd className="font-semibold">{review.length}</dd></div><div className="flex justify-between gap-3 py-3"><dt>Đơn giá mỗi ghế</dt><dd className="font-semibold">{formatVnd(price)}</dd></div><div className="flex justify-between gap-3 py-3"><dt>Tổng thanh toán</dt><dd className="text-right font-semibold">Xác nhận trên hóa đơn</dd></div></dl>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" checked={policy} disabled={submitting || uncertain} onChange={event => setPolicy(event.target.checked)} className="mt-1 size-5 shrink-0 accent-[#186734]" /><span>Tôi đã kiểm tra thông tin và đồng ý: vé đã mua không hủy, không hoàn, không chuyển chuyến. Đơn chờ thanh toán có thể hết thời gian giữ ghế.</span></label>
              {selectionChanged && !uncertain && <p role="alert" className="text-sm text-[#C62828]">Danh sách ghế đã thay đổi. Vui lòng quay lại kiểm tra hành khách trước khi tiếp tục.</p>}
              {submitError && <p role="alert" className="text-sm text-[#C62828]">{submitError}</p>}
              {uncertain && <p role="status" className="text-sm text-[#8A5A00]">Yêu cầu trước vẫn chưa xác định được kết quả. Giữ trang này mở để thử lại cùng yêu cầu; thông tin và chuyến được giữ nguyên. Liên hệ Go-Trail nếu bạn cần hỗ trợ.</p>}
              {sessionStatus === "loading" ? <p role="status" className="text-sm">Đang kiểm tra đăng nhập…</p> : !authenticated ? <div className="space-y-2"><Link href={`/login?callbackUrl=${encodeURIComponent(`/trips/${tripId}`)}`} target="_blank" rel="noopener noreferrer" className={`${actionStyle} border border-[#186734] text-[#186734]`}>{uncertain ? "Đăng nhập lại ở tab mới" : "Đăng nhập để giữ ghế"}</Link><p className="text-sm text-[#5C636A]">Đăng nhập mở ở tab mới để giữ nguyên thông tin. Sau khi đăng nhập, quay lại đây để tiếp tục cùng yêu cầu.</p></div> : !canBook && <p className="text-sm">Vui lòng dùng tài khoản khách hàng để đặt vé.</p>}
              {!prepared && !uncertain && <p role="status" className="text-sm text-[#5C636A]">Thông tin đã được chuẩn bị trên trang này, chưa tạo hóa đơn và chưa giữ ghế. {confirmed ? "Vui lòng kiểm tra lại số ghế và điểm đón trước khi gửi." : "Bạn có thể sửa thông tin; gửi giữ ghế sẽ mở khi lịch đón của chuyến sẵn sàng."}</p>}
              <div className="flex flex-wrap justify-between gap-3"><button type="button" disabled={submitting || uncertain} onClick={() => { setReview(null); setSubmitError(""); }} className={`${actionStyle} border border-[#6B7280]`}>Sửa thông tin hành khách</button><button type="button" onClick={() => void submitHold()} disabled={submitting || !canBook || !policy || (!uncertain && (!prepared || !available || !!selectionChanged))} className={`${actionStyle} bg-[#FEBB02] text-black hover:bg-[#E5A800]`}>{submitting ? "Đang gửi yêu cầu…" : uncertain ? "Thử lại cùng yêu cầu" : "Giữ ghế và thanh toán"}</button></div>
              <p className="text-xs text-[#5C636A]">Không chuyển khoản khi chưa có hóa đơn và hướng dẫn thanh toán từ hệ thống.</p>
            </div>
          )}
          <a href="tel:0972699242" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-[#186734] underline underline-offset-4">Cần hỗ trợ? Gọi 0972 699 242</a>
        </div>
      </dialog>
    </>
  );
}
