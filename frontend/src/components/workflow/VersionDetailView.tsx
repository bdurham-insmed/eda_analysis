import { useCallback, useEffect, useState } from "react";
import axios, { AxiosError } from "axios";
import { API_BASE } from "../../constants.ts";
import type { Parameter, WorkflowStep, WorkflowVersion } from "../../types.ts";
import VersionContentEditor from "./VersionContentEditor.tsx";
import { errorMessage } from "./errors.ts";
import { IconBack } from "./icons.tsx";
import {
  type StepDraft,
  emptyStep,
  versionStatusClass,
  versionStatusLabel,
} from "./types.ts";
import { useNewParameter } from "./useNewParameter.ts";

type Props = {
  workflowId: number;
  versionId: number;
  parameters: Parameter[];
  setParameters: React.Dispatch<React.SetStateAction<Parameter[]>>;
  onBack: () => void;
  onChanged: () => void;
};

const stepsFromVersion = (version: WorkflowVersion): StepDraft[] =>
  version.steps
    .slice()
    .sort((a, b) => a.step_order - b.step_order)
    .map<StepDraft>((s: WorkflowStep) => ({
      step_order: s.step_order,
      step_name: s.step_name,
      step_type: s.step_type,
    }));

export default function VersionDetailView({
  workflowId,
  versionId,
  parameters,
  setParameters,
  onBack,
  onChanged,
}: Props) {
  const [version, setVersion] = useState<WorkflowVersion | null>(null);
  const [versionDescription, setVersionDescription] = useState("");
  const [revision, setRevision] = useState(1);
  const [selectedParamIds, setSelectedParamIds] = useState<number[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([{ ...emptyStep }]);
  const [error, setError] = useState("");

  const newParam = useNewParameter({
    onCreated: (p) => {
      setParameters((prev) => [p, ...prev]);
      setSelectedParamIds((prev) => [...prev, p.id]);
    },
    onError: setError,
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await axios.get<WorkflowVersion>(
        `${API_BASE}/workflow-versions/${versionId}`,
      );
      setVersion(res.data);
      setVersionDescription(res.data.description ?? "");
      setRevision(res.data.revision);
      setSelectedParamIds(res.data.parameters.map((p) => p.id));
      setSteps(stepsFromVersion(res.data));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [versionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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

  if (!version) {
    return (
      <>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="empty-state">Loading…</div>
      </>
    );
  }

  const isDraft = version.status === "draft";
  const isArchived = version.archived_at != null;
  const readOnly = !isDraft || isArchived;

  const saveVersion = async () => {
    setError("");
    if (steps.length === 0 || steps.some((s) => !s.step_name.trim())) {
      setError("Every step needs a name");
      return;
    }
    try {
      const res = await axios.put<WorkflowVersion>(
        `${API_BASE}/workflow-versions/${versionId}`,
        {
          parameter_ids: selectedParamIds,
          steps,
          description: versionDescription.trim() || null,
          revision,
        },
      );
      setVersion(res.data);
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

  const publish = async () => {
    if (!confirm("Publish this version? Once published it can't be edited.")) return;
    try {
      const res = await axios.post<WorkflowVersion>(
        `${API_BASE}/workflow-versions/${versionId}/publish`,
      );
      setVersion(res.data);
      setRevision(res.data.revision);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const archive = async () => {
    if (!confirm("Archive this version? It will no longer be selectable for new pipelines.")) return;
    try {
      await axios.post(`${API_BASE}/workflow-versions/${versionId}/archive`);
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const unarchive = async () => {
    try {
      await axios.post(`${API_BASE}/workflow-versions/${versionId}/unarchive`);
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const cloneAsNewDraft = async () => {
    setError("");
    try {
      const res = await axios.post<WorkflowVersion>(
        `${API_BASE}/workflows/${workflowId}/versions`,
        { from_version_id: versionId },
      );
      onChanged();
      // Navigate by re-keying the parent — easiest: replace history via location reload of the version
      // Since we don't have a router, the user can click Back and Open the new version manually.
      // For better UX, surface a banner with a button that calls onChanged + navigates.
      setVersion(res.data);
      setVersionDescription(res.data.description ?? "");
      setRevision(res.data.revision);
      setSelectedParamIds(res.data.parameters.map((p) => p.id));
      setSteps(stepsFromVersion(res.data));
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
            <IconBack /> Back to workflow
          </button>
          <h1>
            v{version.version_number}{" "}
            <span className={versionStatusClass(version)} style={{ marginLeft: "var(--space-2)" }}>
              {versionStatusLabel(version)}
            </span>
          </h1>
          <p>
            Created {new Date(version.created_at).toLocaleString()}
            {version.published_at && (
              <>{" · "}Published {new Date(version.published_at).toLocaleString()}</>
            )}
          </p>
        </div>
        <div className="workflow-form-actions">
          {isArchived && (
            <button type="button" className="btn btn-secondary" onClick={() => void unarchive()}>
              Unarchive
            </button>
          )}
          {!isArchived && (
            <button type="button" className="btn btn-danger" onClick={() => void archive()}>
              Archive
            </button>
          )}
          {isDraft && !isArchived && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void publish()}
              disabled={steps.some((s) => !s.step_name.trim())}
            >
              Publish
            </button>
          )}
          {isDraft && !isArchived && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveVersion()}
              disabled={steps.some((s) => !s.step_name.trim())}
            >
              Save changes
            </button>
          )}
          {!isDraft && !isArchived && (
            <button type="button" className="btn btn-primary" onClick={() => void cloneAsNewDraft()}>
              Clone as new draft
            </button>
          )}
        </div>
      </div>

      {isArchived && (
        <div className="banner banner-warning">
          This version is archived and cannot start new pipelines.
        </div>
      )}
      {!isDraft && !isArchived && (
        <div className="banner banner-warning">
          Published versions are immutable. Clone this version to make changes.
        </div>
      )}
      {error && <div className="banner banner-error">{error}</div>}

      <VersionContentEditor
        mode="edit"
        versionDescription={versionDescription}
        onVersionDescription={setVersionDescription}
        parameters={parameters}
        selectedParamIds={selectedParamIds}
        setSelectedParamIds={setSelectedParamIds}
        steps={steps}
        setSteps={setSteps}
        addStep={addStep}
        moveStep={moveStep}
        removeStep={removeStep}
        showNewParam={newParam.showNewParam}
        setShowNewParam={newParam.setShowNewParam}
        newParam={newParam.newParam}
        setNewParam={newParam.setNewParam}
        submitNewParameter={() => void newParam.submit()}
        readOnly={readOnly}
      />
    </>
  );
}
