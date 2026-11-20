import { uploadPublicImage } from "@/lib/storage";

export async function resolveUploadedPublicImage(
  form: FormData,
  field: string,
  userId: string,
  folder = "general",
): Promise<{ url: string | null } | { error: string }> {
  const preuploaded = String(form.get(`${field}_uploaded`) ?? "").trim();
  if (preuploaded) {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    if (!baseUrl) {
      return { error: "Falta configurar el servidor de archivos." };
    }
    const allowedPrefix = `${baseUrl}/storage/v1/object/public/public-media/${userId}/`;
    if (!preuploaded.startsWith(allowedPrefix)) {
      return { error: "La ruta de la imagen no es válida." };
    }
    return { url: preuploaded };
  }
  return uploadPublicImage(userId, folder, form.get(field));
}

export function resolvePreuploadedPrivatePath(
  form: FormData,
  field: string,
  expectedPrefix: string,
): string | null {
  const preuploaded = String(form.get(`${field}_uploaded_path`) ?? "").trim();
  if (!preuploaded) return null;
  if (!preuploaded.startsWith(expectedPrefix) || preuploaded.includes("..")) {
    return null;
  }
  return preuploaded;
}
