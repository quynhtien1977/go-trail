"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { formatVnd, formatVietnamDateTime } from "@/lib/catalog-client";
import type { TripDto, DepartureDto, Page } from "@/schemas/catalog";
import {
  Calendar as CalendarIcon,
  RefreshCw,
  Phone,
  AlertCircle,
  CheckCircle,
  X,
  MessageCircle,
} from "lucide-react";

interface TripBookingSidebarProps {
  trip: TripDto;
  departures: DepartureDto[];
  departuresPageMeta: Page<DepartureDto>["pagination"] | null;
  departuresLoading: boolean;
  departuresError: string | null;
  onRetryDepartures: () => void;
  onLoadMoreDepartures?: () => void;
  loadingMoreDepartures?: boolean;
  loadMoreDeparturesError?: string | null;
  onRetryLoadMoreDepartures?: () => void;
  selectedDepId: string | null;
  onSelectDeparture: (depId: string) => void;
  zaloGroupUrl: string;
}

export function TripBookingSidebar({
  trip,
  departures,
  departuresPageMeta,
  departuresLoading,
  departuresError,
  onRetryDepartures,
  onLoadMoreDepartures,
  loadingMoreDepartures = false,
  loadMoreDeparturesError,
  onRetryLoadMoreDepartures,
  selectedDepId,
  onSelectDeparture,
  zaloGroupUrl,
}: TripBookingSidebarProps) {
  const [showContactModal, setShowContactModal] = useState(false);

  // Lắng nghe phím ESC để đóng modal tư vấn
  useEffect(() => {
    if (!showContactModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowContactModal(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showContactModal]);

  // Xác định chuyến đang chọn
  const selectedDeparture =
    departures.find((d) => String(d.departure_id) === selectedDepId) ||
    (departures.length > 0 ? departures[0] : null);

  // Đơn giá thực tế: ưu tiên giá của departure được chọn, fallback sang base_price của trip
  const effectivePriceStr = selectedDeparture
    ? selectedDeparture.price
    : trip.base_price;

  const hasMoreDepartures =
    departuresPageMeta &&
    departuresPageMeta.totalItems > departures.length &&
    departuresPageMeta.page < departuresPageMeta.totalPages;

  return (
    <div className="sticky top-[120px] bg-white border border-neutral-300 rounded-[8px] shadow-sm overflow-hidden">
      {/* Header Widget */}
      <div className="bg-[#186734] p-4 text-white text-center">
        <h3 className="text-[20px] font-bold m-0 uppercase tracking-tight">
          THÔNG TIN CHUYẾN XE
        </h3>
        <p className="text-[13px] text-emerald-100 m-0 mt-1">
          Giá vé niêm yết:{" "}
          <strong className="text-[#FEBB02] text-[16px]">
            {formatVnd(effectivePriceStr)}
          </strong>
        </p>
      </div>

      <div className="p-5 space-y-6">
        {/* Social Support Groups */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={zaloGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 bg-[#FEBB02] hover:bg-[#E5A800] rounded-[6px] text-[13px] font-bold text-black transition-colors active:scale-95"
          >
            <Image
              src="/ref/i-zalo-black.svg"
              alt="Zalo"
              width={32}
              height={32}
              className="shrink-0"
            />
            <span className="leading-tight">Nhóm Zalo Tuyến</span>
          </a>
          <a
            href="https://www.facebook.com/groups/inspiretrails.life"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 bg-[#FEBB02] hover:bg-[#E5A800] rounded-[6px] text-[13px] font-bold text-black transition-colors active:scale-95"
          >
            <Image
              src="/ref/i-facebook-black.svg"
              alt="Facebook"
              width={32}
              height={32}
              className="shrink-0"
            />
            <span className="leading-tight">Cộng Đồng GoTrail</span>
          </a>
        </div>

        {/* =========================================================================
            BƯỚC 1: LỊCH KHỞI HÀNH
            ========================================================================= */}
        <div className="sidebar-box border-t border-neutral-100 pt-4">
          <h5 className="text-[20px] font-bold text-black flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-full bg-[#ffb400] text-black text-[14px] font-bold inline-flex items-center justify-center shrink-0">
              1
            </span>
            Lịch khởi hành
          </h5>

          {/* 1.1 Trạng thái Loading */}
          {departuresLoading && (
            <div className="p-4 bg-neutral-50 rounded-[8px] border border-neutral-200 text-center space-y-3 animate-pulse">
              <div className="h-4 bg-neutral-200 rounded w-1/2 mx-auto" />
              <div className="h-10 bg-neutral-200 rounded w-full" />
              <div className="h-10 bg-neutral-200 rounded w-full" />
            </div>
          )}

          {/* 1.2 Trạng thái Error (Network / 500) */}
          {!departuresLoading && departuresError && (
            <div className="p-4 bg-red-50 rounded-[8px] border border-red-200 text-center space-y-2.5">
              <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-[13px] font-bold text-red-900 m-0">
                Lỗi tải lịch khởi hành
              </p>
              <p className="text-[12px] text-red-600 m-0 leading-relaxed">
                {departuresError}
              </p>
              <button
                type="button"
                onClick={onRetryDepartures}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold rounded-[4px] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại
              </button>
            </div>
          )}

          {/* 1.3 Trạng thái Empty hợp lệ */}
          {!departuresLoading && !departuresError && departures.length === 0 && (
            <div className="p-4 bg-neutral-50 rounded-[8px] border border-neutral-200 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <p className="text-[14px] font-bold text-neutral-800 m-0">
                Chưa có chuyến mở bán sắp tới
              </p>
              <p className="text-[12px] text-neutral-500 m-0 leading-relaxed">
                Cung đường này hiện chưa có lịch khởi hành mở bán. Bạn vui lòng liên hệ hotline hoặc tham gia nhóm Zalo để nhận thông báo sớm nhất!
              </p>
              <a
                href={zaloGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-3 py-1.5 bg-[#FEBB02] hover:bg-[#E5A800] text-black text-[12px] font-bold rounded-[4px] transition-colors"
              >
                Tham gia Zalo nhận thông báo
              </a>
            </div>
          )}

          {/* 1.4 Danh sách chuyến mở bán thực tế từ API */}
          {!departuresLoading && !departuresError && departures.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px] text-neutral-600 m-0 mb-1">
                <span>Chọn ngày khởi hành:</span>
                {departuresPageMeta && (
                  <span className="font-semibold text-neutral-500">
                    ({departures.length} / {departuresPageMeta.totalItems} chuyến)
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {departures.map((dep) => {
                  const isSelected = selectedDeparture?.departure_id === dep.departure_id;
                  return (
                    <button
                      key={dep.departure_id}
                      type="button"
                      onClick={() => onSelectDeparture(String(dep.departure_id))}
                      className={`w-full p-3 rounded-[6px] border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#FFF9E6] border-[#FEBB02] ring-1 ring-[#FEBB02]"
                          : "bg-white border-neutral-200 hover:border-neutral-400"
                      }`}
                    >
                      <div>
                        <p className="font-bold text-black text-[14px] m-0">
                          {formatVietnamDateTime(dep.departure_date, {
                            weekday: "long",
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-[12px] text-neutral-500 m-0 mt-0.5">
                          Hạn chốt vé:{" "}
                          {formatVietnamDateTime(dep.booking_deadline, {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-[#186734] text-[14px]">
                          {formatVnd(dep.price)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Nút xem thêm chuyến khác hoặc thông báo lỗi tải thêm */}
              {loadMoreDeparturesError ? (
                <div className="text-center pt-2">
                  <div className="flex items-center justify-between gap-2 p-2 bg-red-50 border border-red-200 rounded-[6px] text-xs text-red-700">
                    <span className="font-semibold">Lỗi tải lịch khởi hành</span>
                    <button
                      type="button"
                      onClick={onRetryLoadMoreDepartures || onLoadMoreDepartures}
                      disabled={loadingMoreDepartures}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingMoreDepartures ? "animate-spin" : ""}`} /> Thử lại
                    </button>
                  </div>
                </div>
              ) : (
                hasMoreDepartures && onLoadMoreDepartures && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={onLoadMoreDepartures}
                      disabled={loadingMoreDepartures}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold rounded-[6px] transition-colors cursor-pointer"
                    >
                      {loadingMoreDepartures ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang tải thêm chuyến...
                        </>
                      ) : (
                        <>Xem thêm chuyến ({departuresPageMeta.totalItems - departures.length} chuyến còn lại)</>
                      )}
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* =========================================================================
            BƯỚC 2: VỊ TRÍ NGỒI - CLONE 1:1 THEO GOTRAIL.VN (CHUẨN PIXEL-PERFECT)
            ========================================================================= */}
        <div className="sidebar-box border-t border-neutral-100 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[#ffb400] text-black text-[14px] font-bold inline-flex items-center justify-center shrink-0">
              2
            </span>
            <h5 className="text-[20px] font-bold text-black m-0">Vị trí ngồi</h5>
          </div>

          {/* Sơ đồ xe 45 chỗ GoTrail Full View - Clone 1:1 theo ảnh mẫu gotrail.vn */}
          <div className="w-full max-w-[340px] mx-auto border border-[#dee2e6] rounded-[20px] p-5 sm:p-6 bg-[#F8F9FA] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {/* Biểu tượng vô lăng bác tài ở góc trên bên trái */}
            <div className="mb-4 pl-0.5">
              <svg
                className="w-10 h-10 text-[#6c757d]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Vô lăng bác tài"
              >
                <circle cx="12" cy="12" r="9" strokeWidth="2.2" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                <line x1="12" y1="15" x2="12" y2="21" strokeWidth="2.2" />
                <line x1="9" y1="12" x2="3" y2="12" strokeWidth="2.2" />
                <line x1="15" y1="12" x2="21" y2="12" strokeWidth="2.2" />
              </svg>
            </div>

            {/* Bảng ghế xe 45 chỗ: Hàng 1-10 gồm 4 ghế (cặp A-B và C-D), Hàng 11 gồm 5 ghế (A11, B11, V11, C11, D11) */}
            <div className="space-y-2.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((row) => {
                const seatA = `A${row}`;
                const seatB = `B${row}`;
                const seatC = `C${row}`;
                const seatD = `D${row}`;

                const renderSeat = (code: string) => (
                  <button
                    key={code}
                    type="button"
                    disabled
                    aria-label={`Ghế ${code} (tham khảo)`}
                    className="w-[42px] h-[40px] rounded-[6px] bg-white border border-[#ced4da] text-[#495057] text-[13px] font-normal shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center cursor-not-allowed select-none transition-colors"
                  >
                    {code}
                  </button>
                );

                return (
                  <div key={row} className="flex items-center justify-between">
                    {/* Cặp ghế bên trái (A, B) */}
                    <div className="flex gap-2">
                      {renderSeat(seatA)}
                      {renderSeat(seatB)}
                    </div>

                    {/* Lối đi ở giữa khoang xe (trống trơn theo đúng ảnh mẫu gotrail.vn) */}
                    <div className="w-8 sm:w-10" />

                    {/* Cặp ghế bên phải (C, D) */}
                    <div className="flex gap-2">
                      {renderSeat(seatC)}
                      {renderSeat(seatD)}
                    </div>
                  </div>
                );
              })}

              {/* Hàng 11: Băng ghế sau cùng gồm 5 ghế liền nhau (A11, B11, V11, C11, D11) */}
              <div className="flex items-center justify-between pt-0.5">
                {["A11", "B11", "V11", "C11", "D11"].map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled
                    aria-label={`Ghế ${code} (tham khảo)`}
                    className="w-[42px] h-[40px] rounded-[6px] bg-white border border-[#ced4da] text-[#495057] text-[13px] font-normal shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center cursor-not-allowed select-none transition-colors"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            {/* Chú thích trạng thái ghế (Legend 1:1 ảnh mẫu) */}
            <div className="flex items-center justify-center gap-4 sm:gap-5 mt-6 pt-1 text-[11px] sm:text-[12px] text-[#495057]">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-[13px] h-[13px] bg-white border border-[#ced4da] rounded-[2px]" />
                <span>Còn trống</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-[13px] h-[13px] bg-[#6c757d] rounded-[2px]" />
                <span>Đã bán</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-[13px] h-[13px] bg-white border-[2px] border-[#feaa00] rounded-[2px]" />
                <span>Đang chọn</span>
              </div>
            </div>
          </div>

          {/* Bảng tóm tắt đặt vé (1:1 chuẩn table gotrail.vn) */}
          <div className="mt-4 overflow-hidden rounded-[4px] border border-[#dee2e6]">
            <table className="w-full text-center align-middle text-[13px] border-collapse">
              <thead className="bg-[#f8f9fa] border-b border-[#dee2e6]">
                <tr className="text-[#495057] font-semibold">
                  <th className="py-2 px-3 border-r border-[#dee2e6] w-[35%] text-center">Loại Vé</th>
                  <th className="py-2 px-3 border-r border-[#dee2e6] w-[25%] text-center">Số Ghế</th>
                  <th className="py-2 px-3 w-[40%] text-center">Giá Tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#dee2e6]">
                  <td className="py-2 px-3 border-r border-[#dee2e6] text-[#495057] text-center">
                    Vé tiêu chuẩn
                  </td>
                  <td className="py-2 px-3 border-r border-[#dee2e6] text-[#6c757d] text-center">
                    -
                  </td>
                  <td className="py-2 px-3 text-center text-[#495057]">
                    {formatVnd(effectivePriceStr)}
                  </td>
                </tr>
                <tr className="border-t border-[#dee2e6] bg-[#f8f9fa]/50">
                  <td className="py-2.5 px-3 font-bold text-neutral-800 border-r border-[#dee2e6] text-center">
                    Tổng vé
                  </td>
                  <td colSpan={2} className="py-2.5 px-3 text-right font-bold text-[15px] text-[#186734]">
                    {formatVnd(effectivePriceStr)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Chú thích thông tin xe (1:1 chuẩn gotrail.vn + nhãn tham khảo an toàn Gate C) */}
          <p className="text-[12px] text-[#6c757d] italic text-left mt-2 mb-0 leading-relaxed">
            * Sơ đồ xe 45 chỗ, vị trí ghế có thể thay đổi dựa theo số lượng ghế thực tế của đoàn. (Sơ đồ tham khảo)
          </p>

          {/* NÚT VÀNG CTA CHÍNH */}
          <div className="pt-4">
            {departures.length === 0 ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled
                  className="w-full block text-center py-3.5 bg-neutral-200 text-neutral-400 font-bold text-[16px] rounded-[6px] cursor-not-allowed uppercase tracking-wider"
                >
                  CHƯA MỞ BÁN CHUYẾN
                </button>
                <a
                  href="tel:0972699242"
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-[#186734] text-[#186734] hover:bg-[#186734] hover:text-white font-bold text-[14px] rounded-[6px] transition-colors"
                >
                  <Phone className="w-4 h-4" /> Hotline tư vấn: 0972 699 242
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowContactModal(true)}
                  className="w-full block text-center py-3.5 bg-[#FEBB02] hover:bg-[#E5A800] text-black font-extrabold text-[18px] rounded-[6px] uppercase tracking-wider transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                >
                  LIÊN HỆ TƯ VẤN CHUYẾN NÀY
                </button>
                <p className="text-[12px] text-neutral-500 text-center m-0">
                  Chuyến đang chọn:{" "}
                  <strong>
                    {selectedDeparture
                      ? formatVietnamDateTime(selectedDeparture.departure_date, {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })
                      : "Vui lòng chọn ngày"}
                  </strong>{" "}
                  — Giá vé: <strong>{formatVnd(effectivePriceStr)}</strong>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Hướng dẫn Tư vấn & Đăng ký (Tuyệt đối không có 404 /booking) */}
      {showContactModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowContactModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowContactModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 cursor-pointer"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h3 className="text-[20px] font-bold text-neutral-900 m-0">
                Tư vấn đăng ký chuyến đi
              </h3>
              <p className="text-[13px] text-neutral-600 m-0 leading-relaxed">
                Tuyến: <strong>{trip.name}</strong>
                <br />
                Khởi hành:{" "}
                <strong>
                  {selectedDeparture
                    ? formatVietnamDateTime(selectedDeparture.departure_date, {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : ""}
                </strong>
                <br />
                Giá vé niêm yết: <strong className="text-[#186734]">{formatVnd(effectivePriceStr)}</strong>
              </p>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-[13px] text-amber-900 space-y-1.5">
              <p className="font-bold m-0">Tính năng thanh toán tự động qua cổng SePay đang được chuẩn bị.</p>
              <p className="m-0 text-amber-800">
                Để đăng ký tham gia chuyến đi và nhận hướng dẫn chi tiết, vui lòng liên hệ ngay với đội ngũ GoTrail qua Zalo hoặc Hotline!
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <a
                href={zaloGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#FEBB02] hover:bg-[#E5A800] text-black font-extrabold text-[15px] rounded-[8px] transition-colors shadow-xs"
              >
                <MessageCircle className="w-5 h-5" /> Nhắn Zalo tư vấn ngay
              </a>
              <a
                href="tel:0972699242"
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 font-bold text-[14px] rounded-[8px] transition-colors"
              >
                <Phone className="w-4 h-4 text-emerald-700" /> Gọi Hotline: 0972 699 242
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
