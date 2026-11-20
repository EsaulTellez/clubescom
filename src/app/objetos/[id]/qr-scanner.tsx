"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { btn, btnGhost, input, label } from "@/lib/ui";

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement | HTMLImageElement | ImageBitmap) => Promise<{ rawValue?: string }[]>;
};

function extractDeliveryCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^[A-Z0-9]{12}$/i.test(trimmed)) return trimmed.toUpperCase();
  try {
    const url = new URL(trimmed);
    const param = url.searchParams.get("code") ?? url.searchParams.get("token");
    if (param && /^[A-Z0-9]{12}$/i.test(param.trim())) return param.trim().toUpperCase();
  } catch {
    // not a URL
  }
  const embedded = trimmed.match(/(?:code=|token=)?([A-HJ-NP-Z2-9]{12})/i);
  return embedded ? embedded[1].toUpperCase() : null;
}

export function QrDeliveryVerifyForm({
  itemId,
  handoffId,
  initialCode = "",
  action,
}: {
  itemId: string;
  handoffId: string;
  initialCode?: string;
  action: (form: FormData) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanSuccess, setScanSuccess] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopCameraScan = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!scanning || !streamRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {});

    const DetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike;
      }
    ).BarcodeDetector;
    const detector = DetectorCtor ? new DetectorCtor({ formats: ["qr_code"] }) : null;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    let lastTick = 0;
    const tick = async (now: number) => {
      if (cancelled || !streamRef.current || !videoRef.current) return;
      if (now - lastTick >= 180 && video.readyState >= 2 && video.videoWidth > 0) {
        lastTick = now;
        try {
          if (detector) {
            const results = await detector.detect(video);
            for (const item of results) {
              const found = item.rawValue ? extractDeliveryCode(item.rawValue) : null;
              if (found) {
                setCode(found);
                setScanSuccess(`Código ${found} detectado con éxito.`);
                stopCameraScan();
                return;
              }
            }
          } else if (canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const qr = jsQR(imgData.data, canvas.width, canvas.height, {
                inversionAttempts: "dontInvert",
              });
              const found = qr?.data ? extractDeliveryCode(qr.data) : null;
              if (found) {
                setCode(found);
                setScanSuccess(`Código ${found} detectado con éxito.`);
                stopCameraScan();
                return;
              }
            }
          }
        } catch {
          // continue scanning next frame
        }
      }
      if (!cancelled) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [scanning, stopCameraScan]);

  async function startCameraScan() {
    setScanError("");
    setScanSuccess("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("Este navegador no permite abrir la cámara aquí. Sube una foto del QR o escribe los 12 caracteres.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setScanning(true);
    } catch {
      setScanError("No se pudo abrir la cámara. Verifica permisos o sube una captura del QR.");
    }
  }

  async function onQrImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setScanError("");
    setScanSuccess("");
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setScanError("No se pudo procesar la imagen.");
        return;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: "attemptBoth",
      });
      const found = qr?.data ? extractDeliveryCode(qr.data) : null;
      if (!found) {
        setScanError("No detectamos un código QR válido en la imagen. Escribe los 12 caracteres manualmente.");
        return;
      }
      setCode(found);
      setScanSuccess(`Código ${found} leído desde la imagen.`);
    } catch {
      setScanError("No pudimos leer esa imagen. Usa JPG o PNG o escribe los 12 caracteres.");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-dashed border-[#dcd9ce] pt-3">
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="handoff_id" value={handoffId} />
      <div className="flex flex-wrap gap-2">
        {!scanning ? (
          <button type="button" onClick={startCameraScan} className={btnGhost}>
            📷 Escanear QR con cámara
          </button>
        ) : (
          <button type="button" onClick={stopCameraScan} className={btnGhost}>
            Detener cámara
          </button>
        )}
        <label className={`${btnGhost} cursor-pointer`}>
          🖼 Leer QR desde foto / captura
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onQrImageFile}
            className="sr-only"
          />
        </label>
      </div>
      {scanning && (
        <div className="overflow-hidden rounded-xl border border-[#b7d4e4] bg-black">
          <video ref={videoRef} className="h-48 w-full object-cover" muted playsInline />
        </div>
      )}
      {scanSuccess && <p className="text-xs font-semibold text-[#17634a]" role="status">{scanSuccess}</p>}
      {scanError && <p className="text-xs text-[#8C1D18]" role="alert">{scanError}</p>}
      <label className={label}>
        Código temporal del receptor (12 caracteres)
        <input
          className={`${input} mt-1 font-mono uppercase tracking-widest`}
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          minLength={12}
          maxLength={12}
          required
          autoComplete="off"
        />
      </label>
      <button className={`${btn} w-full`}>Confirmar entrega</button>
    </form>
  );
}
