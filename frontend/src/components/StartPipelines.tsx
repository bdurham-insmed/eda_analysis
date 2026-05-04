import { useEffect, useState } from "react";
import axios, { AxiosError } from "axios";
import type {
  Parameter,
  Workflow,
  WorkflowSummary,
  WorkflowVersion,
  WorkflowVersionSummary,
} from "../types.ts";
import { API_BASE, INITIATOR_BASE } from "../constants.ts";
import "./StartPipelines.css";

type Props = {
  workflows: WorkflowSummary[];
  loading: boolean;
  error: string;
  setError: (msg: string) => void;
  setLoading: (loading: boolean) => void;
  refreshWorkflows: () => void;
};

type FormValue = string | number | boolean;
type FormState = Record<string, FormValue>;

const errorBody = (err: unknown): Record<string, unknown> => {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data && typeof data === "object") {
      const detail = (data as { detail?: unknown }).detail;
      if (detail && typeof detail === "object") return detail as Record<string, unknown>;
      return data as Record<string, unknown>;
    }
  }
  return {};
};

const parameterDefault = (param: Parameter): FormValue => {
  if (param.type === "boolean") return false;
  if (param.type === "number") return "";
  if (param.default_value != null) return param.default_value;
  return "";
};

const coerceForSubmit = (param: Parameter, raw: FormValue) => {
  if (param.type === "boolean") return Boolean(raw);
  if (param.type === "number") {
    if (raw === "" || raw === null || raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }
  if (raw === "" || raw === null || raw === undefined) return undefined;
  return raw;
};

const isSelectableVersion = (v: WorkflowVersionSummary): boolean =>
  v.status === "published" && v.archived_at == null;

const IconChevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconParameter = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="12" height="12">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="14" y2="18" />
  </svg>
);

const IconVersion = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="12" height="12">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const IconBack = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

