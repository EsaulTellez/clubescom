"use client";

import { useActionState, useState } from "react";
import { btn, btnGhost, input, label } from "@/lib/ui";
import { CATEGORIES, categoryLabel, socialTemplate, type Category, type FormState } from "./shared";

type Initial = {
  id?: string;
  title: string;
  body: string;
  category: Category;
  featured: boolean;
  isPublic: boolean;
  publishAt: string;
  socialCopy: string;
};

export function AvisoForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: Initial;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [category, setCategory] = useState<Category>(initial.category);
  const [socialCopy, setSocialCopy] = useState(initial.socialCopy);

  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && (
        <p className="rounded-lg bg-[#e6f3fa] px-3 py-2 text-sm text-[#006699]">{state.error}</p>
      )}

      <div>
        <label className={label} htmlFor="title">
          Título
        </label>
        <input
          id="title"
          name="title"
          className={input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={180}
        />
      </div>

      <div>
        <label className={label} htmlFor="body">
          Cuerpo
        </label>
        <textarea
          id="body"
          name="body"
          className={`${input} min-h-36`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          maxLength={8000}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="category">
            Categoría
          </label>
          <select
            id="category"
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
          <label className={label} htmlFor="publish_at">
            Publicar el
          </label>
          <input
            id="publish_at"
            name="publish_at"
            type="datetime-local"
            className={input}
            defaultValue={initial.publishAt}
            required
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="featured" defaultChecked={initial.featured} />
          Destacado
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="is_public" defaultChecked={initial.isPublic} />
          Visible en el feed público
        </label>
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className={label} htmlFor="social_copy">
            Formato para redes
          </label>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setSocialCopy(socialTemplate(category, title, body))}
          >
            Generar formato
          </button>
        </div>
        <textarea
          id="social_copy"
          name="social_copy"
          className={`${input} min-h-24`}
          value={socialCopy}
          onChange={(event) => setSocialCopy(event.target.value)}
          maxLength={600}
        />
      </div>

      <button className={btn} disabled={pending}>
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
