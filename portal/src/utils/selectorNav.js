// Pure helper: compute the target URL after a client or env scope switch.
//
// Route preservation rules (per approved plan):
//   Dashboard page  → preserve dashboardId
//   /history        → preserve /history suffix
//   Run detail      → reset to /history (runId is scope-specific)
//   Compare page    → reset to /history (base/target are scope-specific)
//   Unknown suffix  → reset to /history
//
// dashboardIds: string[] — list of known dashboard IDs (from dashboardMeta)
export function targetUrl(newClient, newEnv, currentClient, currentEnv, pathname, dashboardIds) {
  const prefix = `/${currentClient}/${currentEnv}`;
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";

  // Dashboard page: suffix is exactly "/<dashboardId>"
  const isDashboard = dashboardIds.some(id => suffix === `/${id}`);
  if (isDashboard) return `/${newClient}/${newEnv}${suffix}`;

  // History list
  if (suffix === "/history") return `/${newClient}/${newEnv}/history`;

  // Run detail, compare, or unknown — reset to history
  return `/${newClient}/${newEnv}/history`;
}

// Resolve the env to use when switching clients.
// If newClient supports the current env, keep it.
// Otherwise fall back to the first env in the new client's list.
// Returns null if newClientEntry is missing or has no envs (guard — never produce /undefined/ URL).
export function resolveEnv(newClientEntry, currentEnv) {
  if (!newClientEntry || !newClientEntry.envs || newClientEntry.envs.length === 0) return null;
  return newClientEntry.envs.includes(currentEnv) ? currentEnv : newClientEntry.envs[0];
}
