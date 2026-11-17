"use client";

import { useEffect, useRef, useState } from "react";
import { btn, btnGhost, input, label } from "@/lib/ui";

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement | HTMLImageElement | ImageBitmap) => Promise<{ rawValue?: string }[]>;
};

export function QrDeliveryVerifyForm({
  itemId,
  handoffId,
  action,
}: {
  itemId: string;
  handoffId: string;
  action: (form: FormData) => void;
}) {
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
    };
  }, []);

  async function startCameraScan() {
    setScanError("");
    const DetectorCtor = (window as unknown as { BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    if (!DetectorCtor) {
      setScanError("Este navegador no incluye lector QR nativo en vivo; sube una captura del QR o escribe los 12 caracteres.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new DetectorCtor({ formats: ["qr_code"] });
      const loop = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          const found = results[0]?.rawValue?.trim().toUpperCase();
          if (found && found.length === 12) {
            setCode(found);
            stopCameraScan();
            return;
          }
        } catch {
          // continue polling frames
        }
        if (streamRef.current) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch {
      setScanError("No se pudo abrir la cámara. Verifica permisos o ingresa el código de 12 caracteres.");
    }
  }

  function stopCameraScan() {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    setScanning(false);
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
      </div>
      {scanning && (
        <div className="overflow-hidden rounded-xl border border-[#b7d4e4] bg-black">
          <video ref={videoRef} className="h-48 w-full object-cover" muted playsInline />
        </div>
      )}
      {scanError && <p className="text-xs text-[#667085]">{scanError}</p>}
      <label className={label}>
        Código temporal del receptor (o resultado del QR)
        <input
          className={`${input} mt-1 uppercase tracking-widest`}
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
