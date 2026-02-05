export const API_BASE = "http://localhost:8000";
export const INITIATOR_BASE = "http://localhost:8001";
export const WS_URL = "ws://localhost:8000/ws/pipelines";


const StatusColour: Record<string, string> = {
  RECENT: "#17a2b8",
  COMPLETED: "#28a745",
  FAILED: "#dc3545",
  RUNNING: "#ffc107",
  DEFAULT: "#6c757d"
};

export const getStatusColour = (status: string): string =>
  StatusColour[status] || StatusColour.DEFAULT;
