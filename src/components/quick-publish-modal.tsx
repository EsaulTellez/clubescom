"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { SubmitButton } from "@/components/loading-ui";
import { crearAviso } from "@/app/avisos/actions";
import { AvisoForm } from "@/app/avisos/aviso-form";
import { createClubEvent, createClubPost } from "@/app/clubes/actions";
import { addSpaceEvent } from "@/app/espacios/actions";
import { ImageUploadField } from "@/components/image-upload-field";
import { btn, btnGhost, input, label } from "@/lib/ui";

export type QuickPublishContext = {
  isAuthenticated: boolean;
  canPublishAviso: boolean;
  canPublishSpaceEvents: boolean;
  managedClubs: { id: string; name: string }[];
  spaces: { id: string; name: string }[];
  defaultPublishAt: string;
};

type PublishTab = "club_post" | "evento" | "aviso";

export function QuickPublishModal({ context }: { context: QuickPublishContext }) {
  const canClub = context.managedClubs.length > 0;
  const canEvent = (context.canPublishSpaceEvents && context.spaces.length > 0) || canClub;
  const canAviso = context.canPublishAviso;
  const hasAnyPermission = context.isAuthenticated && (canClub || canEvent || canAviso);

  const [open, setOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);

  if (!hasAnyPermission) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setModalKey((k) => k + 1);
          setOpen(true);
        }}
        className={btn}
      >
        <span aria-hidden="true" className="text-base leading-none">+</span>
        <span>Nueva publicación</span>
      </button>

      {open && (
        <QuickPublishDialog
          key={modalKey}
          context={context}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function QuickPublishDialog({
  context,
  onClose,
}: {
  context: QuickPublishContext;
  onClose: () => void;
}) {
  const canClub = context.managedClubs.length > 0;
  const canSpaceEvent = context.canPublishSpaceEvents && context.spaces.length > 0;
  const canEvent = canSpaceEvent || canClub;
  const canAviso = context.canPublishAviso;
  const initialTab: PublishTab = canClub ? "club_post" : canAviso ? "aviso" : "evento";

  const [tab, setTab] = useState<PublishTab>(initialTab);
  const [eventTarget, setEventTarget] = useState<"space" | "club">(
    canSpaceEvent ? "space" : "club",
  );
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(context.spaces[0]?.id ?? "");
  const [clubVenuePreset, setClubVenuePreset] = useState<string>("Auditorio");
  const selectedSpace = context.spaces.find((s) => s.id === selectedSpaceId);
  const requiresSpeaker = Boolean(selectedSpace && /auditorio|sala\s*14/i.test(selectedSpace.name));

  const router = useRouter();
  const [clubPostState, clubPostAction, clubPostPending] = useActionState(
    async (prev: Awaited<ReturnType<typeof createClubPost>>, formData: FormData) => {
      const res = await createClubPost(prev, formData);
      if (res.success) {
        router.refresh();
        onClose();
      }
      return res;
    },
    {},
  );
  const [spaceEventState, spaceEventAction, spaceEventPending] = useActionState(
    async (prev: Awaited<ReturnType<typeof addSpaceEvent>>, formData: FormData) => {
      const res = await addSpaceEvent(prev, formData);
      if (res.ok) {
        router.refresh();
        onClose();
      }
      return res;
    },
    {},
  );
  const [clubEventState, clubEventAction, clubEventPending] = useActionState(
    async (prev: Awaited<ReturnType<typeof createClubEvent>>, formData: FormData) => {
      const res = await createClubEvent(prev, formData);
      if (res.success) {
        router.refresh();
        onClose();
      }
      return res;
    },
    {},
  );

  const anyPending = clubPostPending || spaceEventPending || clubEventPending;
  const tabCount = [canClub, canEvent, canAviso].filter(Boolean).length;

  const dialogMeta: Record<PublishTab, { title: string; kicker: string; accent: "teal" | "amber" | "blue" }> = {
    club_post: { title: "Publicación de club", kicker: "Comunidad de clubes", accent: "teal" },
    evento: { title: "Publicar evento", kicker: "Cartelera ESCOM", accent: "amber" },
    aviso: { title: "Nuevo aviso institucional", kicker: "Comunicación Social", accent: "blue" },
  };

  return (
    <FormDialog
      title={dialogMeta[tab].title}
      kicker={dialogMeta[tab].kicker}
      accent={dialogMeta[tab].accent}
      size={tab === "aviso" ? "xl" : "lg"}
      onClose={onClose}
      disableClose={anyPending}
    >
      <div className="space-y-5">
        {tabCount > 1 && (
          <div
            role="tablist"
            aria-label="Tipo de publicación"
            className="grid gap-2 rounded-md border border-[#dedad0] bg-[#f4f2ea] p-1.5 sm:grid-cols-3"
          >
            {canClub && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "club_post"}
                onClick={() => setTab("club_post")}
                className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-extrabold transition ${
                  tab === "club_post"
                    ? "bg-[#165b47] text-white shadow-xs"
                    : "text-[#2d4f46] hover:bg-white/80"
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="7" cy="7.5" r="2.3" />
                  <circle cx="13.5" cy="8" r="2" />
                  <path d="M3 16c.5-2.6 2-4 4-4s3.5 1.4 4 4M11.5 16c.3-1.8 1.4-2.8 3-2.8 1.3 0 2.2.7 2.6 2" strokeLinecap="round" />
                </svg>
                <span>Publicación de club</span>
              </button>
            )}
            {canEvent && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "evento"}
                onClick={() => setTab("evento")}
                className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-extrabold transition ${
                  tab === "evento"
                    ? "bg-[#142c3c] text-white shadow-xs"
                    : "text-[#284556] hover:bg-white/80"
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
                  <path d="M6.5 2.5v3.5M13.5 2.5v3.5M3 8.5h14" strokeLinecap="round" />
                </svg>
                <span>Evento</span>
              </button>
            )}
            {canAviso && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "aviso"}
                onClick={() => setTab("aviso")}
                className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-extrabold transition ${
                  tab === "aviso"
                    ? "bg-[#006699] text-white shadow-xs"
                    : "text-[#144e6c] hover:bg-white/80"
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3.5 10.5 15.5 5v10l-12-4.5Z" strokeLinejoin="round" />
                  <path d="M6.5 11.7 7.8 16h2.1l-.8-3.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Aviso institucional</span>
              </button>
            )}
          </div>
        )}

        {tab === "club_post" && canClub && (
          <form action={clubPostAction} className="space-y-4">
            <input type="hidden" name="stay_on_page" value="1" />
            {context.managedClubs.length === 1 ? (
              <>
                <input type="hidden" name="club_id" value={context.managedClubs[0].id} />
                <div className="rounded-md border border-[#cde1d9] bg-[#f2f9f6] px-3.5 py-2 text-xs font-bold text-[#145542]">
                  Publicando en: {context.managedClubs[0].name}
                </div>
              </>
            ) : (
              <label className={label}>
                Tu club
                <select
                  className={input}
                  name="club_id"
                  required
                  defaultValue={context.managedClubs[0]?.id ?? ""}
                >
                  {context.managedClubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={label}>
              Título
              <input
                className={input}
                name="title"
                required
                minLength={4}
                maxLength={120}
                placeholder="Título de la publicación"
              />
            </label>
            <label className={label}>
              Contenido
              <textarea
                className={`${input} min-h-28`}
                name="body"
                required
                minLength={10}
                maxLength={3000}
                placeholder="Comparte avances, convocatorias o actividades del club…"
              />
            </label>
            <ImageUploadField name="image" label="Imagen (opcional · JPG, PNG o WEBP)" compact />
            {clubPostState.error && (
              <p className="rounded-md border border-[#e3b8b4] bg-[#fdf2f1] px-3 py-2 text-sm text-[#8C1D18]" role="alert">
                {clubPostState.error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-[#e5e1d4] pt-4">
              <button type="button" onClick={onClose} disabled={anyPending} className={btnGhost}>
                Cancelar
              </button>
              <SubmitButton className={btn} pending={clubPostPending} pendingText="Publicando…">
                Publicar en club
              </SubmitButton>
            </div>
          </form>
        )}

        {tab === "evento" && canEvent && (
          <div className="space-y-4">
            {canSpaceEvent && canClub && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEventTarget("space")}
                  className={`rounded-md px-3 py-1.5 text-xs font-extrabold ${
                    eventTarget === "space"
                      ? "bg-[#e3f1f8] text-[#004d73] ring-1 ring-[#9bc5dc]"
                      : "bg-[#f3f4ef] text-[#556973]"
                  }`}
                >
                  Espacio del campus
                </button>
                <button
                  type="button"
                  onClick={() => setEventTarget("club")}
                  className={`rounded-md px-3 py-1.5 text-xs font-extrabold ${
                    eventTarget === "club"
                      ? "bg-[#e3f3ed] text-[#11503d] ring-1 ring-[#99d1be]"
                      : "bg-[#f3f4ef] text-[#556973]"
                  }`}
                >
                  Evento de mi club
                </button>
              </div>
            )}

            {(eventTarget === "club" || !canSpaceEvent) && canClub ? (
              <form action={clubEventAction} className="space-y-4">
                {context.managedClubs.length === 1 ? (
                  <>
                    <input type="hidden" name="club_id" value={context.managedClubs[0].id} />
                    <div className="rounded-md border border-[#cde1d9] bg-[#f2f9f6] px-3.5 py-2 text-xs font-bold text-[#145542]">
                      Club organizador: {context.managedClubs[0].name}
                    </div>
                  </>
                ) : (
                  <label className={label}>
                    Club organizador
                    <select
                      className={input}
                      name="club_id"
                      required
                      defaultValue={context.managedClubs[0]?.id ?? ""}
                    >
                      {context.managedClubs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className={label}>
                  Título del evento
                  <input className={input} name="title" required minLength={3} maxLength={140} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>
                    Inicio
                    <input className={input} name="starts_at" type="datetime-local" required />
                  </label>
                  <label className={label}>
                    Fin (opcional)
                    <input className={input} name="ends_at" type="datetime-local" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>
                    Sede en el campus
                    <select
                      className={input}
                      name="venue_preset"
                      value={clubVenuePreset}
                      onChange={(e) => setClubVenuePreset(e.target.value)}
                    >
                      <option value="Auditorio">Auditorio</option>
                      <option value="Sala 14">Sala 14</option>
                      <option value="El domo">El domo</option>
                      <option value="Canchas">Canchas</option>
                      <option value="Explanada">Explanada</option>
                      <option value="Otro">Otro espacio autorizado</option>
                    </select>
                  </label>
                  {clubVenuePreset === "Otro" ? (
                    <label className={label}>
                      Especifica el espacio
                      <input
                        className={input}
                        name="location"
                        required
                        minLength={2}
                        maxLength={140}
                        placeholder="Ej. Laboratorio 2103"
                      />
                    </label>
                  ) : (
                    <input type="hidden" name="location" value={clubVenuePreset} />
                  )}
                </div>
                <label className={label}>
                  Descripción
                  <textarea className={`${input} min-h-24`} name="description" maxLength={500} />
                </label>
                <ImageUploadField name="image" label="Cartel del evento (opcional · JPG, PNG o WEBP)" compact />
                {clubEventState.error && (
                  <p className="rounded-md border border-[#e3b8b4] bg-[#fdf2f1] px-3 py-2 text-sm text-[#8C1D18]" role="alert">
                    {clubEventState.error}
                  </p>
                )}
                <div className="flex justify-end gap-2 border-t border-[#e5e1d4] pt-4">
                  <button type="button" onClick={onClose} disabled={anyPending} className={btnGhost}>
                    Cancelar
                  </button>
                  <SubmitButton className={btn} pending={clubEventPending} pendingText="Publicando…">
                    Publicar evento
                  </SubmitButton>
                </div>
              </form>
            ) : (
              <form action={spaceEventAction} className="space-y-4">
                <input type="hidden" name="is_public_field" value="1" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>
                    Espacio del campus
                    <select
                      className={input}
                      name="space_id"
                      required
                      value={selectedSpaceId}
                      onChange={(e) => setSelectedSpaceId(e.target.value)}
                    >
                      {context.spaces.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={label}>
                    {requiresSpeaker ? "Ponente (obligatorio)" : "Ponente (opcional)"}
                    <input
                      className={input}
                      name="speaker"
                      required={requiresSpeaker}
                      maxLength={160}
                      placeholder="Nombre de quien imparte"
                    />
                  </label>
                </div>
                <label className={label}>
                  Título del evento
                  <input
                    className={input}
                    name="title"
                    required
                    maxLength={160}
                    placeholder="Nombre de la actividad o evento"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>
                    Inicio
                    <input className={input} name="starts_at" type="datetime-local" required />
                  </label>
                  <label className={label}>
                    Fin (opcional)
                    <input className={input} name="ends_at" type="datetime-local" />
                  </label>
                </div>
                <label className={label}>
                  Descripción
                  <textarea
                    className={`${input} min-h-24`}
                    name="description"
                    maxLength={2000}
                    placeholder="Detalles que la comunidad necesita conocer"
                  />
                </label>
                <label className="flex items-start gap-2.5 rounded-md border border-[#d6d3c6] bg-[#faf8f0] px-3.5 py-2.5 text-sm text-[#2c4452]">
                  <input type="checkbox" name="is_public" defaultChecked className="mt-1" />
                  <span>
                    <strong className="block font-bold">Abierto al público</strong>
                    <span className="text-xs text-[#5d6f79]">Si se desmarca, no se mostrará en la cartelera pública.</span>
                  </span>
                </label>
                <ImageUploadField name="image" label="Cartel del evento (opcional · JPG, PNG o WEBP)" compact />
                {spaceEventState.error && (
                  <p className="rounded-md border border-[#e3b8b4] bg-[#fdf2f1] px-3 py-2 text-sm text-[#8C1D18]" role="alert">
                    {spaceEventState.error}
                  </p>
                )}
                <div className="flex justify-end gap-2 border-t border-[#e5e1d4] pt-4">
                  <button type="button" onClick={onClose} disabled={anyPending} className={btnGhost}>
                    Cancelar
                  </button>
                  <SubmitButton className={btn} pending={spaceEventPending} pendingText="Guardando…">
                    Publicar evento
                  </SubmitButton>
                </div>
              </form>
            )}
          </div>
        )}

        {tab === "aviso" && context.canPublishAviso && (
          <AvisoForm
            key="quick-create-aviso"
            action={crearAviso}
            submitLabel="Publicar comunicado"
            stayOnPage
            onCancel={onClose}
            onSuccess={() => {
              onClose();
              router.refresh();
            }}
            initial={{
              title: "",
              body: "",
              category: "academico",
              sourceArea: "general",
              featured: false,
              isPublic: true,
              publishAt: context.defaultPublishAt,
              externalUrl: "",
              socialCopy: "",
              socialTwitter: "",
              socialFacebook: "",
              socialInstagram: "",
            }}
          />
        )}
      </div>
    </FormDialog>
  );
}
