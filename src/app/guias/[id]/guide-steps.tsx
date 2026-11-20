"use client";

import { useState, useSyncExternalStore, type ComponentProps } from "react";
import { saveGuideProgress } from "../actions";
import { GuideRoute } from "../guide-route";

function subscribe(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener("escom-guide-progress", update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener("escom-guide-progress", update);
  };
}

export function GuideSteps({
  initialDone = [],
  ...props
}: Omit<ComponentProps<typeof GuideRoute>, "done" | "toggle"> & { initialDone?: number[] }) {
  const { signedIn, guideId } = props;
  const [saved, setSaved] = useState(initialDone);
  const [saveError, setSaveError] = useState("");
  const guestValue = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(`escom-guide-progress-${guideId}`) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  let done = saved;
  if (!signedIn) {
    try {
      const value: unknown = JSON.parse(guestValue);
      if (Array.isArray(value)) done = value.filter((id): id is number => typeof id === "number");
    } catch {
      /* Ignore an invalid local progress entry. */
    }
  }

  async function toggleStep(index: number) {
    setSaveError("");
    const checked = done.includes(index);
    const next = checked ? done.filter((item) => item !== index) : [...done, index];
    if (signedIn) {
      setSaved(next);
      try {
        await saveGuideProgress(guideId, next, checked ? undefined : index);
      } catch {
        setSaved(done);
        setSaveError("No se pudo guardar tu avance; revisa tu conexión o sesión.");
      }
    } else {
      try {
        window.localStorage.setItem(`escom-guide-progress-${guideId}`, JSON.stringify(next));
        window.dispatchEvent(new Event("storage"));
      } catch {
        // ignore
      }
    }
  }

  return (
    <div className="space-y-2">
      {saveError && (
        <p role="alert" className="text-xs font-semibold text-[#8C1D18]">
          {saveError}
        </p>
      )}
      <GuideRoute {...props} done={done} toggle={toggleStep} />
    </div>
  );
}
