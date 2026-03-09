/**
 * useArtifactPath — returns a path resolver for dashboard artifact fetches.
 *
 * Phase 1: returns the path /current/<dashboardId>/<filename>
 *   Aligns with publicDir: ../artifacts — current-run artifacts are under /current/.
 *
 * Phase 2: will accept clientId and env, returning /<clientId>/<env>/current/<dashboardId>/<filename>
 *   No component changes required — only this hook needs updating.
 *
 * New dashboard components should use this hook instead of constructing paths directly.
 *
 * Example:
 *   const path = useArtifactPath("dlq_operations");
 *   const res = await fetch(path("manifest.json")); // → /current/dlq_operations/manifest.json
 */
export function useArtifactPath(dashboardId) {
  return (filename) => `/current/${dashboardId}/${filename}`;
}
