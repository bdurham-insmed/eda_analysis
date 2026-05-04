import { useState } from "react";
import { emptyStep, type StepDraft } from "./types.ts";

export function useStepDrafts(initial: StepDraft[] = [{ ...emptyStep }]) {
  const [steps, setSteps] = useState<StepDraft[]>(initial);

  const moveStep = (index: number, direction: -1 | 1) => {
    const next = [...steps];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    next.forEach((s, i) => (s.step_order = i));
    setSteps(next);
  };

  const addStep = () => {
    setSteps([
      ...steps,
      { step_order: steps.length, step_name: "", step_type: "processing" },
    ]);
  };

  const removeStep = (index: number) => {
    const next = steps.filter((_, i) => i !== index);
    next.forEach((s, i) => (s.step_order = i));
    setSteps(next.length ? next : [{ ...emptyStep }]);
  };

  return { steps, setSteps, moveStep, addStep, removeStep };
}
