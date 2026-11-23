"use client";

import { GuideFlowchart } from "./guide-flowchart";
import type { GuideStep } from "./shared";

export function RouteMap({
  steps,
  current,
  onSelect,
  completedSteps = [],
  pendingByStep = {},
}: {
  steps: GuideStep[];
  current?: number;
  onSelect?: (id: number) => void;
  defaultOpen?: boolean;
  completedSteps?: number[];
  pendingByStep?: Record<number, number>;
}) {
  return (
    <GuideFlowchart
      steps={steps}
      currentStepId={current}
      completedSteps={completedSteps}
      pendingByStep={pendingByStep}
      onSelect={onSelect}
      compact
    />
  );
}
