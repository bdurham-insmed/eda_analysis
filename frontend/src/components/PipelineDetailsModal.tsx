import { useEffect, useMemo } from "react";
import type { Pipeline, PipelineStatus, Step } from "../types.ts";
import { useNowTicker } from "../hooks/useNowTicker.ts";
import {
  formatDuration,
  formatDateTime,
  formatTimeOfDay,
  parseIso,
} from "../utils/datetime.ts";
import "./PipelineDetailsModal.css";

const getProgressLabel = (steps: Step[], completed: number): string => {
  if (steps.some((s) => s.status === "FAILED")) return "Halted";
  if (steps.some((s) => s.status === "RUNNING")) return "In progress";
  if (completed === steps.length) return "Done";
  return "Pending";
};

type Props = {
  pipeline: Pipeline;
  onClose: () => void;
};

const renderParameterValue = (value: unknown) => {
  if (value === null || value === undefined) return <em className="muted">—</em>;
  if (typeof value === "string") {
    if (value.startsWith("gs://")) return <code>{value}</code>;
    return value;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  return <code>{JSON.stringify(value)}</code>;
};

const statusClass = (status: PipelineStatus): string => {
  switch (status) {
    case "RUNNING":
      return "status status-running";
    case "COMPLETED":
      return "status status-completed";
    case "FAILED":
      return "status status-failed";
    default:
      return "status status-pending";
  }
};

const stepMarkerClass = (status: PipelineStatus): string => {
  if (status === "RUNNING") return "step-marker step-marker--running";
  if (status === "COMPLETED") return "step-marker step-marker--completed";
  if (status === "FAILED") return "step-marker step-marker--failed";
  return "step-marker";
};

const StepIcon = ({ status }: { status: PipelineStatus }) => {
  if (status === "COMPLETED") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="var(--success-700)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 8.5 6.5 12 13 5" />
      </svg>
    );
  }
  if (status === "FAILED") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="var(--danger-700)" strokeWidth="2.5"
        strokeLinecap="round" aria-hidden="true">
        <line x1="4" y1="4" x2="12" y2="12" />
        <line x1="12" y1="4" x2="4" y2="12" />
      </svg>
    );
  }
  if (status === "RUNNING") {
    return (
      <svg viewBox="0 0 16 16" fill="var(--accent-600)" aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
      </svg>
    );
  }
  return null;
};

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function PipelineDetailsModal({ pipeline, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useNowTicker(pipeline.status === "RUNNING");

  const sortedSteps: Step[] = useMemo(() => {
    return [...(pipeline.steps ?? [])].sort((a, b) => {
      const aOrder = a.step_order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.step_order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const getTime = (date: string | null) =>
        date ? parseIso(date).getTime() : 0;
      const aStart = getTime(a.start_time);
      const bStart = getTime(b.start_time);
      if (aStart !== bStart) return aStart - bStart;
      return getTime(a.end_time) - getTime(b.end_time);
    });
  }, [pipeline.steps]);

  const completedCount = sortedSteps.filter((s) => s.status === "COMPLETED").length;
  const progressLabel = getProgressLabel(sortedSteps, completedCount);

  const parameterEntries = pipeline.parameter_values
    ? Object.entries(pipeline.parameter_values)
    : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <aside className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>{pipeline.name}</h2>
            <div className="id">{pipeline.id}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            aria-label="Close panel"
          >
            <IconClose />
          </button>
        </header>

        <div className="modal-body">
          <section className="detail-section">
            <h3>Run details</h3>
            <dl className="detail-grid">
              <dt>Status</dt>
              <dd>
                <span className={statusClass(pipeline.status)}>{pipeline.status}</span>
              </dd>
              <dt>Workflow</dt>
              <dd>
                {pipeline.name}
                {pipeline.version_number != null && (
                  <span className="mono" style={{ marginLeft: 6 }}>
                    v{pipeline.version_number}
                  </span>
                )}
                {pipeline.workflow_id != null && (
                  <span className="muted"> · #{pipeline.workflow_id}</span>
                )}
              </dd>
              <dt>Duration</dt>
              <dd className="mono">{formatDuration(pipeline.start_time, pipeline.end_time)}</dd>
              <dt>Started</dt>
              <dd>{formatDateTime(pipeline.start_time)}</dd>
              <dt>Finished</dt>
              <dd>{formatDateTime(pipeline.end_time)}</dd>
            </dl>
          </section>

          {parameterEntries.length > 0 && (
            <section className="detail-section">
              <h3>Parameters</h3>
              <dl className="parameter-list">
                {parameterEntries.map(([k, v]) => (
                  <div className="parameter-row" key={k}>
                    <dt>{k}</dt>
                    <dd>{renderParameterValue(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="detail-section">
            <h3>Steps</h3>
            {sortedSteps.length > 0 && (
              <div
                className="step-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={sortedSteps.length}
                aria-valuenow={completedCount}
                aria-label={`${completedCount} of ${sortedSteps.length} steps complete`}
              >
                <div className="step-progress-meta">
                  <span className="step-progress-count">
                    {completedCount} of {sortedSteps.length} complete
                  </span>
                  <span className="step-progress-state">{progressLabel}</span>
                </div>
                <div className="step-progress-track">
                  {sortedSteps.map((step, i) => (
                    <span
                      key={i}
                      className={`step-progress-segment step-progress-segment--${step.status.toLowerCase()}`}
                      title={`${step.name} · ${step.status}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {sortedSteps.length > 0 ? (
              <div className="step-timeline">
                {sortedSteps.map((step, i) => (
                  <div className="step-timeline-item" key={i}>
                    <div className={stepMarkerClass(step.status)}>
                      <StepIcon status={step.status} />
                    </div>
                    <div className="step-body">
                      <div className="step-name">{step.name}</div>
                      <div className="step-meta">
                        {step.status}
                        {step.start_time && (
                          <>
                            {" · started "}
                            {formatTimeOfDay(step.start_time)}
                          </>
                        )}
                        {step.end_time && (
                          <>
                            {" · finished "}
                            {formatTimeOfDay(step.end_time)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                No step details available.
              </p>
            )}
          </section>
        </div>

        <footer className="modal-foot">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </footer>
      </aside>
    </div>
  );
}
