"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type SignedUploadBucket = "public-media" | "club-documents" | "lost-evidence" | "guide-source";

export async function uploadFileDirectly(
  file: File,
  options: {
    bucket: SignedUploadBucket;
    contextId?: string;
    area?: string;
  },
): Promise<{ path: string; publicUrl: string | null }> {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket: options.bucket,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      fileName: file.name,
      contextId: options.contextId,
      area: options.area,
    }),
  });

  const signJson = (await signRes.json().catch(() => ({}))) as {
    path?: string;
    token?: string;
    publicUrl?: string | null;
    error?: string;
  };

  if (!signRes.ok || !signJson.path || !signJson.token) {
    throw new Error(signJson.error || "No se pudo autorizar la subida directa del archivo.");
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(options.bucket)
    .uploadToSignedUrl(signJson.path, signJson.token, file, {
      contentType: file.type || undefined,
    });

  if (error) {
    throw new Error("No se pudo guardar el archivo en Storage. Revisa tu conexión e inténtalo de nuevo.");
  }

  return {
    path: signJson.path,
    publicUrl: signJson.publicUrl ?? null,
  };
}
