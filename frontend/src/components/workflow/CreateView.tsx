import { useState } from "react";
import axios from "axios";
import { API_BASE } from "../../constants.ts";
import type { Parameter } from "../../types.ts";
import MetadataCard from "./MetadataCard.tsx";
import VersionContentEditor from "./VersionContentEditor.tsx";
import { errorMessage } from "./errors.ts";
import { IconBack } from "./icons.tsx";
import { useNewParameter } from "./useNewParameter.ts";
import { useStepDrafts } from "./useStepDrafts.ts";

type Props = {
  parameters: Parameter[];
  setParameters: React.Dispatch<React.SetStateAction<Parameter[]>>;
  onCancel: () => void;
  onCreated: () => void;
};

export default function CreateView({
  parameters,
  setParameters,
  onCancel,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [versionDescription, setVersionDescription] = useState("");
  const [selectedParamIds, setSelectedParamIds] = useState<number[]>([]);
  const [error, setError] = useState("");

  const { steps, setSteps, moveStep, addStep, removeStep } = useStepDrafts();
  const newParam = useNewParameter({
    onCreated: (p) => {
      setParameters((prev) => [p, ...prev]);
      setSelectedParamIds((prev) => [...prev, p.id]);
    },
    onError: setError,
  });

  const submit = async () => {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (steps.length === 0 || steps.some((s) => !s.step_name.trim())) {
      setError("Every step needs a name");
      return;
    }
    try {
      await axios.post(`${API_BASE}/workflows`, {
        name: name.trim(),
        description: description.trim() || null,
        initial_version: {
          parameter_ids: selectedParamIds,
          steps,
          description: versionDescription.trim() || null,
        },
      });
      onCreated();
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
            onClick={onCancel}
            style={{ marginBottom: "var(--space-2)" }}
          >
            <IconBack /> Back to workflows
          </button>
          <h1>New workflow</h1>
          <p>Creates a new workflow and a v1 draft to fill in.</p>
        </div>
        <div className="workflow-form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={!name.trim() || steps.some((s) => !s.step_name.trim())}
          >
            Create workflow
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <MetadataCard
        name={name}
        description={description}
        onName={setName}
        onDescription={setDescription}
        readOnly={false}
      />

      <VersionContentEditor
        mode="create"
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
        readOnly={false}
      />
    </>
  );
}
