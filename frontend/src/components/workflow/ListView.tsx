import type { WorkflowSummary } from "../../types.ts";
import { IconPlus } from "./icons.tsx";

type Props = {
  workflows: WorkflowSummary[];
  error: string;
  onCreate: () => void;
  onOpen: (id: number) => void;
};

export default function ListView({ workflows, error, onCreate, onOpen }: Props) {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Workflows</h1>
          <p>Define reusable pipelines and their versions.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          <IconPlus /> New workflow
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <section className="card">
        {workflows.length === 0 ? (
          <div className="empty-state">
            <h3>No workflows yet</h3>
            <p>Create your first workflow to start running pipelines.</p>
            <button type="button" className="btn btn-primary" onClick={onCreate}>
              <IconPlus /> New workflow
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Latest published</th>
                  <th>Versions</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {workflows.map((wf) => (
                  <tr key={wf.id}>
                    <td className="mono muted">{wf.id}</td>
                    <td>{wf.name}</td>
                    <td className="muted">{wf.description ?? "—"}</td>
                    <td className="mono">
                      {wf.latest_published_version_number != null ? (
                        <>
                          v{wf.latest_published_version_number}
                          {wf.latest_published_version_label && (
                            <span className="muted" style={{ marginLeft: 6 }}>
                              {wf.latest_published_version_label}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="mono muted">{wf.version_count}</td>
                    <td>
                      <span
                        className={
                          wf.archived_at ? "status status-archived" : "status status-completed"
                        }
                      >
                        {wf.archived_at ? "Archived" : "Active"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onOpen(wf.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
