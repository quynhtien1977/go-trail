"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";
import {
  fetchPublicTripDetail,
  fetchPublicTripPickupsPage,
  fetchPublicTripDeparturesPage,
  formatVnd,
  FALLBACK_TRIP_IMAGE,
} from "@/lib/catalog-client";
import type { TripDto, PickupDto, DepartureDto, Page } from "@/schemas/catalog";
import { RefreshCw } from "lucide-react";

import { TripHeroSection } from "@/components/catalog/trip-hero-section";
import { TripHighlightsSection, type FeatureCard } from "@/components/catalog/trip-highlights-section";
import { TripScheduleSection } from "@/components/catalog/trip-schedule-section";
import { TripBookingSidebar } from "@/components/catalog/trip-booking-sidebar";
import { TripFaqSection } from "@/components/catalog/trip-faq-section";
import { TripLightbox, type LightboxImage } from "@/components/catalog/trip-lightbox";

/**
 * Tra cứu link Zalo Group hỗ trợ theo từng tuyến thực tế
 */
export function getTripZaloGroup(sourceUrl?: string | null): string {
  if (!sourceUrl) return "https://zalo.me/0972699242";
  if (sourceUrl.includes("chua-chan")) return "https://zalo.me/g/xvmqca473";
  if (sourceUrl.includes("ba-den")) return "https://zalo.me/g/ctfdkq473";
  if (sourceUrl.includes("nui-dinh")) return "https://zalo.me/g/gpixyw591";
  if (sourceUrl.includes("cat-tien")) return "https://zalo.me/g/rvhrpo972";
  if (sourceUrl.includes("lao-than")) return "https://zalo.me/g/dvebmf948";
  return "https://zalo.me/0972699242";
}

