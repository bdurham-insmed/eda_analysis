import { useEffect, useRef, useState } from "react";
import type { Pipeline, PipelineStatus } from "../types.ts";
import { useNowTicker } from "../hooks/useNowTicker.ts";
import { formatDuration, formatDateTimeShort } from "../utils/datetime.ts";
import "./PipelineDashboard.css";

type Props = {
  pipelines: Pipeline[];
  paginatedPipelines: Pipeline[];
  currentPage: number;
  pageSize: number;
  setCurrentPage: (n: number | ((p: number) => number)) => void;
  onSelectPipeline: (id: string) => void;
  initialLoad?: boolean;
  /** Disable keyboard nav while a modal/dialog owns focus. */
  disableKeyboardNav?: boolean;
};

const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
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

const IconInbox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5Z" />
  </svg>
);

const SkeletonRow = () => (
  <tr className="row-skeleton" aria-hidden="true">
    <td><span className="skeleton skeleton--id" /></td>
    <td><span className="skeleton skeleton--text" /></td>
    <td><span className="skeleton skeleton--pill" /></td>
    <td><span className="skeleton skeleton--mono" /></td>
    <td><span className="skeleton skeleton--text" /></td>
    <td><span className="skeleton skeleton--text" /></td>
    <td />
  </tr>
);

export default function PipelineDashboard({
  pipelines,
  paginatedPipelines,
  currentPage,
  pageSize,
  setCurrentPage,
  onSelectPipeline,
  initialLoad = false,
  disableKeyboardNav = false,
}: Props) {
  const lastPage = Math.max(1, Math.ceil(pipelines.length / pageSize));
  const rangeStart = pipelines.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, pipelines.length);

  const hasRunning = paginatedPipelines.some((p) => p.status === "RUNNING");
  useNowTicker(hasRunning);

  // Cursor carries its page so a page change resets it during render (no setState-in-effect).
  const [cursor, setCursor] = useState<{ page: number; index: number }>({
    page: currentPage,
    index: 0,
  });
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const didMountRef = useRef(false);

  let activeIndex = cursor.index;
  if (cursor.page !== currentPage) {
    activeIndex = 0;
    setCursor({ page: currentPage, index: 0 });
  } else if (activeIndex > paginatedPipelines.length - 1) {
    activeIndex = Math.max(0, paginatedPipelines.length - 1);
  }
  const setActiveIndex = (
    next: number | ((prev: number) => number),
  ) => {
    setCursor((c) => ({
      page: currentPage,
      index: typeof next === "function" ? next(c.index) : next,
    }));
  };

  // Ref mirror keeps the keydown listener stable across cursor/row updates.
  const navRef = useRef({
    rows: paginatedPipelines,
    index: activeIndex,
    lastPage,
    currentPage,
  });
  useEffect(() => {
    navRef.current = {
      rows: paginatedPipelines,
      index: activeIndex,
      lastPage,
      currentPage,
    };
  });

  useEffect(() => {
    if (disableKeyboardNav) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { rows, index, lastPage: lp, currentPage: cp } = navRef.current;
      if (rows.length === 0) return;
      const moveTo = (next: number) =>
        setCursor({ page: cp, index: Math.max(0, Math.min(rows.length - 1, next)) });
      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault();
          moveTo(index + 1);
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          moveTo(index - 1);
          break;
        case "Enter":
          e.preventDefault();
          if (rows[index]) onSelectPipeline(rows[index].id);
          break;
        case "PageDown":
          e.preventDefault();
          setCurrentPage((p) => Math.min(lp, p + 1));
          break;
        case "PageUp":
          e.preventDefault();
          setCurrentPage((p) => Math.max(1, p - 1));
          break;
        case "Home":
          e.preventDefault();
          moveTo(0);
          break;
        case "End":
          e.preventDefault();
          moveTo(rows.length - 1);
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [disableKeyboardNav, onSelectPipeline, setCurrentPage]);

  // Skip first mount; "auto" prevents smooth-scroll fighting held arrow keys.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const row = tbodyRef.current?.children[activeIndex] as
      | HTMLElement
      | undefined;
    row?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [activeIndex]);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Pipeline runs</h2>
        </div>
        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
          {initialLoad ? "Loading…" : `${pipelines.length.toLocaleString()} total`}
        </span>
      </div>

      {!initialLoad && pipelines.length === 0 ? (
        <div className="empty-state">
          <IconInbox />
          <h3>No pipelines yet</h3>
          <p>Start one from the panel above, or adjust your filters.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table table--interactive">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody
                ref={tbodyRef}
                aria-label="Pipeline runs (use arrow keys to navigate, Enter to open)"
              >
                {initialLoad ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : (
                  paginatedPipelines.map((p, i) => (
                    <tr
                      key={p.id}
                      className={i === activeIndex ? "row-active" : ""}
                      onClick={() => {
                        setActiveIndex(i);
                        onSelectPipeline(p.id);
                      }}
                    >
                      <td className="id-cell" title={p.id}>
                        {p.id.slice(0, 8)}
                      </td>
                      <td>
                        {p.name}
                        {p.version_number != null && (
                          <span className="muted mono" style={{ marginLeft: 8, fontSize: "0.85em" }}>
                            v{p.version_number}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={statusClass(p.status)}>{p.status}</span>
                      </td>
                      <td className="duration-cell">{formatDuration(p.start_time, p.end_time)}</td>
                      <td className="muted">{formatDateTimeShort(p.start_time)}</td>
                      <td className="muted">{formatDateTimeShort(p.end_time)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPipeline(p.id);
                          }}
                          className="btn btn-ghost btn-sm"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {initialLoad
                ? "—"
                : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${pipelines.length.toLocaleString()}`}
            </span>
            <div className="pagination-pages">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                className="btn btn-secondary btn-sm"
                disabled={initialLoad || currentPage === 1}
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={initialLoad || currentPage === 1}
                className="btn btn-secondary btn-sm"
              >
                Prev
              </button>
              <span style={{ alignSelf: "center", padding: "0 var(--space-3)" }}>
                Page {currentPage} of {lastPage}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(lastPage, p + 1))}
                disabled={initialLoad || currentPage === lastPage}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(lastPage)}
                className="btn btn-secondary btn-sm"
                disabled={initialLoad || currentPage === lastPage}
              >
                Last
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
