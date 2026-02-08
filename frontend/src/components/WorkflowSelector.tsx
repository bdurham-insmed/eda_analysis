import type { Workflow } from "../types.ts";
import { useRef, useState } from "react";
import axios from "axios";
import { INITIATOR_BASE } from "../constants.ts";
import "./WorkflowSelector.css";

type Props = {
  workflows: Workflow[];
  loading: boolean;
  error: string;
  setError: (msg: string) => void;
  setLoading: (loading: boolean) => void;
};

export default function WorkflowSelector({
  workflows,
  error,
  loading,
  setError,
  setLoading
}: Props) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(
    null,
  );
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const handleParamChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value as string | number }));
  };

  const handleWorkflowSelect = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setFormData({});
    setError("");
  };

  const startPipeline = async (count: number) => {
    if (!selectedWorkflow) return;
    setLoading(true);
    setError("");
    try {
          await axios.post(`${INITIATOR_BASE}/jobs`, {
          workflow_id: selectedWorkflow.id,
          parameters: Object.fromEntries(
            Object.entries(formData).filter(([key]) => key !== "count")
          ),
            count: count
        });
      setSelectedWorkflow(null);
      setFormData({});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to start pipeline");
    } finally {
      setLoading(false);
      if (detailsRef.current) {
        detailsRef.current.open = false;
      }
    }
  };

  return (
    <details ref={detailsRef} open={true}>
      <summary>
        <h2>Start a New Pipeline</h2>
      </summary>
      {!selectedWorkflow ? (
        <section className="workflow-section">
          {workflows.length === 0 ? (
            <p>Loading workflows...</p>
          ) : (
            <div className="workflow-list">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => handleWorkflowSelect(wf)}
                  className="workflow-card"
                  onMouseEnter={(e) => e.currentTarget.classList.add("hover")}
                  onMouseLeave={(e) =>
                    e.currentTarget.classList.remove("hover")
                  }
                >
                  <h3>{wf.name}</h3>
                  <p className="workflow-desc">
                    {wf.description || "No description"}
                  </p>
                  <small>
                    {wf.parameters.length} parameter
                    {wf.parameters.length !== 1 ? "s" : ""}
                  </small>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="workflow-detail-section">
          <button
            onClick={() => setSelectedWorkflow(null)}
            className="back-btn"
          >
            🔙
          </button>
          <h2>{selectedWorkflow.name}</h2>
          {selectedWorkflow.description && (
            <p>{selectedWorkflow.description}</p>
          )}
          <div className="param-form">
            <h3>Parameters</h3>
            {selectedWorkflow.parameters.length === 0 ? (
              <p>No parameters required.</p>
            ) : (
              <div className="param-list">
                {selectedWorkflow.parameters.map((param) => (
                  <div key={param.name} className="param-item">
                    <label>
                      {param.name}
                      {param.required && <span className="required">*</span>}
                    </label>
                    {param.options ? (
                      <select
                        value={formData[param.name] ?? param.default ?? ""}
                        onChange={(e) =>
                          handleParamChange(param.name, e.target.value)
                        }
                      >
                        <option value="">---Select---</option>
                        {param.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder={param.default || ""}
                        value={formData[param.name] ?? ""}
                        onChange={(e) =>
                          handleParamChange(param.name, e.target.value)
                        }
                      />
                    )}
                    {param.description && (
                      <small className="param-desc">{param.description}</small>
                    )}
                  </div>
                ))}
              </div>
            )}
            {error && <p className="error-msg">{error}</p>}
            <div className="pipeline-count">
              <label htmlFor="pipeline-count-input">
                Number of pipelines to start (max 2,500):
              </label>
              <input
                id="pipeline-count-input"
                type="number"
                min={1}
                max={2500}
                value={formData["count"] ?? 1}
                onChange={(e) => {
                  setError("");
                  handleParamChange("count", e.target.value);
                }}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val > 2500) {
                    setError(
                      "Number of pipelines to start cannot exceed 2,500",
                    );
                    handleParamChange("count", 2500);
                  } else if (val < 1 || isNaN(val)) {
                    setError("Number of pipelines to start must be at least 1");
                    handleParamChange("count", 1);
                  }
                }}
                disabled={loading}
                aria-label="Amount"
              />
            </div>
            <div className="start-btn-row">
              {selectedWorkflow?.parameters.some(
                (param) =>
                  param.required &&
                  (!formData[param.name] || formData[param.name] === ""),
              ) ? (
                <span className="error-msg">
                  Please fill all required parameters to start pipeline(s).
                </span>
              ) : (
                <button
                  onClick={() =>
                    startPipeline((formData["count"] ?? 1) as number)
                  }
                  disabled={loading}
                  className="start-btn"
                >
                  {loading ? "Starting..." : "Start Pipeline"}
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </details>
  );
}
