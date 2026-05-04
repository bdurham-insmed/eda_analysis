export type ParameterType = "string" | "number" | "select" | "boolean" | "file";

export type VersionStatus = "draft" | "published";

export type Parameter = {
  id: number;
  name: string;
  type: ParameterType;
  required?: boolean;
  options?: string[] | null;
  default_value?: string | null;
  description?: string | null;
  archived_at?: string | null;
};

export type WorkflowStep = {
  id?: number;
  step_order: number;
  step_name: string;
  step_type: "processing" | "analysis" | "reporting";
};

export type WorkflowVersionSummary = {
  id: number;
  workflow_id: number;
  version_number: number;
  version_label: string | null;
  status: VersionStatus;
  description: string | null;
  created_at: string;
  published_at: string | null;
  archived_at: string | null;
};

export type WorkflowVersion = {
  id: number;
  workflow_id: number;
  version_number: number;
  version_label: string | null;
  status: VersionStatus;
  description: string | null;
  revision: number;
  created_at: string;
  published_at: string | null;
  archived_at: string | null;
  parameters: Parameter[];
  steps: WorkflowStep[];
};

export type Workflow = {
  id: number;
  name: string;
  description?: string | null;
  revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  versions: WorkflowVersionSummary[];
};

export type WorkflowSummary = {
  id: number;
  name: string;
  description?: string | null;
  archived_at: string | null;
  version_count: number;
  latest_version_number: number | null;
  latest_published_version_id: number | null;
  latest_published_version_number: number | null;
  latest_published_version_label: string | null;
};

export type Step = {
  name: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  step_order?: number | null;
  step_type?: string | null;
};

export type Pipeline = {
  id: string;
  name: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  workflow_id?: number | null;
  workflow_version_id?: number | null;
  version_number?: number | null;
  parameter_values?: Record<string, unknown> | null;
  steps?: Step[];
};

export type WebSocketUpdate = {
  pipeline_id: string;
  name: string;
  status: string;
  event_type: string;
  step_name?: string;
  timestamp: number;
};
