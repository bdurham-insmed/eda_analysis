import { useEffect, useState } from "react";

export function useNowTicker(enabled: boolean, intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return tick;
}
