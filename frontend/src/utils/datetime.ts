// Server emits naive UTC; append "Z" when no timezone designator is present
// so `new Date(...)` doesn't reinterpret the string as local time.
export const parseIso = (iso: string): Date => {
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasTz ? iso : iso + "Z");
};

export const formatDuration = (
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string => {
  if (!startIso) return "—";
  const start = parseIso(startIso).getTime();
  const end = endIso ? parseIso(endIso).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));

  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24)
    return `${hours}h ${remMinutes.toString().padStart(2, "0")}m`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
};

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return parseIso(iso).toLocaleString();
};

export const formatDateTimeShort = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return parseIso(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatTimeOfDay = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return parseIso(iso).toLocaleTimeString();
};

export const RECENT_WINDOW_MS = 10 * 60 * 1000;

export const isRecent = (
  startIso: string | null | undefined,
  now: number = Date.now(),
): boolean => {
  if (!startIso) return false;
  return now - parseIso(startIso).getTime() <= RECENT_WINDOW_MS;
};
