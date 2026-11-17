"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
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
  const canEvent = context.canPublishSpaceEvents || canClub;
  const canAviso = context.canPublishAviso;
  const hasAnyPermission = context.isAuthenticated && (canClub || canEvent || canAviso);

  const initialTab: PublishTab = canClub ? "club_post" : canAviso ? "aviso" : "evento";

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PublishTab>(initialTab);
  const [eventTarget, setEventTarget] = useState<"space" | "club">(
    context.canPublishSpaceEvents ? "space" : "club",
  );
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(context.spaces[0]?.id ?? "");
  const selectedSpace = context.spaces.find((s) => s.id === selectedSpaceId);
  const requiresSpeaker = Boolean(selectedSpace && /auditorio|sala\s*14/i.test(selectedSpace.name));

  const router = useRouter();
  const [clubPostState, clubPostAction, clubPostPending] = useActionState(createClubPost, {});
  const [spaceEventState, spaceEventAction, spaceEventPending] = useActionState(addSpaceEvent, {});
  const [clubEventState, clubEventAction, clubEventPending] = useActionState(createClubEvent, {});

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!hasAnyPermission) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[#006699] px-4 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#004d73] sm:text-sm"
      >
        <span aria-hidden="true" className="text-base leading-none">+</span>
        <span>Crear publicación</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-publish-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#cfdbe2] bg-[#fffefa] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e4ecee] bg-[#f4f9fb] px-5 py-4">
              <h2 id="quick-publish-title" className="text-lg font-extrabold text-[#14374a]">
                Nueva publicación
              </h2>
              <button
                type="button"
                aria-label="Cerrar ventana"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#cbd9e0] bg-white text-sm font-bold text-[#35505e] hover:bg-[#eaf3f7]"
              >
                ✕
              </button>
            </div>

            {/* Selector principal según permisos del usuario */}
            <div className="flex flex-wrap gap-2 border-b border-[#e8ecee] bg-[#fafcfd] px-5 py-3">
              {canClub && (
                <button
                  type="button"
                  onClick={() => setTab("club_post")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition ${
                    tab === "club_post"
                      ? "bg-[#165b47] text-white"
                      : "border border-[#cddbd5] bg-white text-[#165b47] hover:bg-[#eaf6f1]"
                  }`}
                >
                  Publicación de club
                </button>
              )}
              {canEvent && (
                <button
                  type="button"
                  onClick={() => setTab("evento")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition ${
                    tab === "evento"
                      ? "bg-[#075679] text-white"
                      : "border border-[#c4d8e2] bg-white text-[#075679] hover:bg-[#eaf4f8]"
                  }`}
                >
                  Evento
                </button>
              )}
              {canAviso && (
                <button
                  type="button"
                  onClick={() => setTab("aviso")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition ${
                    tab === "aviso"
                      ? "bg-[#006699] text-white"
                      : "border border-[#b9d4e3] bg-white text-[#006699] hover:bg-[#eaf4f8]"
                  }`}
                >
                  Aviso institucional
                </button>
              )}
            </div>

            <div className="overflow-y-auto p-5 sm:p-6">
              {tab === "club_post" && canClub && (
                <form action={clubPostAction} className="space-y-3.5">
                  <label className={label}>
                    Club
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
                  <ImageUploadField name="image" label="Imagen de la publicación (JPG, PNG o WEBP)" />
                  {clubPostState.error && (
                    <p className="text-sm text-[#8C1D18]" role="alert">
                      {clubPostState.error}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
                      Cancelar
                    </button>
                    <button className={btn} disabled={clubPostPending}>
                      {clubPostPending ? "Publicando…" : "Publicar en club"}
                    </button>
                  </div>
                </form>
              )}

              {tab === "evento" && canEvent && (
                <div className="space-y-4">
                  {context.canPublishSpaceEvents && canClub && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEventTarget("space")}
                        className={`rounded-md px-3 py-1 text-xs font-bold ${
                          eventTarget === "space"
                            ? "bg-[#e3f1f8] text-[#004d73] ring-1 ring-[#9bc5dc]"
                            : "bg-[#f3f4ef] text-[#556973]"
                        }`}
                      >
                        En espacio del campus
                      </button>
                      <button
                        type="button"
                        onClick={() => setEventTarget("club")}
                        className={`rounded-md px-3 py-1 text-xs font-bold ${
                          eventTarget === "club"
                            ? "bg-[#e3f3ed] text-[#11503d] ring-1 ring-[#99d1be]"
                            : "bg-[#f3f4ef] text-[#556973]"
                        }`}
                      >
                        Evento de club
                      </button>
                    </div>
                  )}

                  {(eventTarget === "club" || !context.canPublishSpaceEvents) && canClub ? (
                    <form action={clubEventAction} className="space-y-3.5">
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
                      <label className={label}>
                        Título del evento
                        <input className={input} name="title" required minLength={3} maxLength={140} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={label}>
                          Fecha y hora
                          <input className={input} name="starts_at" type="datetime-local" required />
                        </label>
                        <label className={label}>
                          Lugar
                          <input
                            className={input}
                            name="location"
                            required
                            minLength={2}
                            maxLength={140}
                            placeholder="Ej. Sala 14, El domo"
                          />
                        </label>
                      </div>
                      <label className={label}>
                        Descripción
                        <textarea className={`${input} min-h-24`} name="description" maxLength={500} />
                      </label>
                      <ImageUploadField name="image" label="Cartel o imagen del evento (JPG, PNG o WEBP)" />
                      {clubEventState.error && (
                        <p className="text-sm text-[#8C1D18]" role="alert">
                          {clubEventState.error}
                        </p>
                      )}
                      {clubEventState.success && (
                        <p className="text-sm font-bold text-[#165b47]" role="status">
                          {clubEventState.success}
                        </p>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
                          Cerrar
                        </button>
                        <button className={btn} disabled={clubEventPending}>
                          {clubEventPending ? "Guardando…" : "Publicar evento"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form action={spaceEventAction} className="space-y-3.5">
                      <input type="hidden" name="is_public_field" value="1" />
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
                        Título del evento
                        <input
                          className={input}
                          name="title"
                          required
                          maxLength={160}
                          placeholder="Nombre de la actividad o evento"
                        />
                      </label>
                      <label className={label}>
                        {requiresSpeaker ? "Ponente (obligatorio)" : "Ponente (opcional)"}
                        <input
                          className={input}
                          name="speaker"
                          required={requiresSpeaker}
                          maxLength={160}
                          placeholder="Nombre de la persona ponente o expositora"
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
                      <label className="flex items-start gap-2.5 rounded-lg border border-[#d6d3c6] bg-[#faf8f0] px-3 py-2 text-sm text-[#2c4452]">
                        <input type="checkbox" name="is_public" defaultChecked className="mt-1" />
                        <span>
                          <strong className="block font-bold">Abierto al público</strong>
                          <span className="text-xs text-[#5d6f79]">Si se desmarca, no se mostrará en la cartelera ni en el feed público.</span>
                        </span>
                      </label>
                      <ImageUploadField name="image" label="Cartel o imagen del evento (JPG, PNG o WEBP)" />
                      {spaceEventState.error && (
                        <p className="text-sm text-[#8C1D18]" role="alert">
                          {spaceEventState.error}
                        </p>
                      )}
                      {spaceEventState.ok && (
                        <p className="text-sm font-bold text-[#165b47]" role="status">
                          {spaceEventState.ok}
                        </p>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
                          Cerrar
                        </button>
                        <button className={btn} disabled={spaceEventPending}>
                          {spaceEventPending ? "Guardando…" : "Publicar evento"}
                        </button>
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
                  onCancel={() => setOpen(false)}
                  onSuccess={() => {
                    setOpen(false);
                    router.refresh();
                  }}
                  initial={{
                    title: "",
                    body: "",
                    category: "academico",
                    featured: true,
                    isPublic: true,
                    publishAt: context.defaultPublishAt,
                    externalUrl: "",
                    socialCopy: "",
                    socialTwitter: "",
                    socialFacebook: "",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
