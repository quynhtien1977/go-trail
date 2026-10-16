"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { TripDto } from "@/schemas/catalog";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import type { LightboxImage } from "./trip-lightbox";

interface TripHeroSectionProps {
  trip: TripDto;
  heroImages: LightboxImage[];
  onOpenLightbox: (images: LightboxImage[], startIndex: number) => void;
}

export function TripHeroSection({
  trip,
  heroImages,
  onOpenLightbox,
}: TripHeroSectionProps) {
  const [heroIndex, setHeroIndex] = useState(0);

  // Tự động chuyển slide hero sau 6 giây
  useEffect(() => {
    if (heroImages.length <= 1) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [heroImages.length]);

  return (
    <section className="product-detail-top pt-6 md:pt-[35px] pb-[40px] max-w-[1240px] mx-auto px-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Cột trái: Hero Carousel 1:1 gotrail.vn (w: 595px, h: 460px) */}
        <div className="md:col-span-6">
          <div className="relative rounded-[16px] overflow-hidden w-full h-[320px] sm:h-[400px] md:h-[460px] bg-neutral-900 group shadow-lg">
            {heroImages.map((img, idx) => (
              <div
                key={idx}
                className={`absolute inset-0 transition-opacity duration-700 ease-in-out cursor-pointer ${
                  idx === heroIndex
                    ? "opacity-100 z-10"
                    : "opacity-0 z-0 pointer-events-none"
                }`}
                onClick={() => onOpenLightbox(heroImages, idx)}
              >
                <div className="relative w-full h-full">
                  <Image
                    src={img.src}
                    alt={img.caption}
                    fill
                    priority={idx === 0}
                    loading={idx === 0 ? undefined : "lazy"}
                    sizes="(max-width: 768px) 100vw, 595px"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <Maximize2 className="w-4 h-4" />
                </div>
              </div>
            ))}

            {/* Nút lùi/tiến ảnh */}
            {heroImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeroIndex(
                      (prev) => (prev - 1 + heroImages.length) % heroImages.length
                    );
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeroIndex((prev) => (prev + 1) % heroImages.length);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* Dải Dots */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                  {heroImages.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeroIndex(idx);
                      }}
                      className={`transition-all duration-300 rounded-full cursor-pointer ${
                        idx === heroIndex
                          ? "w-2.5 h-2.5 bg-white scale-125 shadow-xs"
                          : "w-2 h-2 bg-white/60 hover:bg-white"
                      }`}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Cột phải: Nội dung chi tiết (.trail-content) */}
        <div className="md:col-span-6 md:pl-8 space-y-5">
          <h2 className="text-[24px] sm:text-[30px] md:text-[35px] font-bold text-black uppercase leading-tight mb-5 break-words">
            TRAIL BUS -{" "}
            {trip.name?.replace(/Trekking |Hiking & Cycling /gi, "").toUpperCase() ||
              "GO TRAIL"}
          </h2>

          {/* Thông tin tóm tắt 4 ô (.trail-info & .trail-detail) */}
          <div className="grid grid-cols-2 gap-4 py-1">
            {/* 1. Điểm đến / Khu vực */}
            <div className="flex items-center gap-3">
              <Image
                src="/ref/i-marker.svg"
                alt="Icon Địa danh"
                width={41}
                height={41}
                className="shrink-0"
              />
              <p className="text-[15px] text-neutral-800 leading-snug m-0">
                <strong>Khu vực</strong>
                <br />
                {trip.city
                  ? `${trip.district ? trip.district + ", " : ""}${trip.city}`
                  : "Đang cập nhật"}
              </p>
            </div>

            {/* 2. Độ dài quãng đường */}
            <div className="flex items-center gap-3">
              <Image
                src="/ref/i-do-dai.svg"
                alt="Icon Độ dài quãng đường"
                width={41}
                height={41}
                className="shrink-0"
              />
              <p className="text-[15px] text-neutral-800 leading-snug m-0">
                <strong>Độ dài quãng đường</strong>
                <br />
                {trip.length_km ? `~${trip.length_km}km` : "Đang cập nhật"}
              </p>
            </div>

            {/* 3. Độ cao đỉnh */}
            <div className="flex items-center gap-3">
              <Image
                src="/ref/i-do-cao-dinh.svg"
                alt="Icon Độ cao đỉnh"
                width={41}
                height={41}
                className="shrink-0"
              />
              <p className="text-[15px] text-neutral-800 leading-snug m-0">
                <strong>Độ cao đỉnh</strong>
                <br />
                {trip.peak_height_m != null && trip.peak_height_m > 0
                  ? `${trip.peak_height_m}m`
                  : trip.peak_height_m === 0
                  ? "0m"
                  : "Đang cập nhật"}
              </p>
            </div>

            {/* 4. Cấp độ khó */}
            <div className="flex items-center gap-3">
              <Image
                src="/ref/i-do-kho.svg"
                alt="Icon Độ khó"
                width={41}
                height={41}
                className="shrink-0"
              />
              <div className="text-[15px] text-neutral-800 leading-snug">
                <strong>Độ khó</strong>
                <div className="pt-0.5">
                  {trip.difficulty_level ? (
                    <span className="inline-block px-2.5 py-0.5 bg-neutral-100 text-neutral-800 font-bold rounded text-[13px]">
                      Cấp độ {trip.difficulty_level}
                    </span>
                  ) : (
                    <span className="text-neutral-500 text-[13px] italic">
                      Đang cập nhật
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mô tả chi tiết (Plain text an toàn, không raw HTML) */}
          <p className="text-[16px] md:text-[18px] leading-[1.7] text-[#212529] pt-2 whitespace-pre-line">
            {trip.description ||
              "Chưa có thông tin mô tả chi tiết cho cung đường này."}
          </p>
        </div>
      </div>
    </section>
  );
}
