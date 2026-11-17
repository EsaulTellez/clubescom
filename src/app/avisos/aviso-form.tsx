"use client";

import { useActionState, useState, useTransition } from "react";
import { ImageUploadField } from "@/components/image-upload-field";
import { btn, btnGhost, input, label } from "@/lib/ui";
import { generateAvisoFromRawText, generateSocialCopy } from "./actions";
import { CATEGORIES, categoryLabel, type Category, type FormState } from "./shared";

type Initial = {
  id?: string;
  title: string;
  body: string;
  category: Category;
  featured: boolean;
  isPublic: boolean;
  publishAt: string;
  externalUrl?: string;
  socialCopy: string;
  socialTwitter?: string;
  socialFacebook?: string;
  imageUrl?: string | null;
};

export function AvisoForm({
  action,
  initial,
  submitLabel,
  stayOnPage = false,
  onSuccess,
  onCancel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: Initial;
  submitLabel: string;
  stayOnPage?: boolean;
  onSuccess?: (id?: string) => void;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const res = await action(prev, formData);
      if (res.ok && onSuccess) {
        onSuccess(res.id);
      }
      return res;
    },
    {},
  );
  const [rawSource, setRawSource] = useState("");
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [category, setCategory] = useState<Category>(initial.category);
  const [featured, setFeatured] = useState(initial.featured);
  const [externalUrl, setExternalUrl] = useState(initial.externalUrl ?? "");
  const [socialTwitter, setSocialTwitter] = useState(initial.socialTwitter ?? "");
  const [socialFacebook, setSocialFacebook] = useState(initial.socialFacebook ?? "");
  const [socialCopy, setSocialCopy] = useState(initial.socialCopy);
  const [aiError, setAiError] = useState("");
  const [aiNotice, setAiNotice] = useState("");
  const [copiedKey, setCopiedKey] = useState<"twitter" | "facebook" | null>(null);
  const [generating, startGenerating] = useTransition();

  function generateAllFromRaw() {
    setAiError("");
    setAiNotice("");
    startGenerating(async () => {
      const result = await generateAvisoFromRawText(rawSource);
      if (result.error) {
        setAiError(result.error);
        return;
      }
      if (result.title) setTitle(result.title);
      if (result.body) setBody(result.body);
      if (result.category) setCategory(result.category);
      if (result.externalUrl !== undefined) setExternalUrl(result.externalUrl);
      if (typeof result.featured === "boolean") setFeatured(result.featured);
      if (result.twitter) setSocialTwitter(result.twitter);
      if (result.facebook) setSocialFacebook(result.facebook);
      if (result.text) setSocialCopy(result.text);
      if (result.notice) setAiNotice(result.notice);
    });
  }

  function generateWithAi() {
    setAiError("");
    setAiNotice("");
    startGenerating(async () => {
      const result = await generateSocialCopy({ title, body, category });
      if (result.error) setAiError(result.error);
      if (result.notice) setAiNotice(result.notice);
      if (result.twitter) setSocialTwitter(result.twitter);
      if (result.facebook) setSocialFacebook(result.facebook);
      if (result.text) setSocialCopy(result.text);
    });
  }

  async function copySocial(kind: "twitter" | "facebook", value: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(kind);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard denial
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {stayOnPage && <input type="hidden" name="stay" value="1" />}
      {state.error && (
        <p className="rounded-lg bg-[#e6f3fa] px-3 py-2 text-sm text-[#8C1D18]" role="alert">
          {state.error}
        </p>
      )}

      {/* Herramienta de pegado directo para generar formato plataforma + redes con IA */}
      <div className="space-y-2.5 rounded-xl border border-[#b9d4e2] bg-[#f1f8fb] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className={label} htmlFor={`raw-source-${initial.id ?? "new"}`}>
            Pegar información recibida (WhatsApp, correo, oficio)
          </label>
          <button
            type="button"
            onClick={generateAllFromRaw}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#006699] px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-[#004d73] disabled:opacity-60"
          >
            {generating ? "Procesando con IA…" : "Generar para plataforma y redes"}
          </button>
        </div>
        <textarea
          id={`raw-source-${initial.id ?? "new"}`}
          value={rawSource}
          onChange={(e) => setRawSource(e.target.value)}
          rows={3}
          placeholder="Pega aquí el texto sin formato tal como te lo enviaron…"
          className={`${input} min-h-20 bg-white text-sm`}
        />
        {aiError && <p className="text-xs font-semibold text-[#8C1D18]" role="alert">{aiError}</p>}
        {aiNotice && <p className="text-xs font-semibold text-[#004d73]" role="status">{aiNotice}</p>}
      </div>

      <div>
        <label className={label} htmlFor={`title-${initial.id ?? "new"}`}>
          Título para plataforma
        </label>
        <input
          id={`title-${initial.id ?? "new"}`}
          name="title"
          className={input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={180}
        />
      </div>

      <div>
        <label className={label} htmlFor={`body-${initial.id ?? "new"}`}>
          Cuerpo del comunicado
        </label>
        <textarea
          id={`body-${initial.id ?? "new"}`}
          name="body"
          className={`${input} min-h-32`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          maxLength={8000}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`category-${initial.id ?? "new"}`}>
            Categoría
          </label>
          <select
            id={`category-${initial.id ?? "new"}`}
            name="category"
            className={input}
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`publish_at-${initial.id ?? "new"}`}>
            Publicar el
          </label>
          <input
            id={`publish_at-${initial.id ?? "new"}`}
            name="publish_at"
            type="datetime-local"
            className={input}
            defaultValue={initial.publishAt}
            required
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor={`external_url-${initial.id ?? "new"}`}>
          Enlace de interés / más información (opcional)
        </label>
        <input
          id={`external_url-${initial.id ?? "new"}`}
          name="external_url"
          type="url"
          className={input}
          value={externalUrl}
          onChange={(event) => setExternalUrl(event.target.value)}
          maxLength={500}
          placeholder="https://www.escom.ipn.mx/..."
        />
      </div>

      <ImageUploadField
        name="image"
        label="Cartel o imagen (opcional · JPG, PNG o WEBP · máx. 10 MB)"
        initialImageUrl={initial.imageUrl ?? null}
        compact={stayOnPage}
      />

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name="featured"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
          />
          Destacado
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="is_public" defaultChecked={initial.isPublic} />
          Visible también para visitantes sin sesión
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-[#d5e4ee] bg-[#f8fbfd] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={label}>Formatos listos para redes sociales</p>
          <button
            type="button"
            className={btnGhost}
            onClick={generateWithAi}
            disabled={generating}
          >
            {generating ? "Redactando…" : "Regenerar solo redes"}
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className={label} htmlFor={`social_twitter-${initial.id ?? "new"}`}>
              Twitter / X (máx. 280 caracteres)
            </label>
            {socialTwitter.trim() && (
              <button
                type="button"
                onClick={() => void copySocial("twitter", socialTwitter)}
                className="text-xs font-extrabold text-[#006699] hover:underline"
              >
                {copiedKey === "twitter" ? "Copiado ✓" : "Copiar"}
              </button>
            )}
          </div>
          <textarea
            id={`social_twitter-${initial.id ?? "new"}`}
            name="social_twitter"
            className={`${input} mt-1 min-h-20`}
            value={socialTwitter}
            onChange={(event) => setSocialTwitter(event.target.value)}
            maxLength={280}
            placeholder="Resumen conciso de hasta 280 caracteres"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className={label} htmlFor={`social_facebook-${initial.id ?? "new"}`}>
              Facebook / Comunidad
            </label>
            {socialFacebook.trim() && (
              <button
                type="button"
                onClick={() => void copySocial("facebook", socialFacebook)}
                className="text-xs font-extrabold text-[#006699] hover:underline"
              >
                {copiedKey === "facebook" ? "Copiado ✓" : "Copiar"}
              </button>
            )}
          </div>
          <textarea
            id={`social_facebook-${initial.id ?? "new"}`}
            name="social_facebook"
            className={`${input} mt-1 min-h-24`}
            value={socialFacebook}
            onChange={(event) => setSocialFacebook(event.target.value)}
            maxLength={800}
            placeholder="Versión completa con contexto institucional para Facebook"
          />
        </div>

        <input type="hidden" name="social_copy" value={socialCopy} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className={btnGhost}>
            Cancelar
          </button>
        )}
        <button className={btn} disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
