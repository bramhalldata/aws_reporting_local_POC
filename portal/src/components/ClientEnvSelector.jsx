import { useParams, useNavigate, useLocation } from "react-router-dom";
import { usePlatformManifest } from "../hooks/usePlatformManifest.js";
import { dashboardMeta } from "../dashboards/index.js";
import { targetUrl, resolveEnv } from "../utils/selectorNav.js";
import { theme } from "../theme/cashmereTheme.js";

const dashboardIds = dashboardMeta.map(d => d.id);

const styles = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  },
  select: {
    fontSize: "0.75rem",
    color: theme.textPrimary,
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: "4px",
    padding: "0.1rem 0.25rem",
    cursor: "pointer",
  },
  separator: {
    fontSize: "0.75rem",
    color: theme.textMuted,
  },
};

export default function ClientEnvSelector() {
  const { client, env } = useParams();
  const { scopes }      = usePlatformManifest();
  const navigate        = useNavigate();
  const location        = useLocation();

  // While loading (scopes === null) or on error, fall back to current URL scope.
  // Also ensure current client always appears even if manifest resolved but is empty
  // or does not yet include the active scope (e.g., first load before manifest generated).
  const resolved        = scopes ?? [];
  const effectiveScopes = resolved.some(s => s.client === client)
    ? resolved
    : [{ client, envs: [env] }, ...resolved];

  const clients      = effectiveScopes.map(s => s.client);
  const currentEntry = effectiveScopes.find(s => s.client === client)
    ?? { client, envs: [env] };
  const envs = currentEntry.envs;

  function handleClientChange(e) {
    const newClient      = e.target.value;
    const newClientEntry = effectiveScopes.find(s => s.client === newClient);
    const newEnv         = resolveEnv(newClientEntry, env);
    if (newEnv === null) return; // guard: empty envs — no-op
    navigate(targetUrl(newClient, newEnv, client, env, location.pathname, dashboardIds));
  }

  function handleEnvChange(e) {
    const newEnv = e.target.value;
    navigate(targetUrl(client, newEnv, client, env, location.pathname, dashboardIds));
  }

  return (
    <div style={styles.wrapper}>
      <select style={styles.select} value={client} onChange={handleClientChange}>
        {clients.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <span style={styles.separator}>/</span>
      <select style={styles.select} value={env} onChange={handleEnvChange}>
        {envs.map(e => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>
    </div>
  );
}
