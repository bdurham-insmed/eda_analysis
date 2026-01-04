import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = "http://localhost:8000";
const INITIATOR_BASE = "http://localhost:8001";
const WS_URL = "ws://localhost:8000/ws/pipelines";

type Parameter = {
  name: string;
  type: string;
  required?: boolean;
  options?: string[];
  default?: string;
  description?: string;
};

type Workflow = {
  id: string;
  name: string;
  description?: string;
  parameters: Parameter[];
};

type Step = {
  name: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
};

type Pipeline = {
  id: string;
  name: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  steps?: Step[];
};

type WebSocketUpdate = {
  pipeline_id: string;
  name: string;
  status: string;
  event_type: string;
  step_name?: string;
  timestamp: number;
};

function App() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [filteredPipelines, setFilteredPipelines] = useState<Pipeline[]>([]);
  const [displayedStatus, setDisplayedStatus] = useState<string>("TOTAL");

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(
    null,
  );
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(
    null,
  );
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize: number = 25;

  useEffect(() => {
    let filtered: Pipeline[];
    if (displayedStatus === "TOTAL") {
      filtered = pipelines;
    } else if (displayedStatus === "RECENT") {
      filtered = pipelines.filter((p) => {
        const start = p.start_time ? new Date(p.start_time).getTime() : 0;
        return Date.now() - start <= 10 * 60 * 1000;
      });
    } else {
      filtered = pipelines.filter((p) => p.status === displayedStatus);
    }
    setFilteredPipelines(filtered);
  }, [pipelines, displayedStatus]);

  const getElapsedTime = (pipeline: Pipeline): string => {
    if (!pipeline.start_time) return "—";
    const start = new Date(pipeline.start_time).getTime();
    const end = pipeline.end_time
      ? new Date(pipeline.end_time).getTime()
      : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
  };

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: number | undefined;
    let attempts: number = 0;

    const connectWebSocket = () => {
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
      socket = new WebSocket(WS_URL);
      socket.onopen = () => {
        console.log("WebSocket connected");
        setWsConnected(true);
        attempts = 0;
      };
      socket.onmessage = (event) => {
        const update: WebSocketUpdate = JSON.parse(event.data);
        const mstimestamp = update.timestamp * 1000;
        setPipelines((prevPipelines) => {
          const found = prevPipelines.some((p) => p.id === update.pipeline_id);
          if (!found) {
            return [
              ...prevPipelines,
              {
                id: update.pipeline_id,
                name: update.name,
                status: update.status,
                start_time: new Date(mstimestamp).toISOString(),
                end_time: null,
                steps: [],
              },
            ];
          }
          return prevPipelines.map((p) =>
            p.id === update.pipeline_id
              ? {
                  ...p,
                  name: update.name,
                  status: update.status,
                  end_time:
                    update.status === "COMPLETED" || update.status === "FAILED"
                      ? new Date(mstimestamp).toISOString()
                      : null,
                }
              : p,
          );
        });
        if (selectedPipeline?.id === update.pipeline_id) {
          fetchPipelineDetails(update.pipeline_id)
            .then()
            .catch((err) => console.error(err));
        }
      };
      socket.onerror = (err) => console.error("WebSocket error", err);
      socket.onclose = (event) => {
        setWsConnected(false);
        attempts++;
        console.log(`WebSocket closed: ${event.reason}`);
        const delay = Math.min(1000 * 2 ** attempts, 10000);
        reconnectTimeout = setTimeout(() => {
          console.log("Attempting to reconnect WebSocket...");
          connectWebSocket();
        }, delay);
      };
    };
    const fetchInitialData = async () => {
      try {
        const [pipelinesRes, workflowsRes] = await Promise.all([
          axios.get<Pipeline[]>(`${API_BASE}/pipelines`),
          axios.get<Workflow[]>(`${INITIATOR_BASE}/workflows`),
        ]);
        setPipelines(pipelinesRes.data);
        setFilteredPipelines(pipelinesRes.data);
        setWorkflows(workflowsRes.data);
      } catch (err) {
        console.error("Failed to load initial data", err);
        setError("Failed to connect to backend");
      }
    };

    fetchInitialData()
      .then()
      .catch((err) => console.error(err));
    connectWebSocket();
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [selectedPipeline]);

  const allStatuses = ["RECENT", "RUNNING", "FAILED", "COMPLETED", "TOTAL"];

  const fetchPipelineDetails = async (id: string) => {
    try {
      const res = await axios.get<Pipeline>(`${API_BASE}/pipelines/${id}`);
      setSelectedPipeline(res.data);
    } catch (err) {
      console.error("Failed to fetch details", err);
    }
  };

  const handleWorkflowSelect = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setFormData({});
    setError("");
  };

  const handleParamChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value as string | number }));
  };

  const filterPipelines = (
    pipelines: Pipeline[],
    status: string,
    search: string = "",
  ): Pipeline[] => {
    let filtered = pipelines;
    if (status === "RECENT") {
      filtered = filtered.filter((p) => {
        const start = p.start_time ? new Date(p.start_time).getTime() : 0;
        return Date.now() - start <= 10 * 60 * 1000;
      });
    } else if (status !== "TOTAL") {
      filtered = filtered.filter((p) => p.status === status);
    }
    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(lowerSearch) ||
          p.id.toLowerCase().includes(lowerSearch),
      );
    }
    return filtered;
  };

  useEffect(() => {
    setFilteredPipelines(
      filterPipelines(
        pipelines,
        displayedStatus,
        (formData.search ?? "") as string,
      ),
    );
    setCurrentPage(1);
  }, [pipelines, displayedStatus, formData.search]);

  const handleFilter = (status: string) => {
    setDisplayedStatus(status);
    setCurrentPage(1);
  };

  const startPipeline = async (count: number) => {
    if (!selectedWorkflow) return;
    setLoading(true);
    setError("");
    try {
        await Promise.all(
      Array.from({ length: count }, () =>
        axios.post(`${INITIATOR_BASE}/start-pipelines`, {
          workflow_id: selectedWorkflow.id,
          parameters: Object.fromEntries(
            Object.entries(formData).filter(([key]) => key !== "count"),
          ),
        }),
      ),
    );
      // for (let i = 0; i < count; i++) {
      //   await axios.post(`${INITIATOR_BASE}/start-pipeline`, {
      //     workflow_id: selectedWorkflow.id,
      //     parameters: Object.fromEntries(
      //       Object.entries(formData).filter(([key]) => key !== "count"),
      //     ),
      //   });
      // }
      const res = await axios.get<Pipeline[]>(`${API_BASE}/pipelines`);
      setPipelines(res.data);
      setSelectedWorkflow(null);
      setFormData({});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to start pipeline");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "RECENT":
        return "#17a2b8";
      case "COMPLETED":
        return "#28a745";
      case "FAILED":
        return "#dc3545";
      case "RUNNING":
        return "#ffc107";
      default:
        return "#6c757d";
    }
  };

  const filteredPipelinesBySearch: Pipeline[] = useMemo(
    () =>
      filterPipelines(
        pipelines,
        displayedStatus,
        (formData.search ?? "") as string,
      ),
    [pipelines, displayedStatus, formData.search],
  );

  const sortedPipelinesByStartTime = useMemo(() => {
    return filteredPipelinesBySearch
      .sort((a, b) => {
        const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
        const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
        return bTime - aTime;
      })
      .slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredPipelinesBySearch, currentPage]);

  return (
    <div id="main-container">
      <div className="ws-status">
        <span
          className={`ws-dot ${wsConnected ? "connected" : "disconnected"}`}
        ></span>
        {wsConnected ? "Connected" : "Disconnected"}
      </div>
      <h1 className="dashboard-title">Pipeline Monitoring Dashboard</h1>
      {!selectedWorkflow ? (
        <section className="workflow-section">
          <h2>Start a New Pipeline</h2>
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
                Number of pipelines to start (max 10,000):
              </label>
              <input
                id="pipeline-count-input"
                type="number"
                min={1}
                max={10000}
                value={formData["count"] ?? 1}
                onChange={(e) => {
                  setError("");
                  handleParamChange("count", e.target.value);
                }}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val > 10000) {
                    setError(
                      "Number of pipelines to start cannot exceed 10,000",
                    );
                    handleParamChange("count", 10000);
                  } else if (val < 1) {
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
      <section>
        <h3>Filter Pipelines</h3>
        <div className="pipeline-summary">
          {allStatuses.map((status) => (
            <div
              className={`pipeline-summary-card${displayedStatus === status ? " selected" : ""}`}
              key={status}
              onClick={() => handleFilter(status)}
              onMouseEnter={(e) => e.currentTarget.classList.add("hover")}
              onMouseLeave={(e) => e.currentTarget.classList.remove("hover")}
            >
              <h3
                style={{
                  color: getStatusColor(status),
                }}
              >
                {status}
              </h3>
              {status === "RECENT" ? (
                <small>
                  {" "}
                  Pipelines started in the last 10 minutes:{" "}
                  {
                    pipelines.filter((p) => {
                      const start = p.start_time
                        ? new Date(p.start_time).getTime()
                        : 0;
                      return Date.now() - start <= 10 * 60 * 1000;
                    }).length
                  }{" "}
                </small>
              ) : (
                <small>
                  There are{" "}
                  {status === "TOTAL"
                    ? pipelines.length
                    : pipelines.filter((p) => p.status === status).length}{" "}
                  pipeline(s)
                </small>
              )}
            </div>
          ))}
        </div>
        {!wsConnected && (
          <p className="warning-msg">
            Warning: WebSocket disconnected. Real-time updates may not be
            available.
          </p>
        )}
        <input
          type="text"
          placeholder="Search by name or ID"
          value={formData.search ?? ""}
          onChange={(e) => handleParamChange("search", e.target.value)}
          className="search-input"
          style={{ marginBottom: 12, width: 250 }}
        />
        {filteredPipelines.length === 0 ? (
          <p>No pipelines found for the selected filter or search.</p>
        ) : (
          <section>
            <p>
              The table below shows the latest pipelines. Click on "Details" to
              view more information about each pipeline.
            </p>
            <table className="pipeline-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPipelinesByStartTime.map((p) => (
                  <tr key={p.id}>
                    <td title={p.id}>{p.id.slice(0, 8)}...</td>
                    <td>{p.name}</td>
                    <td>
                      <span
                        className="status-badge"
                        style={{ background: getStatusColor(p.status) }}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="duration-cell">{getElapsedTime(p)}</td>
                    <td>
                      {p.start_time
                        ? new Date(p.start_time).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {p.end_time ? new Date(p.end_time).toLocaleString() : "—"}
                    </td>
                    <td>
                      <button
                        onClick={() => fetchPipelineDetails(p.id)}
                        className="details-btn"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="page-btn"
              >
                Prev
              </button>
              <span>
                Page {currentPage} of{" "}
                {Math.ceil(filteredPipelinesBySearch.length / pageSize)}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(
                      Math.ceil(filteredPipelinesBySearch.length / pageSize),
                      p + 1,
                    ),
                  )
                }
                disabled={
                  currentPage ===
                    Math.ceil(filteredPipelinesBySearch.length / pageSize) ||
                  filteredPipelinesBySearch.length === 0
                }
                className="page-btn"
              >
                Next
              </button>
            </div>
          </section>
        )}
      </section>
      {selectedPipeline && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedPipeline(null)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{selectedPipeline.name}</h2>
            <p>
              <strong>Status:</strong>{" "}
              <span
                style={{
                  color: getStatusColor(selectedPipeline.status),
                  fontWeight: "bold",
                }}
              >
                {selectedPipeline.status}
              </span>
            </p>
            <p>
              <strong>Duration:</strong> {getElapsedTime(selectedPipeline)}
            </p>
            <p>
              <strong>Started: </strong>
              {selectedPipeline.start_time
                ? new Date(selectedPipeline.start_time).toLocaleString()
                : "—"}
            </p>
            <p>
              <strong>Finished: </strong>
              {selectedPipeline.end_time
                ? new Date(selectedPipeline.end_time).toLocaleString()
                : "—"}
            </p>
            <h3>Steps</h3>
            {selectedPipeline.steps && selectedPipeline.steps.length > 0 ? (
              <ul className="step-list">
                {[...selectedPipeline.steps]
                  .sort((a, b) => {
                    const aStart = a.start_time
                      ? new Date(a.start_time).getTime()
                      : 0;
                    const bStart = b.start_time
                      ? new Date(b.start_time).getTime()
                      : 0;
                    if (aStart !== bStart) return aStart - bStart;
                    const aEnd = a.end_time
                      ? new Date(a.end_time).getTime()
                      : 0;
                    const bEnd = b.end_time
                      ? new Date(b.end_time).getTime()
                      : 0;
                    return aEnd - bEnd;
                  })
                  .map((step, i) => (
                    <li key={i} className="step-item">
                      <strong>{step.name}</strong>: {step.status}
                      {step.start_time &&
                        ` (started: ${new Date(step.start_time).toLocaleTimeString()}`}
                      {step.end_time &&
                        ` → finished: ${new Date(step.end_time).toLocaleTimeString()})`}
                    </li>
                  ))}
              </ul>
            ) : (
              <p>No step details available.</p>
            )}
            <button
              onClick={() => setSelectedPipeline(null)}
              className="close-btn"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
