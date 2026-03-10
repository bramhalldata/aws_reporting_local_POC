import { useState, useEffect } from "react";

// Fetches /platform-manifest.json and derives a scopes list for ClientEnvSelector.
//
// Returns { scopes, loading, error } where:
//   scopes = null               → still loading
//   scopes = []                 → manifest fetched; no bootstrapped clients
//   scopes = [{ client, envs }] → manifest fetched; derived from manifest.clients
//
// On fetch error, scopes remains null and error is set. The selector falls back
// to the current URL scope automatically (see ClientEnvSelector.jsx).
export function usePlatformManifest() {
  const [scopes, setScopes] = useState(null);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    fetch("/platform-manifest.json")
      .then(res => {
        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok || !ct.includes("application/json"))
          throw new Error("platform-manifest.json not available");
        return res.json();
      })
      .then(manifest => {
        const derived = (manifest.clients ?? []).map(c => ({
          client: c.client_id,
          envs:   c.envs.map(e => e.env_id),
        }));
        setScopes(derived);
      })
      .catch(err => {
        console.warn("[usePlatformManifest] fetch failed:", err.message);
        setError(err.message);
      });
  }, []);

  return { scopes, loading: scopes === null && error === null, error };
}
