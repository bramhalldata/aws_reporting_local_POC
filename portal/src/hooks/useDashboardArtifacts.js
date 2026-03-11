import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useArtifactPath } from "./useArtifactPath.js";

/**
 * useDashboardArtifacts — generic artifact loader for config-driven dashboards.
 *
 * Centralizes the artifact-loading pattern that was previously duplicated in
 * every dashboard page component. Fetches manifest.json first, validates it,
 * then fetches all requested artifact files in parallel.
 *
 * @param {string}   dashboardId    - matches the dashboard directory name
 * @param {string[]} artifactNames  - filenames to fetch (e.g. ["summary.json"])
 *
 * @returns {{ artifacts, loading, error, isScopeEmpty }}
 *   artifacts: { [filename]: parsedJson } — null until loaded
 */
export function useDashboardArtifacts(dashboardId, artifactNames) {
  const { client, env } = useParams();
  const artifactPath = useArtifactPath(dashboardId);

  const [artifacts,    setArtifacts]    = useState(null);
  const [error,        setError]        = useState(null);
  const [isScopeEmpty, setIsScopeEmpty] = useState(false);

  // Stable stringified key so the effect only re-runs when the list changes.
  const artifactKey = useMemo(() => JSON.stringify([...artifactNames].sort()), [artifactNames]);

  useEffect(() => {
    // Reset state on every navigation (client, env, or dashboard change).
    setArtifacts(null);
    setError(null);
    setIsScopeEmpty(false);

    let cancelled = false;

    async function load() {
      // Step 1 — fetch and validate manifest
      const manifestRes = await fetch(artifactPath("manifest.json"));
      const manifestCt  = manifestRes.headers.get("content-type") || "";
      if (!manifestRes.ok || !manifestCt.includes("application/json")) {
        const err = new Error("Scope not bootstrapped.");
        err.isScopeEmpty = true;
        throw err;
      }
      const manifest = await manifestRes.json();
      if (manifest.status !== "SUCCESS") {
        throw new Error(
          `Publisher reported status: "${manifest.status}". Check publisher logs.`
        );
      }

      // Step 2 — validate that manifest declares each required artifact
      for (const name of artifactNames) {
        if (!manifest.artifacts.includes(name)) {
          throw new Error(
            `manifest.json does not list ${name}. Re-run the publisher.`
          );
        }
      }

      // Step 3 — fetch all artifacts in parallel
      const fetchJson = async (filename) => {
        const res = await fetch(artifactPath(filename));
        if (!res.ok) throw new Error(`${filename} not found (HTTP ${res.status}).`);
        return res.json();
      };

      const results = await Promise.all(artifactNames.map(fetchJson));

      // Step 4 — assemble keyed map and include manifest
      const map = { "manifest.json": manifest };
      artifactNames.forEach((name, i) => { map[name] = results[i]; });
      return map;
    }

    load()
      .then((map) => { if (!cancelled) setArtifacts(map); })
      .catch((err) => {
        if (cancelled) return;
        if (err.isScopeEmpty) setIsScopeEmpty(true);
        else setError(err.message);
      });

    return () => { cancelled = true; };

    // Re-fetch whenever the scope, dashboard, or required artifact list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, env, dashboardId, artifactKey]);

  const loading = !artifacts && !error && !isScopeEmpty;
  return { artifacts, loading, error, isScopeEmpty };
}
