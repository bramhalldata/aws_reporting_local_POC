/**
 * useArtifactPath — returns a path resolver for dashboard artifact fetches.
 *
 * Phase 1: returns the static path /<dashboardId>/<filename>
 * Phase 2: will accept clientId and env, returning /<clientId>/<env>/<dashboardId>/<filename>
 *
 * New dashboard components should use this hook instead of constructing paths directly.
 * This allows Phase 2 client/env scoping to be introduced without modifying component logic.
 *
 * Example:
 *   const path = useArtifactPath("dlq_operations");
 *   const res = await fetch(path("manifest.json")); // → /dlq_operations/manifest.json
 */
export function useArtifactPath(dashboardId) {
  return (filename) => `/${dashboardId}/${filename}`;
}
