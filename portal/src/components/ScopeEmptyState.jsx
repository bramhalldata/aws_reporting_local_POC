import { theme } from "../theme/cashmereTheme";

// Shown when a configured scope has no artifacts yet (publisher not run for this client/env).
// Visually distinct from the red errorBox — neutral/informational, not alarming.

const styles = {
  container: {
    background: theme.background,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "2rem 1.5rem",
  },
  heading: {
    fontSize: "1rem",
    fontWeight: 600,
    color: theme.textPrimary,
    margin: "0 0 0.6rem 0",
  },
  body: {
    fontSize: "0.875rem",
    color: theme.textSecondary,
    margin: "0 0 0.75rem 0",
  },
  command: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 4,
    padding: "0.6rem 1rem",
    fontFamily: "monospace",
    fontSize: "0.875rem",
    color: theme.textPrimary,
    margin: 0,
    display: "block",
  },
};

export default function ScopeEmptyState({ client, env }) {
  return (
    <div style={styles.container}>
      <p style={styles.heading}>
        No artifacts found for <code>{client} / {env}</code>.
      </p>
      <p style={styles.body}>
        This scope has not been bootstrapped yet. Run the following command to initialize it:
      </p>
      <code style={styles.command}>
        publisher bootstrap --client {client} --env {env}
      </code>
    </div>
  );
}
