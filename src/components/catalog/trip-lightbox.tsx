"use client";

import Image from "next/image";
import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface LightboxImage {
  src: string;
  caption: string;
}

export interface LightboxProps {
  isOpen: boolean;
  images: LightboxImage[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange: (newIndex: number) => void;
}

export function TripLightbox({
  isOpen,
  images,
  currentIndex,
  onClose,
  onIndexChange,
}: LightboxProps) {
  const nextImage = useCallback(() => {
    if (images.length <= 1) return;
    onIndexChange((currentIndex + 1) % images.length);
  }, [currentIndex, images.length, onIndexChange]);

  const prevImage = useCallback(() => {
    if (images.length <= 1) return;
    onIndexChange((currentIndex - 1 + images.length) % images.length);
  }, [currentIndex, images.length, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, nextImage, prevImage]);

  if (!isOpen || images.length === 0) return null;

  const currentImg = images[currentIndex] || images[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md flex flex-col items-center justify-between p-4 md:p-8 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl flex items-center justify-between text-white pb-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[14px] font-semibold text-neutral-300">
          Ảnh {currentIndex + 1} / {images.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          aria-label="Đóng ảnh xem trước"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div
        className="relative max-w-5xl w-full flex-1 flex items-center justify-center p-2 min-h-[50vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length > 1 && (
          <button
            type="button"
            onClick={prevImage}
            className="absolute left-2 md:left-4 z-20 w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
            aria-label="Ảnh trước"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        <div className="relative max-h-[75vh] w-full h-[65vh] md:h-[75vh] overflow-hidden rounded-[8px] shadow-2xl flex items-center justify-center">
          <Image
            src={currentImg.src}
            alt={currentImg.caption || "Ảnh xem trước"}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1200px"
            className="object-contain rounded-[8px] animate-in zoom-in-95 duration-200"
          />
        </div>

        {images.length > 1 && (
          <button
            type="button"
            onClick={nextImage}
            className="absolute right-2 md:right-4 z-20 w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition-transform hover:scale-110"
            aria-label="Ảnh kế tiếp"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>

      <div
        className="w-full max-w-2xl text-center text-white pt-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[16px] font-medium text-neutral-200 m-0">
          {currentImg.caption}
        </p>
        <p className="text-[12px] text-neutral-400 mt-1 m-0">
          Nhấn phím mũi tên [← / →] để chuyển ảnh, phím [ESC] để đóng
        </p>
      </div>
    </div>
  );
}
