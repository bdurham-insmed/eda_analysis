import type { ParameterType } from "../../types.ts";

export type Mode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "workflow"; id: number }
  | { kind: "version"; workflowId: number; versionId: number };

export type StepDraft = {
  step_order: number;
  step_name: string;
  step_type: "processing" | "analysis" | "reporting";
};

export type ParameterDraft = {
  name: string;
  type: ParameterType;
  description: string;
  options: string;
  required: boolean;
  default_value: string;
};

export const emptyParameterDraft: ParameterDraft = {
  name: "",
  type: "string",
  description: "",
  options: "",
  required: false,
  default_value: "",
};

export const emptyStep: StepDraft = {
  step_order: 0,
  step_name: "",
  step_type: "processing",
};

export const versionStatusClass = (
  v: { status: string; archived_at: string | null },
): string => {
  if (v.archived_at) return "status status-archived";
  if (v.status === "published") return "status status-completed";
  return "status status-pending";
};

export const versionStatusLabel = (
  v: { status: string; archived_at: string | null },
): string => {
  if (v.archived_at) return "Archived";
  if (v.status === "published") return "Published";
  return "Draft";
};
