"use client";

import { useActionState, useState, useTransition } from "react";
import { Spinner, SubmitButton } from "@/components/loading-ui";
import { ImageUploadField } from "@/components/image-upload-field";
import { btn, btnGhost, input, label } from "@/lib/ui";
import { generateAvisoFromRawText, generateSocialCopy } from "./actions";
import {
  CATEGORIES,
  categoryLabel,
  SOURCE_AREAS,
  sourceAreaLabel,
  type Category,
  type FormState,
  type SourceArea,
} from "./shared";

type Initial = {
  id?: string;
  title: string;
  body: string;
  category: Category;
  sourceArea?: SourceArea;
  featured: boolean;
  isPublic: boolean;
  publishAt: string;
  validUntil?: string | null;
  externalUrl?: string;
  socialCopy: string;
  socialTwitter?: string;
  socialFacebook?: string;
  socialInstagram?: string;
  imageUrl?: string | null;
};

type SocialChannel = "twitter" | "facebook" | "instagram";

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
  const [showAiPanel, setShowAiPanel] = useState(!initial.id);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [category, setCategory] = useState<Category>(initial.category);
  const [sourceArea, setSourceArea] = useState<SourceArea>(initial.sourceArea ?? "general");
  const [featured, setFeatured] = useState(initial.featured);
  const [externalUrl, setExternalUrl] = useState(initial.externalUrl ?? "");
  const [socialTwitter, setSocialTwitter] = useState(initial.socialTwitter ?? "");
  const [socialFacebook, setSocialFacebook] = useState(initial.socialFacebook || initial.socialCopy || "");
  const [socialInstagram, setSocialInstagram] = useState(initial.socialInstagram ?? "");
  const [socialCopy, setSocialCopy] = useState(initial.socialCopy);
  const [socialTab, setSocialTab] = useState<SocialChannel>("twitter");
  const [aiError, setAiError] = useState("");
  const [aiNotice, setAiNotice] = useState("");
  const [copiedKey, setCopiedKey] = useState<SocialChannel | null>(null);
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
      if (result.sourceArea) setSourceArea(result.sourceArea);
      if (result.externalUrl) setExternalUrl(result.externalUrl);
      if (typeof result.featured === "boolean") setFeatured(result.featured);
      if (result.twitter) setSocialTwitter(result.twitter);
      if (result.facebook) setSocialFacebook(result.facebook);
      if (result.instagram) setSocialInstagram(result.instagram);
      if (result.text) setSocialCopy(result.text);
      if (result.notice) setAiNotice(result.notice);
    });
  }

  function generateWithAi() {
    setAiError("");
    setAiNotice("");
    startGenerating(async () => {
      const result = await generateSocialCopy({
        title,
        body,
        category,
        sourceArea,
        externalUrl,
      });
      if (result.error) setAiError(result.error);
      if (result.notice) setAiNotice(result.notice);
      if (result.twitter) setSocialTwitter(result.twitter);
      if (result.facebook) setSocialFacebook(result.facebook);
      if (result.instagram) setSocialInstagram(result.instagram);
      if (result.text) setSocialCopy(result.text);
    });
  }

  async function copySocial(kind: SocialChannel, value: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(kind);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard denial
    }
  }

  const activeSocialValue =
    socialTab === "twitter" ? socialTwitter : socialTab === "facebook" ? socialFacebook : socialInstagram;

  return (
    <form action={formAction} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {stayOnPage && <input type="hidden" name="stay" value="1" />}

      {state.error && (
        <p className="rounded-md border border-[#e3b8b4] bg-[#fdf2f1] px-3.5 py-2.5 text-sm font-medium text-[#8C1D18]" role="alert">
          {state.error}
        </p>
      )}

      {/* Asistente IA compacto */}
      <section className="overflow-hidden rounded-md border border-[#bcd6e3] bg-[#f4f9fc]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setShowAiPanel((v) => !v)}
            className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.11em] text-[#0c5373]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M10 2.5 11.7 7.3 16.5 9l-4.8 1.7L10 15.5l-1.7-4.8L3.5 9l4.8-1.7L10 2.5Z" strokeLinejoin="round" />
            </svg>
            <span>Asistente IA desde mensaje u oficio</span>
            <span className="text-[11px] font-semibold text-[#557180]">{showAiPanel ? "▾" : "▸"}</span>
          </button>
          {showAiPanel && (
            <button
              type="button"
              onClick={generateAllFromRaw}
              disabled={generating || rawSource.trim().length < 15}
              aria-busy={generating || undefined}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#006699] px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-[#004d73] disabled:opacity-50"
            >
              {generating && <Spinner className="h-3.5 w-3.5" />}
              <span>{generating ? "Redactando…" : "Estructurar con IA"}</span>
            </button>
          )}
        </div>
        {showAiPanel && (
          <div className="space-y-2 border-t border-[#d6e6ef] bg-white/75 px-4 py-3">
            <textarea
              id={`raw-source-${initial.id ?? "new"}`}
              aria-label="Texto original del mensaje, correo o formulario"
              value={rawSource}
              onChange={(e) => setRawSource(e.target.value)}
              rows={3}
              placeholder="Pega aquí las respuestas del formulario de solicitud, correo o mensaje de WhatsApp…"
              className={`${input} min-h-20 bg-white text-sm`}
            />
            {aiError && <p className="text-xs font-semibold text-[#8C1D18]" role="alert">{aiError}</p>}
            {aiNotice && <p className="text-xs font-semibold text-[#0c5373]" role="status">{aiNotice}</p>}
          </div>
        )}
      </section>

      {/* Contenido principal */}
      <div className="space-y-4">
        <div>
          <label className={label} htmlFor={`title-${initial.id ?? "new"}`}>
            Titular del comunicado
          </label>
          <input
            id={`title-${initial.id ?? "new"}`}
            name="title"
            className={`${input} font-semibold`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={180}
            placeholder="Ej. Convocatoria de reinscripción periodo 2026-2"
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
            placeholder="Redacción institucional, fechas, requisitos y oficinas…"
          />
        </div>

        <div className="grid gap-3 rounded-md border border-[#e2ded1] bg-[#faf8f1] p-3.5 sm:grid-cols-2">
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
            <label className={label} htmlFor={`source_area-${initial.id ?? "new"}`}>
              Área emisora
            </label>
            <select
              id={`source_area-${initial.id ?? "new"}`}
              name="source_area"
              className={input}
              value={sourceArea}
              onChange={(event) => setSourceArea(event.target.value as SourceArea)}
            >
              {SOURCE_AREAS.map((area) => (
                <option key={area} value={area}>
                  {sourceAreaLabel(area)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`publish_at-${initial.id ?? "new"}`}>
              Fecha de publicación
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
          <div>
            <label className={label} htmlFor={`valid_until-${initial.id ?? "new"}`}>
              Vigente hasta (opcional)
            </label>
            <input
              id={`valid_until-${initial.id ?? "new"}`}
              name="valid_until"
              type="date"
              className={input}
              defaultValue={initial.validUntil ?? ""}
              aria-describedby={`valid_until_hint-${initial.id ?? "new"}`}
            />
            <p id={`valid_until_hint-${initial.id ?? "new"}`} className="mt-1 text-xs text-[#53656c]">
              Sin fecha, el cartel aparece en el carrusel solo el día de publicación.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor={`external_url-${initial.id ?? "new"}`}>
              Enlace oficial (opcional)
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
          <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
            <label className="inline-flex items-center gap-2 font-medium text-[#213d4c]">
              <input
                type="checkbox"
                name="featured"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
              />
              <span>Marcar como comunicado destacado</span>
            </label>
            <label className="inline-flex items-center gap-2 font-medium text-[#213d4c]">
              <input type="checkbox" name="is_public" defaultChecked={initial.isPublic} />
              <span>Visible para visitantes sin sesión</span>
            </label>
          </div>
        </div>

        <ImageUploadField
          name="image"
          label="Cartel o imagen (opcional · JPG, PNG o WEBP · máx. 10 MB)"
          initialImageUrl={initial.imageUrl ?? null}
          compact={stayOnPage}
        />
      </div>

      {/* Formatos de redes sociales en pestañas */}
      <section className="overflow-hidden rounded-md border border-[#d6e2ea] bg-[#f8fbfd]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dde8ef] px-4 py-2.5">
          <div className="flex items-center gap-1" role="tablist" aria-label="Redes sociales">
            {(
              [
                { id: "twitter", label: "X / Twitter", count: socialTwitter.length, max: 280 },
                { id: "facebook", label: "Facebook", count: socialFacebook.length, max: 1000 },
                { id: "instagram", label: "Instagram", count: socialInstagram.length, max: 1000 },
              ] as const
            ).map((ch) => (
              <button
                key={ch.id}
                type="button"
                role="tab"
                aria-selected={socialTab === ch.id}
                onClick={() => setSocialTab(ch.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-extrabold transition ${
                  socialTab === ch.id
                    ? "bg-[#155775] text-white"
                    : "text-[#425f6d] hover:bg-[#e7f1f6]"
                }`}
              >
                {ch.label}
                {ch.count > 0 && (
                  <span className={`ml-1.5 font-mono text-[10px] ${socialTab === ch.id ? "text-[#cbe5f2]" : "text-[#6a818d]"}`}>
                    {ch.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {activeSocialValue.trim() && (
              <button
                type="button"
                onClick={() => void copySocial(socialTab, activeSocialValue)}
                className="rounded-md border border-[#c4d8e2] bg-white px-2.5 py-1 text-xs font-bold text-[#0c5373] hover:bg-[#eaf4f8]"
              >
                {copiedKey === socialTab ? "Copiado ✓" : "Copiar"}
              </button>
            )}
            <button
              type="button"
              onClick={generateWithAi}
              disabled={generating}
              aria-busy={generating || undefined}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#b9d4e3] bg-white px-2.5 py-1 text-xs font-extrabold text-[#005980] hover:bg-[#eaf4f8] disabled:opacity-60"
            >
              {generating && <Spinner className="h-3 w-3" />}
              <span>{generating ? "Generando…" : "Regenerar redes"}</span>
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className={socialTab === "twitter" ? "space-y-1" : "hidden"}>
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#5a6f7a]">
              <label htmlFor={`social_twitter-${initial.id ?? "new"}`}>Versión breve para X / Twitter</label>
              <span className="font-mono tabular-nums">{socialTwitter.length} / 280</span>
            </div>
            <textarea
              id={`social_twitter-${initial.id ?? "new"}`}
              name="social_twitter"
              className={`${input} min-h-24 bg-white`}
              value={socialTwitter}
              onChange={(event) => setSocialTwitter(event.target.value)}
              maxLength={280}
              placeholder="Resumen conciso de hasta 280 caracteres con #ESCOM #IPN"
            />
          </div>

          <div className={socialTab === "facebook" ? "space-y-1" : "hidden"}>
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#5a6f7a]">
              <label htmlFor={`social_facebook-${initial.id ?? "new"}`}>Versión estructurada para Facebook</label>
              <span className="font-mono tabular-nums">{socialFacebook.length} / 1000</span>
            </div>
            <textarea
              id={`social_facebook-${initial.id ?? "new"}`}
              name="social_facebook"
              className={`${input} min-h-28 bg-white`}
              value={socialFacebook}
              onChange={(event) => setSocialFacebook(event.target.value)}
              maxLength={1000}
              placeholder="Versión completa con contexto institucional para Facebook"
            />
          </div>

          <div className={socialTab === "instagram" ? "space-y-1" : "hidden"}>
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#5a6f7a]">
              <label htmlFor={`social_instagram-${initial.id ?? "new"}`}>Pie de publicación para Instagram</label>
              <span className="font-mono tabular-nums">{socialInstagram.length} / 1000</span>
            </div>
            <textarea
              id={`social_instagram-${initial.id ?? "new"}`}
              name="social_instagram"
              className={`${input} min-h-28 bg-white`}
              value={socialInstagram}
              onChange={(event) => setSocialInstagram(event.target.value)}
              maxLength={1000}
              placeholder="Pie visual con hashtags institucionales"
            />
          </div>

          <input type="hidden" name="social_copy" value={socialCopy} />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#e5e1d4] pt-4">
        {onCancel && (
          <button type="button" onClick={onCancel} className={btnGhost}>
            Cancelar
          </button>
        )}
        <SubmitButton className={btn} pending={pending} pendingText="Guardando…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
