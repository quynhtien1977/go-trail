"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import type { LightboxImage } from "./trip-lightbox";

export interface FeatureCard {
  id: number;
  title: string;
  desc: string;
  image: string;
}

interface TripHighlightsSectionProps {
  featureCards: FeatureCard[];
  onOpenLightbox: (images: LightboxImage[], startIndex: number) => void;
}

export function TripHighlightsSection({
  featureCards,
  onOpenLightbox,
}: TripHighlightsSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const updateScrollState = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    setCanScrollPrev(scrollLeft > 10);
    setCanScrollNext(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, featureCards]);

  const handleScroll = (direction: "left" | "right") => {
    if (!containerRef.current) return;
    const step = containerRef.current.clientWidth * 0.85;
    containerRef.current.scrollBy({
      left: direction === "left" ? -step : step,
      behavior: "smooth",
    });
  };

  if (featureCards.length === 0) return null;

  return (
    <section
      className="experience-section py-[70px] bg-[#FEF9D5] bg-contain bg-center bg-no-repeat overflow-hidden"
      style={{
        backgroundImage: "url('/ref/product-detail-feature-bg.svg')",
      }}
    >
      <div className="max-w-[1240px] mx-auto px-4 text-center">
        {/* Header section with Prev/Next buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 md:mb-10">
          <div className="hidden sm:block sm:w-20" />
          <h2 className="text-[22px] sm:text-[28px] md:text-[35px] font-bold text-black uppercase tracking-tight text-center">
            ĐIỂM NỔI BẬT CỦA HÀNH TRÌNH ({featureCards.length})
          </h2>
          {featureCards.length > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleScroll("left")}
                disabled={!canScrollPrev}
                className={`w-10 h-10 rounded-full border-2 border-black flex items-center justify-center transition-all ${
                  !canScrollPrev
                    ? "opacity-30 cursor-not-allowed"
                    : "hover:bg-black hover:text-white cursor-pointer active:scale-95 shadow-xs"
                }`}
                aria-label="Previous highlights"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handleScroll("right")}
                disabled={!canScrollNext}
                className={`w-10 h-10 rounded-full border-2 border-black flex items-center justify-center transition-all ${
                  !canScrollNext
                    ? "opacity-30 cursor-not-allowed"
                    : "hover:bg-black hover:text-white cursor-pointer active:scale-95 shadow-xs"
                }`}
                aria-label="Next highlights"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:block sm:w-20" />
          )}
        </div>

        {/* Khung trượt Card với Scroll Snap chuẩn Responsive */}
        <div
          ref={containerRef}
          className="flex gap-6 md:gap-8 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 pt-1 px-2 select-none"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {featureCards.map((card, idx) => (
            <div
              key={card.id}
              className="snap-start shrink-0 w-[280px] sm:w-[320px] md:w-[360px] flex flex-col items-center group cursor-pointer"
              onClick={() =>
                onOpenLightbox(
                  featureCards.map((c) => ({ src: c.image, caption: c.title })),
                  idx
                )
              }
            >
              {/* Card Image Frame */}
              <div className="relative w-full mb-6">
                <div className="absolute top-[8px] left-[8px] -right-[8px] -bottom-[8px] md:top-[10px] md:left-[10px] md:-right-[10px] md:-bottom-[10px] bg-[#FEBB02] rounded-[5px] -z-0 transition-transform duration-300 group-hover:translate-x-1 group-hover:translate-y-1" />
                <div className="relative z-10 w-full h-[220px] sm:h-[240px] md:h-[260px] rounded-[5px] overflow-hidden border-[4px] md:border-[5px] border-[#F5EDD8] shadow-md bg-neutral-900">
                  <Image
                    src={card.image}
                    alt={card.title}
                    fill
                    loading="lazy"
                    sizes="(max-width: 640px) 280px, (max-width: 1024px) 320px, 360px"
                    className={`object-cover transition-transform duration-500 group-hover:scale-105 ${
                      failedImages[card.image] ? "opacity-0" : "opacity-100"
                    }`}
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [card.image]: true }))
                    }
                  />
                  {failedImages[card.image] && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-800 text-neutral-300 p-4 text-center">
                      <ImageOff className="w-8 h-8 text-neutral-400 mb-2" />
                      <span className="text-xs">Không thể tải ảnh</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Content */}
              <div className="w-full text-center space-y-2 px-1">
                <h4 className="text-[17px] md:text-[20px] font-bold text-black uppercase tracking-normal leading-snug">
                  {card.title}
                </h4>
                {card.desc && (
                  <p className="text-[14px] md:text-[15px] text-[#212529] font-normal leading-[1.6] line-clamp-3">
                    {card.desc}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
