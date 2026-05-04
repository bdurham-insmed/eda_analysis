import { useCallback, useEffect, useState } from "react";
import axios, { AxiosError } from "axios";
import { API_BASE } from "../../constants.ts";
import type { Workflow, WorkflowVersion } from "../../types.ts";
import MetadataCard from "./MetadataCard.tsx";
import { errorMessage } from "./errors.ts";
import { IconBack, IconPlus } from "./icons.tsx";
import { versionStatusClass, versionStatusLabel } from "./types.ts";

type Props = {
  workflowId: number;
  onBack: () => void;
  onOpenVersion: (versionId: number) => void;
  onChanged: () => void;
};

export default function WorkflowDetailView({
  workflowId,
  onBack,
  onOpenVersion,
  onChanged,
}: Props) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [revision, setRevision] = useState(1);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await axios.get<Workflow>(`${API_BASE}/workflows/${workflowId}`);
      setWorkflow(res.data);
      setName(res.data.name);
      setDescription(res.data.description ?? "");
      setRevision(res.data.revision);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [workflowId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!workflow) {
    return (
      <>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="empty-state">Loading…</div>
      </>
    );
  }

  const archived = workflow.archived_at != null;

  const saveMetadata = async () => {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    try {
      const res = await axios.put<Workflow>(`${API_BASE}/workflows/${workflowId}`, {
        name: name.trim(),
        description: description.trim() || null,
        revision,
      });
      setWorkflow(res.data);
      setRevision(res.data.revision);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof AxiosError && err.response?.status === 409) {
        const code = err.response.data?.detail?.error;
        if (code === "stale_revision") await load();
      }
    }
  };

  const archive = async () => {
    if (!confirm("Archive this workflow? It will be hidden from the picker until unarchived.")) return;
    try {
      await axios.post(`${API_BASE}/workflows/${workflowId}/archive`);
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const unarchive = async () => {
    try {
      await axios.post(`${API_BASE}/workflows/${workflowId}/unarchive`);
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const createDraftFromScratch = async () => {
    setError("");
    try {
      const res = await axios.post<WorkflowVersion>(
        `${API_BASE}/workflows/${workflowId}/versions`,
        {
          content: {
            parameter_ids: [],
            steps: [{ step_order: 0, step_name: "Step 1", step_type: "processing" }],
            description: null,
          },
        },
      );
      onChanged();
      onOpenVersion(res.data.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const cloneVersion = async (sourceVersionId: number) => {
    setError("");
    try {
      const res = await axios.post<WorkflowVersion>(
        `${API_BASE}/workflows/${workflowId}/versions`,
        { from_version_id: sourceVersionId },
      );
      onChanged();
      onOpenVersion(res.data.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteDraft = async (vId: number, vNumber: number) => {
    if (!confirm(`Delete draft v${vNumber} permanently? This cannot be undone.`)) return;
    setError("");
    try {
      await axios.delete(`${API_BASE}/workflow-versions/${vId}`);
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            style={{ marginBottom: "var(--space-2)" }}
          >
            <IconBack /> Back to workflows
          </button>
          <h1>{workflow.name}</h1>
          <p>{workflow.description ?? <span className="muted">No description</span>}</p>
        </div>
        <div className="workflow-form-actions">
          {archived ? (
            <button type="button" className="btn btn-secondary" onClick={() => void unarchive()}>
              Unarchive
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => void archive()}>
              Archive
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void saveMetadata()}
            disabled={archived || !name.trim()}
            title={archived ? "Unarchive this workflow to make changes" : undefined}
          >
            Save metadata
          </button>
        </div>
      </div>

      {archived && (
        <div className="banner banner-warning">
          This workflow is archived. Unarchive it before making changes.
        </div>
      )}
      {error && <div className="banner banner-error">{error}</div>}

      <MetadataCard
        name={name}
        description={description}
        onName={setName}
        onDescription={setDescription}
        readOnly={archived}
      />

      <section className="card section-card">
        <div className="card-header">
          <div>
            <h2>Versions</h2>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)", marginTop: 2 }}>
              Each version is an immutable run-target once published.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void createDraftFromScratch()}
            disabled={archived}
          >
            <IconPlus /> New empty draft
          </button>
        </div>
        <div className="card-body card-body--flush">
          {workflow.versions.length === 0 ? (
            <div className="empty-state">
              <p>No versions yet.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Published</th>
                    <th>Description</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {workflow.versions.map((v) => (
                    <tr key={v.id}>
                      <td className="mono">
                        v{v.version_number}
                        {v.version_label && (
                          <span className="muted" style={{ marginLeft: 6 }}>
                            {v.version_label}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={versionStatusClass(v)}>
                          {versionStatusLabel(v)}
                        </span>
                      </td>
                      <td className="muted">
                        {new Date(v.created_at).toLocaleString()}
                      </td>
                      <td className="muted">
                        {v.published_at
                          ? new Date(v.published_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="muted">{v.description ?? "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onOpenVersion(v.id)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void cloneVersion(v.id)}
                          disabled={archived}
                          title={archived ? "Workflow is archived" : "Create a new draft from this version"}
                        >
                          Clone
                        </button>
                        {v.status === "draft" && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void deleteDraft(v.id, v.version_number)}
                            style={{ color: "var(--danger-600)" }}
                            title="Delete this draft permanently"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