export default function TripDetailPage() {
  const routeParams = useParams();
  const id = typeof routeParams?.id === "string" ? routeParams.id : Array.isArray(routeParams?.id) ? routeParams.id[0] : "";

  // Trạng thái dữ liệu tuyến chính
  const [trip, setTrip] = useState<TripDto | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [tripError, setTripError] = useState<string | null>(null);

  // Trạng thái điểm đón (có phân trang metadata từ API)
  const [pickups, setPickups] = useState<PickupDto[]>([]);
  const [pickupsPageMeta, setPickupsPageMeta] = useState<Page<PickupDto>["pagination"] | null>(null);
  const [pickupsLoading, setPickupsLoading] = useState(true);
  const [loadingMorePickups, setLoadingMorePickups] = useState(false);
  const [pickupsError, setPickupsError] = useState<string | null>(null);
  const [loadMorePickupsError, setLoadMorePickupsError] = useState<string | null>(null);

  // Trạng thái lịch khởi hành (có phân trang metadata từ API)
  const [departures, setDepartures] = useState<DepartureDto[]>([]);
  const [departuresPageMeta, setDeparturesPageMeta] = useState<Page<DepartureDto>["pagination"] | null>(null);
  const [departuresLoading, setDeparturesLoading] = useState(true);
  const [loadingMoreDepartures, setLoadingMoreDepartures] = useState(false);
  const [departuresError, setDeparturesError] = useState<string | null>(null);
  const [loadMoreDeparturesError, setLoadMoreDeparturesError] = useState<string | null>(null);

  // Trạng thái chọn chuyến khởi hành thật
  const [selectedDepId, setSelectedDepId] = useState<string | null>(null);

  // Trạng thái Lightbox xem ảnh
  const [lightboxData, setLightboxData] = useState<{
    images: LightboxImage[];
    currentIndex: number;
    isOpen: boolean;
  }>({
    images: [],
    currentIndex: 0,
    isOpen: false,
  });

  const openLightbox = useCallback((images: LightboxImage[], startIndex: number = 0) => {
    setLightboxData({
      images,
      currentIndex: startIndex,
      isOpen: true,
    });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxData((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const setLightboxIndex = useCallback((newIndex: number) => {
    setLightboxData((prev) => ({ ...prev, currentIndex: newIndex }));
  }, []);

  // 1. Tải chi tiết tuyến trekking
  const loadTrip = useCallback(() => {
    setLoadingTrip(true);
    setTripError(null);
    fetchPublicTripDetail(id)
      .then((data) => {
        setTrip(data);
      })
      .catch((err) => {
        setTripError(
          err instanceof Error
            ? err.message
            : "Không tìm thấy thông tin tuyến trekking này"
        );
      })
      .finally(() => {
        setLoadingTrip(false);
      });
  }, [id]);

  // 2. Tải trang đầu điểm đón
  const loadPickups = useCallback(
    (page: number = 1) => {
      setPickupsLoading(true);
      setPickupsError(null);
      setLoadMorePickupsError(null);
      fetchPublicTripPickupsPage(id, { page, pageSize: 20 })
        .then((pageData) => {
          setPickups(pageData.items);
          setPickupsPageMeta(pageData.pagination);
        })
        .catch((err) => {
          setPickupsError(
            err instanceof Error ? err.message : "Không thể tải điểm đón"
          );
        })
        .finally(() => {
          setPickupsLoading(false);
        });
    },
    [id]
  );

  // Tải thêm điểm đón tiếp theo
  const loadMorePickups = useCallback(() => {
    if (!pickupsPageMeta || loadingMorePickups) return;
    if (pickupsPageMeta.page >= pickupsPageMeta.totalPages) return;

    setLoadingMorePickups(true);
    setLoadMorePickupsError(null);
    const nextPage = pickupsPageMeta.page + 1;
    fetchPublicTripPickupsPage(id, { page: nextPage, pageSize: 20 })
      .then((pageData) => {
        setPickups((prev) => {
          const existingIds = new Set(prev.map((p) => p.pickup_id));
          const newItems = pageData.items.filter((p) => !existingIds.has(p.pickup_id));
          return [...prev, ...newItems];
        });
        setPickupsPageMeta(pageData.pagination);
        setLoadMorePickupsError(null);
      })
      .catch((err) => {
        setLoadMorePickupsError(
          err instanceof Error ? err.message : "Lỗi tải điểm đón"
        );
      })
      .finally(() => {
        setLoadingMorePickups(false);
      });
  }, [id, pickupsPageMeta, loadingMorePickups]);

  // 3. Tải trang đầu lịch khởi hành
  const loadDepartures = useCallback(
    (page: number = 1) => {
      setDeparturesLoading(true);
      setDeparturesError(null);
      setLoadMoreDeparturesError(null);
      fetchPublicTripDeparturesPage(id, { page, pageSize: 20 })
        .then((pageData) => {
          setDepartures(pageData.items);
          setDeparturesPageMeta(pageData.pagination);
          if (pageData.items.length > 0) {
            setSelectedDepId(String(pageData.items[0].departure_id));
          } else {
            setSelectedDepId(null);
          }
        })
        .catch((err) => {
          setDeparturesError(
            err instanceof Error ? err.message : "Không thể tải lịch khởi hành"
          );
        })
        .finally(() => {
          setDeparturesLoading(false);
        });
    },
    [id]
  );

  // Tải thêm chuyến khởi hành tiếp theo
  const loadMoreDepartures = useCallback(() => {
    if (!departuresPageMeta || loadingMoreDepartures) return;
    if (departuresPageMeta.page >= departuresPageMeta.totalPages) return;

    setLoadingMoreDepartures(true);
    setLoadMoreDeparturesError(null);
    const nextPage = departuresPageMeta.page + 1;
    fetchPublicTripDeparturesPage(id, { page: nextPage, pageSize: 20 })
      .then((pageData) => {
        setDepartures((prev) => {
          const existingIds = new Set(prev.map((d) => d.departure_id));
          const newItems = pageData.items.filter((d) => !existingIds.has(d.departure_id));
          return [...prev, ...newItems];
        });
        setDeparturesPageMeta(pageData.pagination);
        setLoadMoreDeparturesError(null);
      })
      .catch((err) => {
        setLoadMoreDeparturesError(
          err instanceof Error ? err.message : "Lỗi tải lịch khởi hành"
        );
      })
      .finally(() => {
        setLoadingMoreDepartures(false);
      });
  }, [id, departuresPageMeta, loadingMoreDepartures]);

  // Khởi chạy khi mount hoặc id thay đổi (qua async tasks không setState đồng bộ)
  useEffect(() => {
    let isCancelled = false;

    fetchPublicTripDetail(id)
      .then((data) => {
        if (!isCancelled) setTrip(data);
      })
      .catch((err) => {
        if (!isCancelled) {
          setTripError(
            err instanceof Error
              ? err.message
              : "Không tìm thấy thông tin tuyến trekking này"
          );
        }
      })
      .finally(() => {
        if (!isCancelled) setLoadingTrip(false);
      });

    fetchPublicTripPickupsPage(id, { page: 1, pageSize: 20 })
      .then((pageData) => {
        if (!isCancelled) {
          setPickups(pageData.items);
          setPickupsPageMeta(pageData.pagination);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setPickupsError(
            err instanceof Error ? err.message : "Không thể tải điểm đón"
          );
        }
      })
      .finally(() => {
        if (!isCancelled) setPickupsLoading(false);
      });

    fetchPublicTripDeparturesPage(id, { page: 1, pageSize: 20 })
      .then((pageData) => {
        if (!isCancelled) {
          setDepartures(pageData.items);
          setDeparturesPageMeta(pageData.pagination);
          if (pageData.items.length > 0) {
            setSelectedDepId(String(pageData.items[0].departure_id));
          } else {
            setSelectedDepId(null);
          }
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setDeparturesError(
            err instanceof Error ? err.message : "Không thể tải lịch khởi hành"
          );
        }
      })
      .finally(() => {
        if (!isCancelled) setDeparturesLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [id]);

  // Nếu đang loading toàn trang
  if (loadingTrip) {
    return (
      <div className="min-h-screen flex flex-col bg-white font-sans">
        <Navbar />
        <main className="flex-1 max-w-[1240px] w-full mx-auto px-4 pt-[120px] pb-16 space-y-8 animate-pulse">
          <div className="h-12 bg-neutral-200 rounded w-full mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="h-[460px] bg-neutral-200 rounded-[16px]" />
            <div className="space-y-4">
              <div className="h-10 bg-neutral-200 rounded w-3/4" />
              <div className="grid grid-cols-2 gap-4 h-36 bg-neutral-100 rounded" />
              <div className="h-32 bg-neutral-100 rounded" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Nếu có lỗi tải tuyến hoặc không tìm thấy tuyến
  if (tripError || !trip) {
    return (
      <div className="min-h-screen flex flex-col bg-white font-sans">
        <Navbar />
        <main className="flex-1 max-w-[1240px] w-full mx-auto px-4 pt-[140px] pb-24 text-center">
          <div className="max-w-md mx-auto space-y-5 p-8 rounded-2xl bg-neutral-50 border border-neutral-200">
            <h2 className="text-2xl font-bold text-neutral-900">
              Không tìm thấy tuyến trekking
            </h2>
            <p className="text-neutral-600 text-sm leading-relaxed">
              {tripError ||
                "Tuyến trekking bạn đang tìm kiếm không tồn tại hoặc đã tạm dừng hoạt động."}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={loadTrip}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white font-bold text-sm rounded-[6px] hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Thử lại
              </button>
              <Link
                href="/"
                className="inline-block px-5 py-2.5 bg-[#FEBB02] text-black font-bold text-sm rounded-[6px] hover:bg-[#E5A800] transition-colors"
              >
                Quay lại trang chủ
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Phân loại mảng Media từ API theo đúng placement
  const heroMedia = (trip.media || []).filter(
    (m) => m.placement === "Hero" || m.placement === "Cover"
  );
  const highlightMedia = (trip.media || [])
    .filter((m) => m.placement === "Highlight")
    .sort((a, b) => a.sort_order - b.sort_order);
  const scheduleMedia = (trip.media || [])
    .filter((m) => m.placement === "Schedule")
    .sort((a, b) => a.sort_order - b.sort_order);

  // 1. Dàn ảnh Hero Preview
  const heroImages: LightboxImage[] =
    heroMedia.length > 0
      ? heroMedia.map((m) => ({
          src: m.url,
          caption: m.caption || m.alt_text || trip.name,
        }))
      : [
          {
            src: trip.cover_image_url || FALLBACK_TRIP_IMAGE,
            caption: trip.name,
          },
        ];

  // 2. Thẻ điểm nổi bật (Highlights)
  const featureCards: FeatureCard[] =
    highlightMedia.length > 0
      ? highlightMedia.map((m, idx) => ({
          id: m.media_id || idx + 1,
          title: m.title || "ĐIỂM NỔI BẬT",
          desc: m.body || m.caption || "",
          image: m.url,
        }))
      : [];

  // 3. Dàn ảnh lịch trình chi tiết
  const schedulePhotos: LightboxImage[] =
    scheduleMedia.length > 0
      ? scheduleMedia.map((m) => ({
          src: m.url,
          caption: m.caption || m.alt_text || `${trip.name} - Ảnh hành trình thực tế`,
        }))
      : [];

  // Chuyến đang chọn và giá hiển thị
  const selectedDeparture =
    departures.find((d) => String(d.departure_id) === selectedDepId) ||
    (departures.length > 0 ? departures[0] : null);

  const effectivePriceStr = selectedDeparture
    ? selectedDeparture.price
    : trip.base_price;
  const zaloGroupUrl = getTripZaloGroup(trip.source_url);

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#212529] font-sans antialiased">
      <Navbar />

      {/* =========================================================================
          1. SUB-NAV BAR (fe-styles.css .sub-nav d-none d-md-block, 1:1 bản gốc)
          ========================================================================= */}
      <div className="hidden md:block sub-nav bg-[#9ACE7D] pt-[115px] pb-[12px] px-5 w-full border-b border-[#88be6b]">
        <div className="max-w-[1240px] mx-auto flex items-center justify-between gap-4">
          <div className="tour-info">
            <h5 className="text-[25px] font-bold text-black mb-0 leading-tight">
              Trail Bus – {trip.name?.replace(/Trekking |Hiking & Cycling /gi, "") || "Go Trail"}
            </h5>
            <p className="text-[15px] text-black mb-0 font-medium">
              {trip.length_km ? `~${trip.length_km}km /ngày` : "Đang cập nhật cự ly"}
            </p>
          </div>

          <div className="tour-price flex items-center gap-4">
            <div className="text-right">
              <span className="text-[25px] font-bold text-black leading-none">
                {formatVnd(effectivePriceStr)}
              </span>
            </div>
            <a
              href="#bus-booking"
              className="bg-[#FEBB02] hover:bg-[#E5A800] text-black text-[16px] font-bold px-7 py-2 rounded-[20px] transition-colors shadow-xs active:scale-95"
            >
              {departures.length > 0 ? "Đặt Chỗ Ngay" : "Xem Thông Tin"}
            </a>
          </div>
        </div>
      </div>

      <main className="flex-1">
        {/* =========================================================================
            2. PRODUCT DETAIL TOP (Hero carousel + Overview + Description)
            ========================================================================= */}
        <TripHeroSection
          trip={trip}
          heroImages={heroImages}
          onOpenLightbox={openLightbox}
        />

        {/* =========================================================================
            3. EXPERIENCE SECTION (Điểm nổi bật của hành trình)
            ========================================================================= */}
        <TripHighlightsSection
          featureCards={featureCards}
          onOpenLightbox={openLightbox}
        />

        {/* =========================================================================
            4. MAIN BOOKING & SCHEDULE SECTION
            ========================================================================= */}
        <section id="bus-booking" className="py-12 bg-white">
          <div className="max-w-[1240px] mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* CỘT TRÁI (8 CỘT): LỊCH TRÌNH CHI TIẾT & HÀNH LÝ */}
              <div className="lg:col-span-8">
                <TripScheduleSection
                  trip={trip}
                  pickups={pickups}
                  pickupsPageMeta={pickupsPageMeta}
                  pickupsLoading={pickupsLoading}
                  pickupsError={pickupsError}
                  onRetryPickups={() => loadPickups(1)}
                  onLoadMorePickups={loadMorePickups}
                  loadingMorePickups={loadingMorePickups}
                  loadMorePickupsError={loadMorePickupsError}
                  onRetryLoadMorePickups={loadMorePickups}
                  schedulePhotos={schedulePhotos}
                  onOpenLightbox={openLightbox}
                />
              </div>

              {/* CỘT PHẢI (4 CỘT): SIDEBAR ĐẶT CHỖ & SƠ ĐỒ GHẾ */}
              <div className="lg:col-span-4">
                <TripBookingSidebar
                  trip={trip}
                  departures={departures}
                  departuresPageMeta={departuresPageMeta}
                  departuresLoading={departuresLoading}
                  departuresError={departuresError}
                  onRetryDepartures={() => loadDepartures(1)}
                  onLoadMoreDepartures={loadMoreDepartures}
                  loadingMoreDepartures={loadingMoreDepartures}
                  loadMoreDeparturesError={loadMoreDeparturesError}
                  onRetryLoadMoreDepartures={loadMoreDepartures}
                  selectedDepId={selectedDepId}
                  onSelectDeparture={setSelectedDepId}
                  zaloGroupUrl={zaloGroupUrl}
                />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            5. FAQ SECTION
            ========================================================================= */}
        <TripFaqSection />

        {/* =========================================================================
            6. SECTION TEXT
            ========================================================================= */}
        <section className="section-text py-12 text-center px-4 bg-white">
          <div className="max-w-[1240px] mx-auto">
            <p className="inspire-text text-[18px] md:text-[20px] text-[#212529] font-medium leading-relaxed m-0">
              Hãy để <strong>GO TRAIL</strong> trở thành một phần trong cuộc sống của bạn – một tấm vé cho hành trình xanh, một thói quen cuối tuần đầy cảm hứng! 🚍🌿
            </p>
          </div>
        </section>

        {/* =========================================================================
            7. FLOATING MOBILE BAR
            ========================================================================= */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 p-3 px-4 flex items-center justify-between z-40 shadow-xl">
          <div className="price-info">
            <span className="text-[12px] text-neutral-500 block">Giá từ:</span>
            <strong className="text-[18px] font-bold text-black">
              {formatVnd(effectivePriceStr)}
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#bus-booking"
              className="bg-[#FEBB02] hover:bg-[#E5A800] text-black font-bold text-[14px] px-6 py-2.5 rounded-[4px] uppercase active:scale-95 transition-transform"
            >
              {departures.length > 0 ? "Đặt Chỗ" : "Xem Tuyến"}
            </a>
            <a
              href={zaloGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center border border-neutral-200"
              aria-label="Chat Zalo hỗ trợ"
            >
              <Image src="/ref/i-zalo.svg" alt="Zalo" width={26} height={26} />
            </a>
          </div>
        </div>

        {/* =========================================================================
            8. LIGHTBOX MODAL
            ========================================================================= */}
        <TripLightbox
          isOpen={lightboxData.isOpen}
          images={lightboxData.images}
          currentIndex={lightboxData.currentIndex}
          onClose={closeLightbox}
          onIndexChange={setLightboxIndex}
        />
      </main>

      <Footer />
    </div>
  );
}
