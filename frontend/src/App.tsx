import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import "./index.css";
import StartPipelines from "./components/StartPipelines.tsx";
import PipelineDashboard from "./components/PipelineDashboard.tsx";
import PipelineDetailsModal from "./components/PipelineDetailsModal.tsx";
import WorkflowForm from "./components/workflow/WorkflowForm.tsx";
import { API_BASE, WS_URL } from "./constants.ts";
import FilterPipelinesSection from "./components/FilterPipelinesSection.tsx";
import Header from "./components/Header.tsx";
import ToastStack from "./components/ToastStack.tsx";
import type { Toast } from "./components/ToastStack.tsx";
import type {
  Pipeline,
  PipelineStatus,
  WorkflowSummary,
  WebSocketUpdate,
} from "./types.ts";
import { parseHash, buildHash, type Route } from "./routes.ts";
import { parseIso, isRecent } from "./utils/datetime.ts";
import { useNowTicker } from "./hooks/useNowTicker.ts";

const filterPipelines = (
  pipelines: Pipeline[],
  displayedStatus: string,
  search: string | number | undefined,
  now: number,
): Pipeline[] => {
  let filtered = pipelines;
  if (displayedStatus === "RECENT") {
    filtered = filtered.filter((p) => isRecent(p.start_time, now));
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
    const aTime = a.start_time ? parseIso(a.start_time).getTime() : 0;
    const bTime = b.start_time ? parseIso(b.start_time).getTime() : 0;
    return bTime - aTime;
  });

type View = "dashboard" | "manage";

const VIEW_TITLE: Record<View, string> = {
  dashboard: "Pipelines",
  manage: "Workflows",
};

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const IconWorkflows = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="12" cy="18" r="2.5" />
    <path d="M8.5 6h7" />
    <path d="M7.5 8 11 15.5" />
    <path d="M16.5 8 13 15.5" />
  </svg>
);

const IconLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="16" height="16">
    <path d="M4 14a8 8 0 0 1 16 0" />
    <path d="M4 18h16" />
    <path d="M9 6v2" />
    <path d="M15 6v2" />
  </svg>
);

