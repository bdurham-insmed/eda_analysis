export type Route =
  | { view: "dashboard"; pipelineId: string | null }
  | { view: "manage" };

export const routes = {
  pipelines: () => "#/pipelines",
  pipeline: (id: string) => `#/pipelines/${encodeURIComponent(id)}`,
  workflows: () => "#/workflows",
};

export const parseHash = (hash: string): Route => {
  const clean = hash.replace(/^#\/?/, "");
  if (clean.startsWith("workflows")) return { view: "manage" };
  const m = clean.match(/^pipelines\/([^/?]+)/);
  if (m) return { view: "dashboard", pipelineId: decodeURIComponent(m[1]) };
  return { view: "dashboard", pipelineId: null };
};

export const buildHash = (route: Route): string => {
  if (route.view === "manage") return routes.workflows();
  if (route.pipelineId) return routes.pipeline(route.pipelineId);
  return routes.pipelines();
};
