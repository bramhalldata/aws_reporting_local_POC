# Plan: Replace Trend Table with Line Chart

## Context

The portal currently renders `trend_30d.json` as a plain HTML table (the `TrendTable` component in
`portal/src/App.jsx`). A 30-day time series is much easier to read as a line chart. This plan
replaces the table with a Recharts line chart while keeping all architecture constraints:
metrics stay in SQL, the artifact contract is unchanged, and the portal remains presentation-only.

---

## Architecture Compliance

| Requirement | How it is met |
|-------------|--------------|
| Metrics defined in SQL | `trend_30d` block in `sql/athena_views.sql` is unchanged |
| Publisher generates artifact | `src/publisher/main.py` is unchanged |
| Artifact schema unchanged | `trend_30d_schema.py` and `trend_30d.json` contract are unchanged |
| Portal is presentation-only | Recharts renders `trend_30d.days` directly; no computation in React |

---

## Artifact Data Shape (unchanged)

```json
{
  "days": [
    { "date": "2026-02-06", "failures": 0 },
    { "date": "2026-02-07", "failures": 12 },
    ...
  ]
}
```

This array maps directly to Recharts `data` prop. No transformation needed beyond passing it in.

---

## Impacted Layers

| Layer | Change |
|-------|--------|
| SQL (`sql/athena_views.sql`) | None |
| Publisher (`src/publisher/main.py`) | None |
| Validator (`trend_30d_schema.py`) | None |
| Artifact (`artifacts/trend_30d.json`) | None |
| Portal — `portal/package.json` | Add `recharts` dependency |
| Portal — `portal/src/App.jsx` | Replace `TrendTable` with `TrendChart` |

---

## Dependency Changes

### `portal/package.json`

Add to `dependencies`:

```json
"recharts": "^2.12.0"
```

Install command:

```bash
cd portal && npm install recharts
```

Recharts 2.x is the current stable release. It has no additional peer dependencies beyond React 18,
which is already installed. It is production-ready and widely used.

---

## Component Changes

### Remove: `TrendTable`

The existing `TrendTable` component (currently at lines 262–286 of `App.jsx`) is replaced entirely.
No other component depends on it.

### Add: `TrendChart`

```jsx
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

function TrendChart({ days }) {
  if (!days || days.length === 0) {
    return (
      <div style={styles.tableCard}>
        <div style={styles.tableTitle}>Failure Trend — last 30 days</div>
        <p style={{ padding: "1.25rem", color: "#94a3b8" }}>No trend data available.</p>
      </div>
    );
  }

  return (
    <div style={styles.tableCard}>
      <div style={styles.tableTitle}>Failure Trend — last 30 days</div>
      <div style={{ padding: "1.25rem 1rem 1rem 0" }}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={days} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(d) => d.slice(5)}  // "2026-02-07" → "02-07"
              interval={4}                        // ~6 evenly spaced labels across 30 days
              tickCount={6}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, "auto"]}
              tick={{ fontSize: 11, fill: "#64748b" }}
              width={40}
            />
            <Tooltip
              formatter={(value) => [value.toLocaleString(), "Failures"]}
              labelStyle={{ fontWeight: 600, color: "#0f172a" }}
              contentStyle={{ fontSize: "0.85rem" }}
            />
            <Line
              type="monotone"
              dataKey="failures"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

### Update call site in `App`

Replace the existing render call:

```jsx
// Remove:
<TrendTable days={trend30d.days} />

// Add:
<TrendChart days={trend30d.days} />
```

---

## Style Notes

- Chart wrapper reuses `styles.tableCard` and `styles.tableTitle` — consistent with all other cards
- The card title "Failure Trend — last 30 days" explicitly labels the window in the UI
- No new style entries needed
- `stroke="#dc2626"` matches `kpiValue` red already used in the portal
- `interval={4}` on XAxis produces ~6 evenly-spaced labels across 30 days — readable without overlap or crowding
- `dot={false}` keeps the line clean; active dot appears on hover only
- `domain={[0, "auto"]}` ensures zero-failure days anchor at 0 rather than being clipped

---

## Files to Change

| File | Change |
|------|--------|
| `portal/package.json` | Add `"recharts": "^2.12.0"` to `dependencies` |
| `portal/src/App.jsx` | Add Recharts import; replace `TrendTable` with `TrendChart` |

## Files NOT Changed

| File | Reason |
|------|--------|
| `sql/athena_views.sql` | Metric definition unchanged |
| `src/publisher/main.py` | Publisher pipeline unchanged |
| `src/publisher/validators/trend_30d_schema.py` | Artifact schema unchanged |
| `data/generate_fixtures.py` | Data generation unchanged |
| `portal/vite.config.js`, `portal/index.html`, `portal/src/main.jsx` | Unchanged |

---

## Verification Steps

1. Install dependency:
   ```bash
   cd portal && npm install recharts
   ```
   Confirm `recharts` appears in `node_modules/` and `package-lock.json`.

2. Run publisher to ensure fresh artifacts:
   ```bash
   python src/publisher/main.py
   ```

3. Start dev server:
   ```bash
   cd portal && npm run dev
   ```

4. Visual checks:
   - Line chart renders in place of the 30-day table
   - Chart shows 30 data points; zero-failure days display at y=0
   - X-axis shows abbreviated dates (e.g. "02-07")
   - Hovering a point shows a tooltip with the full date and failure count
   - Chart is responsive — resizing the browser window reflows correctly

5. Fallback check:
   - Temporarily rename `artifacts/trend_30d.json` → `artifacts/trend_30d.json.bak`
   - Refresh portal → confirm "No trend data available." fallback message appears
   - Restore the file

6. Portal build check:
   ```bash
   cd portal && npm run build
   ```
   Confirm build exits 0 with no errors.
