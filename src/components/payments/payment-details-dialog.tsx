"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function PaymentDetailsDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={dialog} aria-labelledby="payment-detail-title" onClose={() => { if (!dialog.current?.open) onClose(); }}
    className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-lg overflow-y-auto rounded-[8px] border border-neutral-300 bg-white p-4 text-[#212529] shadow-xl backdrop:bg-black/60 sm:p-6">
    <div className="mb-5 flex items-start justify-between gap-3"><h2 id="payment-detail-title" className="text-xl font-bold">{title}</h2><button type="button" onClick={onClose} aria-label="Đóng chi tiết" className="flex size-11 shrink-0 items-center justify-center rounded-[5px] border border-[#6B7280]"><X aria-hidden="true" className="size-5" /></button></div>
    {children}
  </dialog>;
}
