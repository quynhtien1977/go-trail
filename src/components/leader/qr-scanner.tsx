"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Camera, CameraOff, Flashlight, FlashlightOff, Loader2, Pause, Play, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonGreen, buttonOutline } from "./leader-ui-parts";

// Native detector where the browser has one (Chrome/Android); jsQR (lazy-loaded) everywhere else, e.g. iOS Safari.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};
type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

export type CameraPhase = "requesting" | "scanning" | "paused" | "denied" | "unavailable" | "insecure";

const SCAN_INTERVAL_MS = 200;
const MAX_DECODE_EDGE = 640;

async function createDecoder(): Promise<Decoder> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch { /* fall through to jsQR */ }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!context || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
  };
}

function cameraFailure(error: unknown): CameraPhase {
  const name = error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable";
}

export function QrScanner({ onDetected, disabled }: { onDetected: (text: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<CameraPhase>("requesting");
  const [wanted, setWanted] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [visible, setVisible] = useState(true);

  const emit = useEffectEvent((text: string) => { if (!disabled) onDetected(text); });

  // Release the camera while the tab is hidden (battery, privacy) and resume on return.
  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!wanted || !visible) return;
    const videoElement = videoRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setPhase(window.isSecureContext ? "unavailable" : "insecure");
        return;
      }
      setPhase("requesting");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (error) {
        if (!cancelled) setPhase(cameraFailure(error));
        return;
      }
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const video = videoElement;
      if (!video) return;
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay with muted+playsInline normally succeeds */ }

      const [track] = stream.getVideoTracks();
      const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch({ supported: Boolean(capabilities.torch), on: false });

      const decode = await createDecoder();
      if (cancelled) return;
      setPhase("scanning");
      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const text = await decode(video);
            if (text && !cancelled) emit(text);
          }
        } catch { /* a dropped frame is not an error */ }
        if (!cancelled) timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      void tick();
    }

    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoElement) videoElement.srcObject = null;
    };
  }, [wanted, visible, attempt]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on: next });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }

  const shownPhase: CameraPhase = wanted ? phase : "paused";
  const live = shownPhase === "scanning" || shownPhase === "requesting";

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-[5px] bg-black md:aspect-[4/3] md:max-w-none">
        <video ref={videoRef} muted playsInline autoPlay aria-label="Hình ảnh camera"
          className={cn("absolute inset-0 size-full object-cover", !live && "invisible")} />
        {shownPhase === "scanning" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative size-[62%] max-h-64 max-w-64">
              <span className="absolute left-0 top-0 size-7 border-l-4 border-t-4 border-white" />
              <span className="absolute right-0 top-0 size-7 border-r-4 border-t-4 border-white" />
              <span className="absolute bottom-0 left-0 size-7 border-b-4 border-l-4 border-white" />
              <span className="absolute bottom-0 right-0 size-7 border-b-4 border-r-4 border-white" />
            </div>
          </div>
        )}
        {shownPhase !== "scanning" && (
          <CameraOverlay phase={shownPhase}
            onRetry={() => { setWanted(true); setAttempt((value) => value + 1); }} />
        )}
      </div>

      <p className="text-center text-sm text-[#5C636A]" aria-live="polite">
        {shownPhase === "scanning" ? "Đưa mã QR trên vé của khách vào khung." : " "}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {torch.supported && shownPhase === "scanning" ? (
          <button type="button" onClick={toggleTorch} aria-pressed={torch.on} className={buttonOutline}>
            {torch.on ? <FlashlightOff aria-hidden="true" className="size-4" /> : <Flashlight aria-hidden="true" className="size-4" />}
            {torch.on ? "Tắt đèn" : "Bật đèn"}
          </button>
        ) : <span />}
        <button type="button" onClick={() => setWanted((value) => !value)}
          disabled={shownPhase === "denied" || shownPhase === "unavailable" || shownPhase === "insecure"} className={buttonOutline}>
          {wanted ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
          {wanted ? "Tạm dừng" : "Tiếp tục quét"}
        </button>
      </div>
    </div>
  );
}

function CameraOverlay({ phase, onRetry }: { phase: CameraPhase; onRetry: () => void }) {
  const content: Record<Exclude<CameraPhase, "scanning">, { icon: React.ReactNode; title: string; detail: string; retry?: string }> = {
    requesting: { icon: <Loader2 aria-hidden="true" className="size-10 animate-spin" />, title: "Đang mở camera…",
      detail: "Nếu trình duyệt hỏi, hãy chọn “Cho phép” để quét mã." },
    paused: { icon: <Camera aria-hidden="true" className="size-10" />, title: "Đã tạm dừng quét", detail: "Bấm “Tiếp tục quét” để mở lại camera." },
    denied: { icon: <CameraOff aria-hidden="true" className="size-10" />, title: "Camera đang bị chặn",
      detail: "Mở cài đặt trang web của trình duyệt, cho phép dùng camera rồi bấm thử lại. Bạn vẫn có thể nhập mã vé bên dưới.",
      retry: "Thử lại" },
    unavailable: { icon: <VideoOff aria-hidden="true" className="size-10" />, title: "Không dùng được camera",
      detail: "Không tìm thấy camera hoặc camera đang được ứng dụng khác dùng. Hãy nhập mã vé bên dưới.", retry: "Thử lại" },
    insecure: { icon: <VideoOff aria-hidden="true" className="size-10" />, title: "Không mở được camera trên kết nối này",
      detail: "Trình duyệt chỉ cho dùng camera trên trang bảo mật (https). Hãy nhập mã vé bên dưới." },
  };
  const item = content[phase as Exclude<CameraPhase, "scanning">];
  return (
    <div role={phase === "denied" || phase === "unavailable" ? "alert" : "status"}
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center text-white">
      <div className="text-neutral-300">{item.icon}</div>
      <p className="text-base font-bold">{item.title}</p>
      <p className="max-w-xs text-sm text-neutral-300">{item.detail}</p>
      {item.retry && <button type="button" onClick={onRetry} className={cn(buttonGreen, "mt-2")}>{item.retry}</button>}
    </div>
  );
}
