import { randomBytes } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function uploadPublicImage(
  userId: string,
  folder: string,
  fileEntry: FormDataEntryValue | null,
): Promise<{ url: string | null } | { error: string }> {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return { url: null };
  }
  if (!IMAGE_TYPES.has(fileEntry.type)) {
    return { error: "La imagen debe ser JPG, PNG o WEBP." };
  }
  if (fileEntry.size > MAX_IMAGE_BYTES) {
    return { error: "La imagen debe pesar menos de 10 MB." };
  }

  const ext =
    fileEntry.type === "image/jpeg"
      ? "jpg"
      : fileEntry.type === "image/png"
        ? "png"
        : "webp";
  const path = `${userId}/${folder}/${randomBytes(12).toString("hex")}.${ext}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from("public-media").upload(path, fileEntry, {
    contentType: fileEntry.type,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    return { error: "No se pudo subir la imagen a Supabase Storage." };
  }

  const { data } = supabase.storage.from("public-media").getPublicUrl(path);
  return { url: data.publicUrl };
}
