import { useParams } from "react-router-dom";

/**
 * useArtifactPath — returns a path resolver for dashboard artifact fetches.
 *
 * Derives client and env from the /:client/:env route params, returning
 * /{client}/{env}/current/{dashboardId}/{filename}.
 *
 * Dashboard components pass the result to loadArtifacts() — they require no
 * changes when client/env context changes.
 *
 * Example:
 *   const path = useArtifactPath("dlq_operations");
 *   const res = await fetch(path("manifest.json"));
 *   // → /default/local/current/dlq_operations/manifest.json
 */
export function useArtifactPath(dashboardId) {
  const { client, env } = useParams();
  return (filename) => `/${client}/${env}/current/${dashboardId}/${filename}`;
}
