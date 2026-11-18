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
  initialDone = [], ...props
}: Omit<ComponentProps<typeof GuideRoute>, "done" | "toggle"> & { initialDone?: number[] }) {
  const { signedIn, guideId } = props;
  const [saved, setSaved] = useState(initialDone);
  const guestValue = useSyncExternalStore(subscribe, () => {
    try { return window.localStorage.getItem(`escom-guide-progress-${guideId}`) ?? "[]"; }
    catch { return "[]"; }
  }, () => "[]");
  let done = saved;
  if (!signedIn) {
    try {
      const value: unknown = JSON.parse(guestValue);
      if (Array.isArray(value)) done = value.filter((id): id is number => typeof id === "number");
    } catch { /* Ignore an invalid local progress entry. */ }
  }

  function toggleStep(index: number) {
    const checked = done.includes(index);
    const next = checked ? done.filter((item) => item !== index) : [...done, index];
    if (signedIn) {
      setSaved(next);
      void saveGuideProgress(guideId, next, checked ? undefined : index);
    } else {
      try {
        window.localStorage.setItem(`escom-guide-progress-${guideId}`, JSON.stringify(next));
        window.dispatchEvent(new Event("escom-guide-progress"));
      } catch {
        // ignore
      }
    }
  }

  return <GuideRoute {...props} done={done} toggle={toggleStep} />;
}
