import { AxiosError } from "axios";

const ERROR_MESSAGES: Record<string, string> = {
  workflow_archived:
    "This workflow is archived. Unarchive it before making changes.",
  version_archived:
    "This version is archived. Unarchive it before making changes.",
  version_not_draft:
    "Only draft versions are editable. Clone this version to make changes.",
  stale_revision:
    "This was edited elsewhere — refresh to see the latest version.",
  duplicate_name: "A workflow with this name already exists.",
  workflow_not_found: "Workflow not found.",
  version_not_found: "Version not found.",
  source_version_not_found: "Source version not found for this workflow.",
  parameter_not_found: "Parameter not found.",
};

export const errorMessage = (err: unknown): string => {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data && typeof data === "object") {
      const detail = (data as { detail?: unknown }).detail;
      if (detail && typeof detail === "object") {
        const code = (detail as { error?: unknown }).error;
        if (typeof code === "string") {
          return ERROR_MESSAGES[code] ?? code.replace(/_/g, " ");
        }
      }
      if (typeof detail === "string") return detail;
    }
  }
  return "Request failed";
};
