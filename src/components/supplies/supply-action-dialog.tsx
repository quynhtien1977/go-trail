"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function SupplyActionDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialogRef.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="supply-dialog-title"
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-lg overflow-y-auto rounded-[8px] border border-neutral-300 bg-white p-4 text-[#212529] shadow-xl backdrop:bg-black/60 sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 id="supply-dialog-title" className="text-xl font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng hộp thoại"
          className="flex size-11 shrink-0 items-center justify-center rounded-[5px] border border-[#6B7280] bg-white"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
