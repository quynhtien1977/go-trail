"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import type { TripDto, PickupDto, Page } from "@/schemas/catalog";
import { RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Maximize2, ImageOff } from "lucide-react";
import type { LightboxImage } from "./trip-lightbox";

interface TripScheduleSectionProps {
  trip: TripDto;
  pickups: PickupDto[];
  pickupsPageMeta: Page<PickupDto>["pagination"] | null;
  pickupsLoading: boolean;
  pickupsError: string | null;
  onRetryPickups: () => void;
  onLoadMorePickups?: () => void;
  loadingMorePickups?: boolean;
  loadMorePickupsError?: string | null;
  onRetryLoadMorePickups?: () => void;
  schedulePhotos: LightboxImage[];
  onOpenLightbox: (images: LightboxImage[], startIndex: number) => void;
}

export function TripScheduleSection({
  trip,
  pickups,
  pickupsPageMeta,
  pickupsLoading,
  pickupsError,
  onRetryPickups,
  onLoadMorePickups,
  loadingMorePickups = false,
  loadMorePickupsError,
  onRetryLoadMorePickups,
  schedulePhotos,
  onOpenLightbox,
}: TripScheduleSectionProps) {
  const [isScheduleOpen, setIsScheduleOpen] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const galleryRef = useRef<HTMLDivElement>(null);
  const [canScrollGalleryPrev, setCanScrollGalleryPrev] = useState(false);
  const [canScrollGalleryNext, setCanScrollGalleryNext] = useState(false);

  const updateGalleryScrollState = useCallback(() => {
    if (!galleryRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = galleryRef.current;
    setCanScrollGalleryPrev(scrollLeft > 10);
    setCanScrollGalleryNext(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    updateGalleryScrollState();
    const el = galleryRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateGalleryScrollState, { passive: true });
    window.addEventListener("resize", updateGalleryScrollState);
    return () => {
      el.removeEventListener("scroll", updateGalleryScrollState);
      window.removeEventListener("resize", updateGalleryScrollState);
    };
  }, [updateGalleryScrollState, schedulePhotos]);

  const handleGalleryScroll = (direction: "left" | "right") => {
    if (!galleryRef.current) return;
    const step = galleryRef.current.clientWidth * 0.8;
    galleryRef.current.scrollBy({
      left: direction === "left" ? -step : step,
      behavior: "smooth",
    });
  };

  const hasMorePickups =
    pickupsPageMeta &&
    pickupsPageMeta.totalItems > pickups.length &&
    pickupsPageMeta.page < pickupsPageMeta.totalPages;

  return (
    <div className="space-y-10">
      {/* LỊCH TRÌNH CHI TIẾT */}
      <div className="schedule-box">
        <h2 className="text-[26px] sm:text-[30px] font-bold text-black uppercase mb-4 tracking-tight">
          LỊCH TRÌNH CHI TIẾT
        </h2>

        <div className="border border-neutral-300 rounded-[5px] overflow-hidden bg-white shadow-2xs">
          <button
            type="button"
            onClick={() => setIsScheduleOpen(!isScheduleOpen)}
            className="schedule-header w-full flex justify-between items-center p-3 px-5 bg-[#e0e0e0] hover:bg-[#d6d6d6] rounded-[5px] text-left font-bold text-[18px] sm:text-[20px] text-black transition-colors cursor-pointer"
          >
            <h4>Hành trình: {trip.name}</h4>
            <span className="toggle-icon text-[20px] font-bold text-black font-mono">
              {isScheduleOpen ? "−" : "+"}
            </span>
          </button>

          {isScheduleOpen && (
            <div className="p-4 sm:p-6 space-y-6 bg-white animate-in fade-in duration-300">
              {/* Tóm tắt thông số lịch trình */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 border-b border-neutral-200 text-[15px] sm:text-[16px]">
                <div className="flex items-center gap-3">
                  <Image
                    src="/ref/i-marker.svg"
                    alt="Quãng đường"
                    width={24}
                    height={24}
                    className="shrink-0"
                  />
                  <p className="m-0">
                    <strong>Cự ly:</strong>{" "}
                    {trip.length_km ? `~${trip.length_km} km` : "Đang cập nhật"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Image
                    src="/ref/i-do-cao-dinh.svg"
                    alt="Độ cao"
                    width={24}
                    height={24}
                    className="shrink-0"
                  />
                  <p className="m-0">
                    <strong>Độ cao:</strong>{" "}
                    {trip.peak_height_m != null && trip.peak_height_m > 0
                      ? `${trip.peak_height_m}m`
                      : trip.peak_height_m === 0
                      ? "0m"
                      : "Đang cập nhật"}
                  </p>
                </div>
              </div>

              {/* Nội dung chi tiết lịch trình (Plain text an toàn, không raw HTML) */}
              <div className="space-y-4 text-[16px] md:text-[18px] text-neutral-800 leading-relaxed whitespace-pre-line">
                {trip.schedule_content || "Nội dung lịch trình đang được cập nhật."}
              </div>

              {/* Danh sách điểm đón khách thực tế */}
              <div className="pt-4 border-t border-neutral-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-[16px] text-black m-0">
                    Điểm đón và trả khách dự kiến:
                  </h5>
                  {pickupsPageMeta && pickupsPageMeta.totalItems > 0 && (
                    <span className="text-[12px] text-neutral-500 font-medium">
                      ({pickups.length} / {pickupsPageMeta.totalItems} điểm đón)
                    </span>
                  )}
                </div>

                {pickupsLoading && (
                  <div className="p-4 bg-neutral-50 rounded-[6px] border border-neutral-200 text-sm text-neutral-500 animate-pulse">
                    Đang tải danh sách điểm đón...
                  </div>
                )}

                {!pickupsLoading && pickupsError && (
                  <div className="p-3 bg-red-50 rounded-[6px] border border-red-200 flex items-center justify-between text-xs text-red-700">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {pickupsError}
                    </span>
                    <button
                      type="button"
                      onClick={onRetryPickups}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> Thử lại
                    </button>
                  </div>
                )}

                {!pickupsLoading && !pickupsError && pickups.length === 0 && (
                  <p className="text-sm text-neutral-500 italic m-0">
                    Chưa có thông tin điểm đón cụ thể. Vui lòng liên hệ điều phối viên khi khởi hành.
                  </p>
                )}

                {!pickupsLoading && !pickupsError && pickups.length > 0 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {pickups.map((p) => (
                        <div
                          key={p.pickup_id}
                          className="p-3.5 bg-neutral-50 hover:bg-neutral-100/80 transition-colors rounded-[6px] border border-neutral-200 text-[14px]"
                        >
                          <p className="font-bold text-black m-0">📍 {p.name}</p>
                          <p className="text-neutral-600 m-0 mt-1">{p.address}</p>
                        </div>
                      ))}
                    </div>

                    {/* Nút xem thêm điểm đón hoặc thông báo lỗi tải thêm */}
                    {loadMorePickupsError ? (
                      <div className="text-center pt-2">
                        <div className="flex items-center justify-between gap-2 p-3 bg-red-50 border border-red-200 rounded-[6px] text-xs text-red-700">
                          <span className="font-semibold">Lỗi tải điểm đón</span>
                          <button
                            type="button"
                            onClick={onRetryLoadMorePickups || onLoadMorePickups}
                            disabled={loadingMorePickups}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                          >
                            <RefreshCw className={`w-3 h-3 ${loadingMorePickups ? "animate-spin" : ""}`} /> Thử lại
                          </button>
                        </div>
                      </div>
                    ) : (
                      hasMorePickups && onLoadMorePickups && (
                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={onLoadMorePickups}
                            disabled={loadingMorePickups}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold rounded-[6px] transition-colors cursor-pointer"
                          >
                            {loadingMorePickups ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang tải thêm điểm đón...
                              </>
                            ) : (
                              <>Xem thêm điểm đón ({pickupsPageMeta.totalItems - pickups.length} điểm còn lại)</>
                            )}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Gallery ảnh thực tế lịch trình (Được phóng to rõ nét theo yêu cầu người dùng) */}
              {schedulePhotos.length > 0 && (
                <div className="pt-6 border-t border-neutral-200">
                  <div className="flex items-center justify-between mb-4">
                    <h5 className="font-bold text-[17px] text-black m-0">
                      Hình ảnh thực tế cung đường ({schedulePhotos.length} ảnh):
                    </h5>
                    {schedulePhotos.length > 2 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGalleryScroll("left")}
                          disabled={!canScrollGalleryPrev}
                          className={`w-8 h-8 rounded-full border border-neutral-400 bg-white flex items-center justify-center transition-all ${
                            !canScrollGalleryPrev
                              ? "opacity-30 cursor-not-allowed"
                              : "hover:bg-black hover:text-white cursor-pointer active:scale-95 shadow-xs"
                          }`}
                          aria-label="Previous photos"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGalleryScroll("right")}
                          disabled={!canScrollGalleryNext}
                          className={`w-8 h-8 rounded-full border border-neutral-400 bg-white flex items-center justify-center transition-all ${
                            !canScrollGalleryNext
                              ? "opacity-30 cursor-not-allowed"
                              : "hover:bg-black hover:text-white cursor-pointer active:scale-95 shadow-xs"
                          }`}
                          aria-label="Next photos"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Khung gallery mở rộng, ảnh to rõ ràng hơn (240x300px) */}
                  <div
                    ref={galleryRef}
                    className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-3 pt-1 select-none"
                    style={{
                      scrollbarWidth: "none",
                      msOverflowStyle: "none",
                    }}
                  >
                    {schedulePhotos.map((photo, pIdx) => (
                      <div
                        key={pIdx}
                        onClick={() => onOpenLightbox(schedulePhotos, pIdx)}
                        className="group relative cursor-pointer snap-start shrink-0 rounded-[8px] overflow-hidden w-[210px] sm:w-[250px] md:w-[270px] h-[270px] sm:h-[310px] bg-neutral-100 shadow-xs border border-neutral-200 transition-all duration-300 hover:shadow-md hover:-translate-y-1"
                      >
                        <Image
                          src={photo.src}
                          alt={photo.caption}
                          fill
                          loading="lazy"
                          sizes="(max-width: 640px) 210px, 270px"
                          className={`object-cover rounded-[8px] transition-transform duration-500 group-hover:scale-108 ${
                            failedImages[photo.src] ? "opacity-0" : "opacity-100"
                          }`}
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [photo.src]: true }))
                          }
                        />
                        {failedImages[photo.src] && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-200 text-neutral-500 p-3 text-center rounded-[8px]">
                            <ImageOff className="w-7 h-7 text-neutral-400 mb-1" />
                            <span className="text-[11px] font-medium">Không thể tải ảnh</span>
                          </div>
                        )}
                        {/* Overlay icon phóng to */}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg">
                            <Maximize2 className="w-5 h-5" />
                          </div>
                        </div>
                        {/* Badge số thứ tự ảnh */}
                        <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded bg-black/60 backdrop-blur-xs text-white text-[11px] font-medium pointer-events-none">
                          Ảnh {pIdx + 1} / {schedulePhotos.length}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* HÀNH LÝ CHUẨN BỊ */}
      <div className="packing-list py-2">
        <h2 className="text-[26px] sm:text-[30px] font-bold text-black uppercase mb-6">
          HÀNH LÝ CHUẨN BỊ
        </h2>

        <div className="space-y-6 text-[16px] sm:text-[18px] text-neutral-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="m-0">+ Giày leo núi, giày chạy trail có độ bám tốt</p>
              <p className="m-0">+ Kem chống nắng, xịt chống côn trùng</p>
              <p className="m-0">+ Quần áo thể thao mau khô, co giãn thoải mái</p>
              <p className="m-0">+ Nước uống mang theo tối thiểu 1.5L</p>
              <p className="m-0">+ 01 bộ đồ khô dự phòng thay sau khi xuống núi</p>
            </div>
            <div className="space-y-2">
              <p className="m-0">+ Đồ ăn nhẹ bổ sung năng lượng: gel, thanh hạt, chuối...</p>
              <p className="m-0">+ Khăn đa năng, mũ lưỡi trai hoặc nón rộng vành</p>
              <p className="m-0">+ Ba lô thể thao có quai ngực và đai trợ lực</p>
              <p className="m-0">+ Túi zip chống nước bọc điện thoại, giấy tờ cá nhân</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
