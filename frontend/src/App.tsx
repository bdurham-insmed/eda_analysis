import { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import "./App.css";
import WorkflowSelector from "./components/WorkflowSelector.tsx";
import { API_BASE, INITIATOR_BASE, WS_URL } from "./constants.ts";
import FilterPipelinesSection from "./components/FilterPipelinesSection.tsx";
import Header from "./components/Header.tsx";
import type { Pipeline, Workflow, Step, WebSocketUpdate } from "./types.ts";
import { getStatusColour } from "./constants.ts";

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
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const filterPipelines = (
  pipelines: Pipeline[],
  displayedStatus: string,
  search: string | number | undefined,
): Pipeline[] => {
  let filtered = pipelines;
  if (displayedStatus === "RECENT") {
    filtered = filtered.filter((p) => {
      const start = p.start_time ? new Date(p.start_time).getTime() : 0;
      return Date.now() - start <= 10 * 60 * 1000;
    });
  } else if (displayedStatus !== "TOTAL") {
    filtered = filtered.filter((p) => p.status === displayedStatus);
  }
  if (search) {
    const lowerSearch = (search as string).toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerSearch) ||
        p.id.toLowerCase().includes(lowerSearch),
    );
  }
  return filtered;
};

const sortPipelines = (pipelines: Pipeline[]): Pipeline[] =>
  [...pipelines].sort((a, b) => {
    const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
    const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
    return bTime - aTime;
  });

function App() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [displayedStatus, setDisplayedStatus] = useState<string>("TOTAL");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(
    null,
  );
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const selectedPipelineRef = useRef<Pipeline>(selectedPipeline);
  const pageSize: number = 25;

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [pipelinesRes, workflowsRes] = await Promise.all([
          axios.get<Pipeline[]>(`${API_BASE}/pipelines`),
          axios.get<Workflow[]>(`${INITIATOR_BASE}/workflows`),
        ]);
        setPipelines(pipelinesRes.data);
        setWorkflows(workflowsRes.data);
      } catch {
        setError("Failed to connect to backend");
      }
    };
    fetchInitialData();
  }, []);
  useEffect(() => {
    setCurrentPage(1);
  }, [displayedStatus, formData.search]);

  useEffect(() => {
    selectedPipelineRef.current = selectedPipeline;
  }, [selectedPipeline]);

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
        if (selectedPipelineRef.current?.id === update.pipeline_id) {
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

    connectWebSocket();
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) socket.close();
    };
  }, []);

  const fetchPipelineDetails = async (id: string) => {
    try {
      const res = await axios.get<Pipeline>(`${API_BASE}/pipelines/${id}`);
      setSelectedPipeline(res.data);
    } catch (err) {
      console.error("Failed to fetch details", err);
    }
  };

  const handleParamChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value as string | number }));
  };

  const handleFilter = (status: string) => {
    setDisplayedStatus(status);
    setCurrentPage(1);
  };

  const filteredPipelines = useMemo(
    () => filterPipelines(pipelines, displayedStatus, formData.search),
    [pipelines, displayedStatus, formData.search],
  );

  const paginatedPipelines = useMemo(
    () =>
      sortPipelines(filteredPipelines).slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      ),
    [filteredPipelines, currentPage],
  );

  const renderStepTimes = (step: Step) => (
    <>
      {step.start_time && (
        <> (started: {new Date(step.start_time).toLocaleTimeString()})</>
      )}
      {step.end_time && (
        <> → finished: {new Date(step.end_time).toLocaleTimeString()})</>
      )}
    </>
  );
  return (
    <div id="main-container">
      <Header wsConnected={wsConnected} />
      <WorkflowSelector
        workflows={workflows}
        loading={loading}
        error={error}
        setError={setError}
        setLoading={setLoading}
      />
      <FilterPipelinesSection
        pipelines={pipelines}
        formData={formData}
        displayedStatus={displayedStatus}
        handleParamChange={handleParamChange}
        handleFilter={handleFilter}
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
              {paginatedPipelines.map((p) => (
                <tr key={p.id}>
                  <td title={p.id}>{p.id.slice(0, 8)}...</td>
                  <td>{p.name}</td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ background: getStatusColour(p.status) }}
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
              onClick={() => setCurrentPage(1)}
              className="page-btn"
              disabled={currentPage === 1}
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="page-btn"
            >
              Prev
            </button>
            <span>
              Page {currentPage} of{" "}
              {Math.max(1, Math.ceil(filteredPipelines.length / pageSize))}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) =>
                  Math.min(
                    Math.ceil(filteredPipelines.length / pageSize),
                    p + 1,
                  ),
                )
              }
              disabled={
                currentPage ===
                  Math.ceil(filteredPipelines.length / pageSize) ||
                filteredPipelines.length === 0
              }
              className="page-btn"
            >
              Next
            </button>
            <button
              onClick={() =>
                setCurrentPage(Math.ceil(filteredPipelines.length / pageSize))
              }
              className="page-btn"
              disabled={
                currentPage === Math.ceil(filteredPipelines.length / pageSize)
              }
            >
              Last
            </button>
          </div>
        </section>
      )}
      {selectedPipeline && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedPipeline(null)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{selectedPipeline.name}</h2>
            <p>
              <strong>ID:</strong> {selectedPipeline.id}
            </p>
            <p>
              <strong>Status: </strong>
              <span
                style={{
                  color: getStatusColour(selectedPipeline.status),
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
                    const getTime = (date: string | null) =>
                      date ? new Date(date).getTime() : 0;
                    const aStart = getTime(a.start_time);
                    const bStart = getTime(b.start_time);
                    if (aStart !== bStart) return aStart - bStart;
                    const aEnd = getTime(a.end_time);
                    const bEnd = getTime(b.end_time);
                    return aEnd - bEnd;
                  })
                  .map((step, i) => (
                    <li key={i} className="step-item">
                      <strong>{step.name}</strong>: {step.status}
                      {renderStepTimes(step)}
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
