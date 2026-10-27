"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, RefreshCw, MapPin, AlertCircle } from "lucide-react";
import type { TripSummaryDto } from "@/schemas/catalog";
import { fetchPublicTrips, getTripMedia, formatVnd, FALLBACK_TRIP_IMAGE } from "@/lib/catalog-client";

interface TrailbusCarouselProps {
  initialCity?: string | null;
  onCitySelect?: (city: string | null) => void;
}

export function TrailbusCarousel({ initialCity = null, onCitySelect }: TrailbusCarouselProps) {
  const [trips, setTrips] = useState<TripSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity);

  const carouselRef = useRef<HTMLDivElement>(null);

  // Sync with prop when prop changes
  useEffect(() => {
    if (initialCity !== undefined) {
      const timer = setTimeout(() => {
        setSelectedCity(initialCity);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialCity]);

  // Load trips from public API
  const loadTrips = (cityFilter = selectedCity, queryFilter = searchQuery) => {
    setLoading(true);
    setError(null);

    fetchPublicTrips({
      city: cityFilter || undefined,
      q: queryFilter || undefined,
      pageSize: 50,
    })
      .then((data) => {
        setTrips(data.items);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Không thể tải danh sách chuyến xe");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTrips(selectedCity, searchQuery);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadTrips(selectedCity, searchQuery);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedCity(null);
    if (onCitySelect) onCitySelect(null);
    loadTrips(null, "");
  };

  const handleCityFilter = (city: string | null) => {
    setSelectedCity(city);
    if (onCitySelect) onCitySelect(city);
  };

  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = 400;
      carouselRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // Extract unique cities from loaded trips for quick filters
  const availableCities = Array.from(new Set(trips.map((t) => t.city))).filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Search and Quick Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-black/10 shadow-sm">
        {/* Search input */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên cung đường, địa danh..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FEBB02] focus:border-transparent bg-white text-neutral-900"
          />
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 rounded-lg bg-[#FEBB02] hover:bg-[#e5a800] text-black text-xs font-bold transition-colors"
          >
            Tìm
          </button>
        </form>

        {/* City Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => handleCityFilter(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
              selectedCity === null
                ? "bg-black text-white shadow-sm"
                : "bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200"
            }`}
          >
            Tất cả
          </button>

          {(availableCities.length > 0
            ? availableCities
            : ["Tây Ninh", "Đồng Nai", "Bình Phước", "Lâm Đồng", "Thái Nguyên", "Hà Nội"]
          ).map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => handleCityFilter(city === selectedCity ? null : city)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                selectedCity === city
                  ? "bg-[#186734] text-white shadow-sm"
                  : "bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200"
              }`}
            >
              {city}
            </button>
          ))}

          {(searchQuery || selectedCity) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 text-xs text-red-600 hover:underline font-semibold shrink-0"
            >
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* Header: Title and Navigation Arrows */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl lg:text-[35px] font-extrabold text-black uppercase tracking-tight">
            HỆ THỐNG TRAIL BUS CHO BẠN
          </h2>
          <p className="text-sm text-neutral-800 font-medium mt-1">
            {loading
              ? "Đang tải danh sách tuyến..."
              : `Hiển thị ${trips.length} tuyến trekking khởi hành cuối tuần`}
          </p>
        </div>

        {/* Carousel Navigation Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => scrollCarousel("left")}
            aria-label="Previous Slide"
            className="w-[50px] h-[50px] rounded-full border-[3px] border-black bg-transparent flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6 stroke-[3]" />
          </button>
          <button
            type="button"
            onClick={() => scrollCarousel("right")}
            aria-label="Next Slide"
            className="w-[50px] h-[50px] rounded-full border-[3px] border-black bg-transparent flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <ChevronRight className="w-6 h-6 stroke-[3]" />
          </button>
        </div>
      </div>

      {/* Carousel Body */}
      {loading ? (
        /* Loading Skeleton */
        <div className="flex gap-[30px] overflow-x-hidden pb-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-[370px] min-h-[730px] shrink-0 bg-white/70 rounded-[5px] p-[30px] animate-pulse flex flex-col justify-between shadow-sm"
            >
              <div className="h-[245px] bg-neutral-200 rounded-[5px] mb-6" />
              <div className="space-y-4 flex-1">
                <div className="h-7 bg-neutral-200 rounded w-3/4" />
                <div className="h-4 bg-neutral-200 rounded w-1/2" />
                <div className="space-y-2 pt-6">
                  <div className="h-4 bg-neutral-200 rounded w-full" />
                  <div className="h-4 bg-neutral-200 rounded w-full" />
                  <div className="h-4 bg-neutral-200 rounded w-3/4" />
                </div>
              </div>
              <div className="h-10 bg-neutral-200 rounded-full mt-6" />
            </div>
          ))}
        </div>
      ) : error ? (
        /* Error State */
        <div className="p-8 rounded-2xl bg-white/90 border border-red-200 text-center space-y-4 max-w-lg mx-auto shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-neutral-900">Không thể tải dữ liệu tuyến</h3>
            <p className="text-sm text-neutral-600">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => loadTrips()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black text-white hover:bg-neutral-800 text-sm font-bold transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        </div>
      ) : trips.length === 0 ? (
        /* Empty State */
        <div className="p-12 rounded-2xl bg-white/90 border border-neutral-200 text-center space-y-4 max-w-lg mx-auto shadow-sm">
          <div className="w-16 h-16 rounded-full bg-[#FEBB02]/20 text-neutral-800 flex items-center justify-center mx-auto font-black text-2xl">
            🧭
          </div>
          <div className="space-y-1.5">
            <h3 className="text-xl font-bold text-neutral-900">Chưa tìm thấy tuyến phù hợp</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Không có chuyến xe bus trekking nào khớp với tiêu chí tìm kiếm hoặc bộ lọc hiện tại của bạn.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-5 py-2.5 rounded-full bg-[#FEBB02] hover:bg-[#e5a800] text-black text-sm font-extrabold shadow-sm transition-all"
          >
            Xem tất cả các tuyến
          </button>
        </div>
      ) : (
        /* Live Tour Cards Horizontal Carousel */
        <div
          ref={carouselRef}
          className="flex gap-[30px] overflow-x-auto scroll-smooth pb-6 select-none"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {trips.map((trip) => {
            const media = getTripMedia(trip);
            return (
              <div
                key={trip.trip_id}
                className="tour-card carousel-cell w-[370px] min-h-[730px] shrink-0 bg-white rounded-[5px] overflow-hidden shadow-[0px_4px_8px_rgba(0,0,0,0.1)] hover:shadow-[0px_6px_12px_rgba(0,0,0,0.2)] hover:-translate-y-1 transition-all duration-300 flex flex-col group"
              >
                {/* Tour Image */}
                <div className="relative h-[245px] w-full overflow-hidden bg-neutral-200">
                  <img
                    src={trip.cover_image_url ?? FALLBACK_TRIP_IMAGE}
                    alt={trip.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-bold">
                    <MapPin className="w-3 h-3 text-[#FEBB02]" />
                    <span>
                      {trip.location_name}, {trip.city}
                    </span>
                  </div>
                </div>

                {/* Tour Content */}
                <div className="p-[30px] flex-1 flex flex-col justify-between">
                  <div>
                    {/* Tour Title */}
                    <h3 className="text-[25px] font-bold text-black uppercase min-h-[60px] leading-tight mb-2.5">
                      {trip.name}
                    </h3>

                    {/* Tour Tags */}
                    {media.tags && media.tags.length > 0 && (
                      <div className="flex flex-wrap gap-[7px] mb-5">
                        {media.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-[7px] px-2.5 py-1 rounded-[5px] bg-[#E6EAF0] text-black text-[14px] font-bold"
                          >
                            <img src="/ref/i-check.svg" alt="check" className="w-4 h-4" />
                            <span>{tag}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Tour Info */}
                    <div className="space-y-2 text-[15px] font-medium text-black pb-5 border-b border-[#ccc]">
                      <p className="flex items-center gap-2">
                        <img src="/ref/i-clock.svg" alt="clock" className="w-[18px] h-[17px]" />
                        <span>
                          <strong>Thời Gian: </strong>
                          Trong ngày (Khứ hồi)
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <img src="/ref/i-car.svg" alt="distance" className="w-[21px] h-[15px]" />
                        <span>
                          <strong>Độ Dài: </strong>
                          {parseFloat(trip.length_km)} km
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <img src="/ref/i-do-kho.svg" alt="difficulty" className="w-[21px] h-[14px]" />
                        <span className="flex items-center gap-2">
                          <strong>Độ khó: </strong>
                          <span>
                            {trip.difficulty_level ? `Cấp độ ${trip.difficulty_level}` : "Đang cập nhật"}
                          </span>
                          {trip.difficulty_level && media.difficultyIcon && (
                            <img
                              src={media.difficultyIcon}
                              alt="dokho"
                              className="h-[14px] w-auto inline-block"
                            />
                          )}
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <img src="/ref/i-do-cao-dinh.svg" alt="elevation" className="w-[21px] h-[20px]" />
                        <span>
                          <strong>Độ cao đỉnh: </strong>
                          {trip.peak_height_m != null && trip.peak_height_m > 0
                            ? `${trip.peak_height_m.toLocaleString("vi-VN")}m`
                            : trip.peak_height_m === 0
                            ? "0m"
                            : "Đang cập nhật"}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Price and Detail Action */}
                  <div className="pt-4 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[16px] font-bold text-black">Giá vé:</span>
                        <span className="text-[24px] font-bold text-black">
                          {formatVnd(trip.base_price)}
                        </span>
                      </div>

                      <Link
                        href={`/trips/${trip.trip_id}`}
                        className="px-4 py-2.5 rounded-full bg-[#FEBB02] hover:bg-[#E5A800] text-black font-extrabold text-xs uppercase tracking-wider transition-transform hover:scale-105 inline-flex items-center gap-1 shadow-sm"
                      >
                        Chi tiết →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