export default function StartPipelines({
  workflows,
  loading,
  error,
  setError,
  setLoading,
  refreshWorkflows,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(true);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<Workflow | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [versionDetail, setVersionDetail] = useState<WorkflowVersion | null>(null);
  const [formData, setFormData] = useState<FormState>({});
  const [count, setCount] = useState<number>(1);
  const [archivedNames, setArchivedNames] = useState<Set<string>>(new Set());
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({});

  // When a workflow is selected, fetch its detail (gives us versions list).
  useEffect(() => {
    if (selectedWorkflowId == null) {
      setWorkflowDetail(null);
      return;
    }
    const fetchDetail = async () => {
      try {
        const res = await axios.get<Workflow>(
          `${API_BASE}/workflows/${selectedWorkflowId}`,
        );
        setWorkflowDetail(res.data);
        setError("");
        // Default to latest published, non-archived version (if any).
        const selectable = res.data.versions.filter(isSelectableVersion);
        if (selectable.length === 0) {
          setSelectedVersionId(null);
        } else {
          // versions come back ordered by version_number DESC
          setSelectedVersionId(selectable[0].id);
        }
      } catch {
        setError("Failed to load workflow details");
      }
    };
    void fetchDetail();
  }, [selectedWorkflowId, setError]);

  // When a version is selected, fetch its parameters/steps and seed the form.
  useEffect(() => {
    if (selectedVersionId == null) {
      setVersionDetail(null);
      setFormData({});
      return;
    }
    const fetchVersion = async () => {
      try {
        const res = await axios.get<WorkflowVersion>(
          `${API_BASE}/workflow-versions/${selectedVersionId}`,
        );
        setVersionDetail(res.data);
        const initial: FormState = {};
        for (const p of res.data.parameters) {
          initial[p.name] = parameterDefault(p);
        }
        setFormData(initial);
        setArchivedNames(new Set());
        setParamErrors({});
        setError("");
      } catch {
        setError("Failed to load version details");
      }
    };
    void fetchVersion();
  }, [selectedVersionId, setError]);

  const handleParamChange = (name: string, value: FormValue) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const uploadFile = async (param: Parameter, file: File) => {
    if (selectedVersionId == null) return;
    setParamErrors((prev) => ({ ...prev, [param.name]: "" }));
    const body = new FormData();
    body.append("workflow_version_id", String(selectedVersionId));
    body.append("parameter_name", param.name);
    body.append("file", file);
    try {
      const res = await axios.post<{ uri: string; filename: string }>(
        `${INITIATOR_BASE}/uploads`,
        body,
      );
      handleParamChange(param.name, res.data.uri);
    } catch (err) {
      const body = errorBody(err);
      const code = body.error;
      if (code === "file_too_large") {
        const max = Number(body.max_bytes) || 0;
        const mib = Math.round(max / 1024 / 1024);
        setParamErrors((prev) => ({
          ...prev,
          [param.name]: `File too large (max ${mib} MiB)`,
        }));
      } else if (code === "gcs_not_configured") {
        setParamErrors((prev) => ({
          ...prev,
          [param.name]: "Object storage is not configured on the server",
        }));
      } else {
        setParamErrors((prev) => ({
          ...prev,
          [param.name]: "Upload failed",
        }));
      }
    }
  };

  const renderInput = (param: Parameter) => {
    const value = formData[param.name];
    if (param.type === "select") {
      return (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => handleParamChange(param.name, e.target.value)}
        >
          <option value="">Select an option…</option>
          {(param.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    if (param.type === "boolean") {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => handleParamChange(param.name, e.target.checked)}
        />
      );
    }
    if (param.type === "number") {
      return (
        <input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => handleParamChange(param.name, e.target.value)}
        />
      );
    }
    if (param.type === "file") {
      return (
        <>
          <input
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(param, f);
            }}
          />
          {typeof value === "string" && value && (
            <span className="file-uploaded">
              Uploaded: <code>{value}</code>
            </span>
          )}
        </>
      );
    }
    return (
      <input
        type="text"
        autoComplete="off"
        placeholder={param.default_value ?? ""}
        value={(value as string) ?? ""}
        onChange={(e) => handleParamChange(param.name, e.target.value)}
      />
    );
  };

  const startPipeline = async () => {
    if (!versionDetail) return;
    setLoading(true);
    setError("");
    setParamErrors({});
    try {
      const parameters: Record<string, unknown> = {};
      for (const param of versionDetail.parameters) {
        const coerced = coerceForSubmit(param, formData[param.name]);
        if (coerced !== undefined) parameters[param.name] = coerced;
      }
      await axios.post(`${INITIATOR_BASE}/jobs`, {
        workflow_version_id: versionDetail.id,
        parameters,
        count,
      });
      setSelectedWorkflowId(null);
      setWorkflowDetail(null);
      setSelectedVersionId(null);
      setVersionDetail(null);
      setFormData({});
      setCount(1);
    } catch (err) {
      const body = errorBody(err);
      const code = body.error;
      if (code === "parameter_archived" && typeof body.parameter === "string") {
        setArchivedNames((prev) => new Set(prev).add(body.parameter as string));
        setError(`Parameter "${body.parameter}" was archived; refresh and reselect.`);
        if (selectedVersionId != null) {
          try {
            const res = await axios.get<WorkflowVersion>(
              `${API_BASE}/workflow-versions/${selectedVersionId}`,
            );
            setVersionDetail(res.data);
          } catch {
            // best effort
          }
        }
      } else if (code === "file_not_found" && typeof body.parameter === "string") {
        setParamErrors((prev) => ({
          ...prev,
          [body.parameter as string]: "Uploaded file not found in object storage",
        }));
      } else if (code === "missing_required_parameter" && typeof body.parameter === "string") {
        setParamErrors((prev) => ({
          ...prev,
          [body.parameter as string]: "This parameter is required",
        }));
      } else if (
        code === "version_not_found" ||
        code === "version_archived" ||
        code === "version_not_published" ||
        code === "workflow_archived" ||
        code === "workflow_not_found"
      ) {
        setError("This version is no longer available. Refresh and reselect.");
        refreshWorkflows();
      } else {
        const detailMsg =
          err instanceof AxiosError && typeof err.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to start pipeline";
        setError(detailMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const requiredMissing =
    versionDetail?.parameters.some(
      (p) =>
        p.required &&
        (formData[p.name] === undefined ||
          formData[p.name] === "" ||
          formData[p.name] === null),
    ) ?? false;

  // Workflows that have at least one selectable (published, non-archived) version.
  const runnableWorkflows = workflows.filter(
    (wf) => wf.archived_at == null && wf.latest_published_version_id != null,
  );

  const selectableVersions =
    workflowDetail?.versions.filter(isSelectableVersion) ?? [];

  return (
    <section className="card start-card">
      <div className="card-header">
        <button
          type="button"
          className={`section-toggle ${expanded ? "expanded" : ""}`}
          onClick={() => setExpanded((e) => !e)}
        >
          <div>
            <h2>Start a pipeline</h2>
            <p>Pick a workflow version, fill in parameters, and run.</p>
          </div>
          <IconChevron />
        </button>
      </div>

      {expanded && (
        <div className="card-body">
          {!workflowDetail ? (
            runnableWorkflows.length === 0 ? (
              <div className="empty-state">
                <h3>No published workflow versions</h3>
                <p>Create a workflow and publish a version in the Workflows tab.</p>
              </div>
            ) : (
              <div className="workflow-grid">
                {runnableWorkflows.map((wf) => (
                  <button
                    type="button"
                    key={wf.id}
                    onClick={() => setSelectedWorkflowId(wf.id)}
                    className="workflow-tile"
                  >
                    <h4>{wf.name}</h4>
                    <p className="workflow-tile-desc">
                      {wf.description || "No description"}
                    </p>
                    <div className="workflow-tile-meta">
                      <span className="workflow-tile-meta-item">
                        <IconVersion />
                        latest v{wf.latest_published_version_number}
                      </span>
                      <span className="workflow-tile-meta-item">
                        <IconParameter />
                        {wf.version_count} version{wf.version_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="run-form">
              <div className="run-form-head">
                <div>
                  <h3>{workflowDetail.name}</h3>
                  {workflowDetail.description && <p>{workflowDetail.description}</p>}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setSelectedWorkflowId(null);
                    setWorkflowDetail(null);
                    setSelectedVersionId(null);
                    setVersionDetail(null);
                  }}
                >
                  <IconBack /> Back
                </button>
              </div>

              {selectableVersions.length === 0 ? (
                <div className="banner banner-warning">
                  No published versions available for this workflow.
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="version-picker">Version</label>
                  <select
                    id="version-picker"
                    value={selectedVersionId ?? ""}
                    onChange={(e) => setSelectedVersionId(Number(e.target.value))}
                    style={{ maxWidth: 320 }}
                  >
                    {selectableVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version_number}
                        {v.description ? ` — ${v.description}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {error && <div className="banner banner-error">{error}</div>}

              {versionDetail && (
                <>
                  {versionDetail.parameters.length === 0 ? (
                    <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                      This version takes no parameters.
                    </p>
                  ) : (
                    <div className="param-grid">
                      {versionDetail.parameters.map((param) => {
                        const isArchived = archivedNames.has(param.name);
                        const isCheckbox = param.type === "boolean";
                        return (
                          <div
                            key={param.id}
                            className={`param-field ${isCheckbox ? "param-field--checkbox" : ""} ${
                              isArchived ? "param-field--archived" : ""
                            }`}
                          >
                            {isCheckbox ? (
                              <>
                                {renderInput(param)}
                                <div>
                                  <div className="param-field-label">
                                    {param.name}
                                    {param.required && (
                                      <span className="param-field-required">*</span>
                                    )}
                                    {isArchived && (
                                      <span className="param-field-archived">(archived)</span>
                                    )}
                                  </div>
                                  {param.description && (
                                    <span className="param-field-helper">
                                      {param.description}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <label className="param-field-label">
                                  {param.name}
                                  {param.required && (
                                    <span className="param-field-required">*</span>
                                  )}
                                  {isArchived && (
                                    <span className="param-field-archived">(archived)</span>
                                  )}
                                </label>
                                {renderInput(param)}
                                {param.description && (
                                  <span className="param-field-helper">{param.description}</span>
                                )}
                              </>
                            )}
                            {paramErrors[param.name] && (
                              <span className="param-field-error">
                                {paramErrors[param.name]}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="run-form-foot">
                    <div className="count-control">
                      <label htmlFor="pipeline-count-input">Run count</label>
                      <input
                        id="pipeline-count-input"
                        type="number"
                        min={1}
                        max={2500}
                        value={count}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isNaN(n)) {
                            setCount(1);
                          } else {
                            setCount(Math.max(1, Math.min(2500, Math.floor(n))));
                          }
                        }}
                        disabled={loading}
                      />
                      <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                        max 2,500
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void startPipeline()}
                      disabled={loading || requiredMissing}
                      className="btn btn-primary"
                      title={
                        requiredMissing
                          ? "Fill in all required parameters first"
                          : undefined
                      }
                    >
                      {loading
                        ? "Starting…"
                        : count > 1
                          ? `Start ${count} pipelines`
                          : "Start pipeline"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
