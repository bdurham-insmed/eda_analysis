import type { Parameter, ParameterType } from "../../types.ts";
import { IconDown, IconPlus, IconTrash, IconUp } from "./icons.tsx";
import type { ParameterDraft, StepDraft } from "./types.ts";

type Props = {
  mode: "create" | "edit";
  versionDescription: string;
  onVersionDescription: (s: string) => void;
  parameters: Parameter[];
  selectedParamIds: number[];
  setSelectedParamIds: React.Dispatch<React.SetStateAction<number[]>>;
  steps: StepDraft[];
  setSteps: React.Dispatch<React.SetStateAction<StepDraft[]>>;
  addStep: () => void;
  moveStep: (index: number, direction: -1 | 1) => void;
  removeStep: (index: number) => void;
  showNewParam: boolean;
  setShowNewParam: React.Dispatch<React.SetStateAction<boolean>>;
  newParam: ParameterDraft;
  setNewParam: React.Dispatch<React.SetStateAction<ParameterDraft>>;
  submitNewParameter: () => void;
  readOnly: boolean;
};

export default function VersionContentEditor({
  mode,
  versionDescription,
  onVersionDescription,
  parameters,
  selectedParamIds,
  setSelectedParamIds,
  steps,
  setSteps,
  addStep,
  moveStep,
  removeStep,
  showNewParam,
  setShowNewParam,
  newParam,
  setNewParam,
  submitNewParameter,
  readOnly,
}: Props) {
  const visibleParameters = parameters.filter(
    (p) => p.archived_at == null || selectedParamIds.includes(p.id),
  );

  return (
    <div className="workflow-form">
      <section className="card">
        <div className="card-header">
          <h2>{mode === "create" ? "Initial version (v1)" : "Version details"}</h2>
        </div>
        <div className="card-body">
          <div className="field">
            <label htmlFor="version-desc">Description / changelog</label>
            <input
              id="version-desc"
              type="text"
              autoComplete="off"
              value={versionDescription}
              onChange={(e) => onVersionDescription(e.target.value)}
              disabled={readOnly}
              placeholder="What's new in this version?"
            />
          </div>
        </div>
      </section>

      <section className="card section-card">
        <div className="card-header">
          <div>
            <h2>Parameters</h2>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)", marginTop: 2 }}>
              {selectedParamIds.length} selected from catalog
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowNewParam((v) => !v)}
            disabled={readOnly}
          >
            {showNewParam ? "Cancel" : (
              <>
                <IconPlus /> New parameter
              </>
            )}
          </button>
        </div>
        <div className="card-body">
          {visibleParameters.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
              No parameters in the catalog yet. Create one to attach it.
            </p>
          ) : (
            <div className="parameter-pick-list">
              {visibleParameters.map((p) => {
                const checked = selectedParamIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`parameter-pick ${checked ? "parameter-pick--selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      onChange={(e) => {
                        setSelectedParamIds((prev) =>
                          e.target.checked
                            ? [...prev, p.id]
                            : prev.filter((id) => id !== p.id),
                        );
                      }}
                    />
                    <div>
                      <div className="parameter-pick-name">
                        {p.name}
                        {p.archived_at && (
                          <span className="parameter-pick-archived">
                            (archived)
                          </span>
                        )}
                      </div>
                      <div className="parameter-pick-meta">
                        {p.type}
                        {p.required ? " · required" : ""}
                        {p.options ? ` · ${p.options.length} options` : ""}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {showNewParam && !readOnly && (
            <div className="new-parameter">
              <div className="field">
                <label htmlFor="new-param-name">
                  Name <span className="param-field-required">*</span>
                </label>
                <input
                  id="new-param-name"
                  type="text"
                  autoComplete="off"
                  value={newParam.name}
                  onChange={(e) => setNewParam({ ...newParam, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="new-param-type">Type</label>
                <select
                  id="new-param-type"
                  value={newParam.type}
                  onChange={(e) =>
                    setNewParam({
                      ...newParam,
                      type: e.target.value as ParameterType,
                      options: "",
                      default_value: "",
                    })
                  }
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="select">select</option>
                  <option value="boolean">boolean</option>
                  <option value="file">file</option>
                </select>
              </div>
              {newParam.type === "select" && (
                <>
                  <div className="field full">
                    <label htmlFor="new-param-options">Options</label>
                    <input
                      id="new-param-options"
                      type="text"
                      autoComplete="off"
                      placeholder="Comma-separated values"
                      value={newParam.options}
                      onChange={(e) => setNewParam({ ...newParam, options: e.target.value })}
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="new-param-default">Default value</label>
                    <input
                      id="new-param-default"
                      type="text"
                      autoComplete="off"
                      placeholder="Must match one of the options"
                      value={newParam.default_value}
                      onChange={(e) => setNewParam({ ...newParam, default_value: e.target.value })}
                    />
                  </div>
                </>
              )}
              <div className="field full">
                <label htmlFor="new-param-desc">Description</label>
                <input
                  id="new-param-desc"
                  type="text"
                  autoComplete="off"
                  value={newParam.description}
                  onChange={(e) => setNewParam({ ...newParam, description: e.target.value })}
                />
              </div>
              <label
                className="full"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  fontSize: "var(--fs-sm)",
                }}
              >
                <input
                  type="checkbox"
                  checked={newParam.required}
                  onChange={(e) => setNewParam({ ...newParam, required: e.target.checked })}
                />
                Required
              </label>
              <div className="new-parameter-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={submitNewParameter}>
                  Save parameter
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card section-card">
        <div className="card-header">
          <div>
            <h2>Steps</h2>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)", marginTop: 2 }}>
              Ordered execution plan for the pipeline
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={addStep}
            disabled={readOnly}
          >
            <IconPlus /> Add step
          </button>
        </div>
        <div className="card-body card-body--flush">
          <div className="table-wrap">
            <table className="steps-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {steps.map((step, idx) => (
                  <tr key={idx}>
                    <td className="order-cell">{idx + 1}</td>
                    <td>
                      <input
                        type="text"
                        autoComplete="off"
                        placeholder="Step name"
                        value={step.step_name}
                        disabled={readOnly}
                        onChange={(e) => {
                          const next = [...steps];
                          next[idx] = { ...next[idx], step_name: e.target.value };
                          setSteps(next);
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={step.step_type}
                        disabled={readOnly}
                        onChange={(e) => {
                          const next = [...steps];
                          next[idx] = {
                            ...next[idx],
                            step_type: e.target.value as StepDraft["step_type"],
                          };
                          setSteps(next);
                        }}
                      >
                        <option value="processing">processing</option>
                        <option value="analysis">analysis</option>
                        <option value="reporting">reporting</option>
                      </select>
                    </td>
                    <td className="actions-cell">
                      <div className="steps-table-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          disabled={readOnly || idx === 0}
                          onClick={() => moveStep(idx, -1)}
                          aria-label="Move up"
                        >
                          <IconUp />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          disabled={readOnly || idx === steps.length - 1}
                          onClick={() => moveStep(idx, 1)}
                          aria-label="Move down"
                        >
                          <IconDown />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          disabled={readOnly}
                          onClick={() => removeStep(idx)}
                          aria-label="Remove step"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
