import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../../constants.ts";
import type { Parameter, WorkflowSummary } from "../../types.ts";
import CreateView from "./CreateView.tsx";
import ListView from "./ListView.tsx";
import VersionDetailView from "./VersionDetailView.tsx";
import WorkflowDetailView from "./WorkflowDetailView.tsx";
import { errorMessage } from "./errors.ts";
import type { Mode } from "./types.ts";
import "./WorkflowForm.css";

type Props = {
  onSaved: () => void;
};

export default function WorkflowForm({ onSaved }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const [wfRes, pRes] = await Promise.all([
        axios.get<WorkflowSummary[]>(`${API_BASE}/workflows?include_archived=true`),
        axios.get<Parameter[]>(`${API_BASE}/workflow-parameters`),
      ]);
      setWorkflows(wfRes.data);
      setParameters(pRes.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const onChanged = async () => {
    await refresh();
    onSaved();
  };

  if (mode.kind === "list") {
    return (
      <ListView
        workflows={workflows}
        error={error}
        onCreate={() => setMode({ kind: "create" })}
        onOpen={(id) => setMode({ kind: "workflow", id })}
      />
    );
  }
  if (mode.kind === "create") {
    return (
      <CreateView
        parameters={parameters}
        setParameters={setParameters}
        onCancel={() => setMode({ kind: "list" })}
        onCreated={() => {
          setMode({ kind: "list" });
          void onChanged();
        }}
      />
    );
  }
  if (mode.kind === "workflow") {
    return (
      <WorkflowDetailView
        workflowId={mode.id}
        onBack={() => setMode({ kind: "list" })}
        onOpenVersion={(versionId) =>
          setMode({ kind: "version", workflowId: mode.id, versionId })
        }
        onChanged={() => void onChanged()}
      />
    );
  }
  return (
    <VersionDetailView
      workflowId={mode.workflowId}
      versionId={mode.versionId}
      parameters={parameters}
      setParameters={setParameters}
      onBack={() => setMode({ kind: "workflow", id: mode.workflowId })}
      onChanged={() => void onChanged()}
    />
  );
}