function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const view: View = route.view;
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [displayedStatus, setDisplayedStatus] = useState<string>("TOTAL");
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(
    null,
  );
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [initialLoad, setInitialLoad] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const selectedPipelineRef = useRef<Pipeline | null>(selectedPipeline);
  const seenStatusRef = useRef<Map<string, PipelineStatus>>(new Map());
  const toastTimersRef = useRef<Map<number, number>>(new Map());
  const pageSize: number = 25;

  const setView = useCallback((next: View) => {
    setRoute(next === "manage"
      ? { view: "manage" }
      : { view: "dashboard", pipelineId: null });
  }, []);

  const dismissToast = useCallback((id: number) => {
    const t = toastTimersRef.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      const next = [...prev, { ...toast, id }];
      while (next.length > 4) {
        const dropped = next.shift()!;
        const t = toastTimersRef.current.get(dropped.id);
        if (t !== undefined) {
          clearTimeout(t);
          toastTimersRef.current.delete(dropped.id);
        }
      }
      return next;
    });
    const handle = window.setTimeout(() => dismissToast(id), 6000);
    toastTimersRef.current.set(id, handle);
  }, [dismissToast]);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    };
  }, []);

  const refreshWorkflows = async () => {
    try {
      const res = await axios.get<WorkflowSummary[]>(`${API_BASE}/workflows`);
      setWorkflows(res.data);
    } catch {
      setError("Failed to fetch workflows");
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [pipelinesRes, workflowsRes] = await Promise.all([
          axios.get<Pipeline[]>(`${API_BASE}/pipelines`),
          axios.get<WorkflowSummary[]>(`${API_BASE}/workflows`),
        ]);
        setPipelines(pipelinesRes.data);
        setWorkflows(workflowsRes.data);
        const seen = seenStatusRef.current;
        for (const p of pipelinesRes.data) {
          seen.set(p.id, p.status);
        }
      } catch {
        setError("Failed to connect to backend");
      } finally {
        setInitialLoad(false);
      }
    };
    void fetchInitialData();
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // replaceState (not assignment) so the back button traverses real history
  // entries rather than a chain of hash-only mutations.
  useEffect(() => {
    const target = buildHash(route);
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [route]);

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
        setWsConnected(true);
        attempts = 0;
      };
      socket.onmessage = (event) => {
        const update: WebSocketUpdate = JSON.parse(event.data);
        const mstimestamp = update.timestamp * 1000;
        const prevStatus = seenStatusRef.current.get(update.pipeline_id);
        if (update.status === "FAILED" && prevStatus !== "FAILED") {
          pushToast({
            kind: "error",
            title: "Pipeline failed",
            message: update.name,
            pipelineId: update.pipeline_id,
          });
        }
        seenStatusRef.current.set(update.pipeline_id, update.status);
        const newEndTime =
          update.status === "COMPLETED" || update.status === "FAILED"
            ? new Date(mstimestamp).toISOString()
            : null;
        setPipelines((prev) => {
          const idx = prev.findIndex((p) => p.id === update.pipeline_id);
          if (idx === -1) {
            return [
              ...prev,
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
          const cur = prev[idx];
          if (
            cur.name === update.name &&
            cur.status === update.status &&
            cur.end_time === newEndTime
          ) {
            return prev;
          }
          const next = prev.slice();
          next[idx] = {
            ...cur,
            name: update.name,
            status: update.status,
            end_time: newEndTime,
          };
          return next;
        });
        if (selectedPipelineRef.current?.id === update.pipeline_id) {
          fetchPipelineDetails(update.pipeline_id).catch((err) =>
            console.error(err),
          );
        }
      };
      socket.onerror = (err) => console.error("WebSocket error", err);
      socket.onclose = () => {
        setWsConnected(false);
        attempts++;
        const delay = Math.min(1000 * 2 ** attempts, 10000);
        reconnectTimeout = setTimeout(connectWebSocket, delay);
      };
    };

    connectWebSocket();
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) socket.close();
    };
  }, [pushToast]);

  const fetchPipelineDetails = async (id: string) => {
    try {
      const res = await axios.get<Pipeline>(`${API_BASE}/pipelines/${id}`);
      setSelectedPipeline(res.data);
    } catch (err) {
      console.error("Failed to fetch details", err);
    }
  };

  const openPipeline = useCallback((id: string) => {
    setRoute({ view: "dashboard", pipelineId: id });
  }, []);

  const closePipeline = useCallback(() => {
    setRoute((r) =>
      r.view === "dashboard" ? { view: "dashboard", pipelineId: null } : r,
    );
  }, []);

  // Route is the source of truth; selectedPipeline is the fetched payload cache.
  useEffect(() => {
    if (route.view !== "dashboard") return;
    if (!route.pipelineId) {
      if (selectedPipeline) setSelectedPipeline(null);
      return;
    }
    if (selectedPipeline?.id === route.pipelineId) return;
    void fetchPipelineDetails(route.pipelineId);
  }, [route, selectedPipeline]);

  const handleParamChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value as string | number }));
  };

  const handleFilter = (status: string) => {
    setDisplayedStatus(status);
    setCurrentPage(1);
  };

  // 30-second tick so the RECENT bucket re-evaluates while the user lingers.
  const recentTick = useNowTicker(displayedStatus === "RECENT", 30000);
  const filteredPipelines = useMemo(
    () => filterPipelines(pipelines, displayedStatus, formData.search, Date.now()),
    // recentTick drives freshness for the RECENT bucket only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pipelines, displayedStatus, formData.search, recentTick],
  );

  const paginatedPipelines = useMemo(
    () =>
      sortPipelines(filteredPipelines).slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      ),
    [filteredPipelines, currentPage],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <IconLogo />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">EDA Analysis</span>
            <span className="sidebar-brand-env">Development</span>
          </div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-label">Workspace</div>
          <nav className="sidebar-nav">
            <button
              type="button"
              className={`sidebar-nav-item ${view === "dashboard" ? "active" : ""}`}
              onClick={() => setView("dashboard")}
            >
              <IconDashboard /> Pipelines
            </button>
            <button
              type="button"
              className={`sidebar-nav-item ${view === "manage" ? "active" : ""}`}
              onClick={() => setView("manage")}
            >
              <IconWorkflows /> Workflows
            </button>
          </nav>
        </div>
        <div className="sidebar-footer">v0.1 · single-version dev</div>
      </aside>

      <main>
        <Header title={VIEW_TITLE[view]} wsConnected={wsConnected} />

        <div className="page">
          {view === "dashboard" ? (
            <>
              <div className="page-header">
                <div>
                  <h1>Pipelines</h1>
                  <p>Live view of pipeline runs across all workflows.</p>
                </div>
              </div>

              <StartPipelines
                workflows={workflows}
                loading={loading}
                error={error}
                setError={setError}
                setLoading={setLoading}
                refreshWorkflows={() => void refreshWorkflows()}
              />
              <FilterPipelinesSection
                pipelines={pipelines}
                formData={formData}
                displayedStatus={displayedStatus}
                handleParamChange={handleParamChange}
                handleFilter={handleFilter}
                initialLoad={initialLoad}
              />
              <PipelineDashboard
                pipelines={filteredPipelines}
                paginatedPipelines={paginatedPipelines}
                currentPage={currentPage}
                pageSize={pageSize}
                setCurrentPage={setCurrentPage}
                onSelectPipeline={openPipeline}
                initialLoad={initialLoad}
                disableKeyboardNav={selectedPipeline !== null}
              />
              {selectedPipeline && (
                <PipelineDetailsModal
                  pipeline={selectedPipeline}
                  onClose={closePipeline}
                />
              )}
            </>
          ) : (
            <WorkflowForm onSaved={() => void refreshWorkflows()} />
          )}
        </div>
      </main>
      <ToastStack toasts={toasts} onDismiss={dismissToast} onOpen={openPipeline} />
    </div>
  );
}

export default App;
