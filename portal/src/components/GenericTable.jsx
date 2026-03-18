import { useState } from "react";
import { theme } from "../theme/cashmereTheme";

const styles = {
  tableCard: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    boxShadow: theme.shadowSubtle,
    overflow: "hidden",
  },
  tableTitle: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: theme.textPrimary,
    padding: "1rem 1.25rem",
    borderBottom: `1px solid ${theme.border}`,
    background: theme.background,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "0.65rem 1.25rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textSecondary,
    background: theme.background,
    borderBottom: `2px solid ${theme.border}`,
  },
  thRight: {
    textAlign: "right",
    padding: "0.65rem 1.25rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: theme.textSecondary,
    background: theme.background,
    borderBottom: `2px solid ${theme.border}`,
  },
  td: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    borderBottom: `1px solid ${theme.divider}`,
  },
  tdRight: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    borderBottom: `1px solid ${theme.divider}`,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  tdTotals: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    borderTop: `2px solid ${theme.border}`,
    borderBottom: "none",
    background: theme.background,
  },
  tdTotalsRight: {
    padding: "0.65rem 1.25rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    borderTop: `2px solid ${theme.border}`,
    borderBottom: "none",
    background: theme.background,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  trEven: { background: theme.background },
  trHover: { background: "#EFF6FF" },
};

// ---------------------------------------------------------------------------
// formatCell — applies a format string to a raw cell value for display.
// ---------------------------------------------------------------------------
function formatCell(value, format) {
  if (value == null) return "—";
  if (format === "number")      return Number(value).toLocaleString();
  if (format === "date_string") return String(value).slice(0, 10);
  if (format === "timestamp")   return String(value).slice(0, 19).replace("T", " ");
  return String(value);
}

// ---------------------------------------------------------------------------
// computeTotals — builds the totals row from raw artifact values.
// Each column's `aggregate` field drives its totals cell.
//   "sum"   → numeric sum of all non-null values
//   "min"   → minimum non-null value
//   "max"   → maximum non-null value
//   "label" → renders the literal string "Total"
//   "none" or absent → renders "—"
// ---------------------------------------------------------------------------
function computeTotals(rows, columns) {
  return columns.map((col) => {
    const agg = col.aggregate;
    if (!agg || agg === "none") return null;
    if (agg === "label") return "Total";

    const values = rows
      .map((r) => r[col.field])
      .filter((v) => v != null && !Number.isNaN(Number(v)))
      .map(Number);

    if (values.length === 0) return null;
    if (agg === "sum") return values.reduce((a, b) => a + b, 0);
    if (agg === "min") return Math.min(...values);
    if (agg === "max") return Math.max(...values);
    return null;
  });
}

// ---------------------------------------------------------------------------
// isRightAligned — columns with numeric-style formats align right.
// ---------------------------------------------------------------------------
function isRightAligned(format) {
  return format === "number";
}

// ---------------------------------------------------------------------------
// GenericTable — definition-driven table component.
//
// Props:
//   title        {string}   Section heading displayed in the card header.
//   rows         {Array}    Array of row objects from the artifact.
//   columns      {Array}    Column definitions — see shape below.
//   totals       {boolean}  When true, renders a Grand Total row.
//   emptyMessage {string}   Override for empty-state text.
//
// Column shape:
//   { field, header, format?, aggregate? }
//   format:    "number" | "date_string" | "timestamp" — absent = raw string
//   aggregate: "sum" | "min" | "max" | "label" | "none" — absent = omit cell
// ---------------------------------------------------------------------------
export default function GenericTable({
  title,
  rows,
  columns = [],
  totals = false,
  emptyMessage = "No data available.",
}) {
  const [hoveredRow, setHoveredRow] = useState(null);

  if (!rows || rows.length === 0) {
    return (
      <div style={styles.tableCard}>
        {title && <div style={styles.tableTitle}>{title}</div>}
        <p style={{ padding: "1.25rem", color: theme.textMuted, margin: 0 }}>{emptyMessage}</p>
      </div>
    );
  }

  const totalsRow = totals ? computeTotals(rows, columns) : null;

  return (
    <div style={styles.tableCard}>
      {title && <div style={styles.tableTitle}>{title}</div>}
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.field}
                style={isRightAligned(col.format) ? styles.thRight : styles.th}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1 && !totals;
            const tdBase = isLast ? { borderBottom: "none" } : {};
            const trStyle =
              hoveredRow === i
                ? styles.trHover
                : i % 2 === 1
                ? styles.trEven
                : {};
            return (
              <tr
                key={i}
                style={trStyle}
                onMouseEnter={() => setHoveredRow(i)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {columns.map((col) => (
                  <td
                    key={col.field}
                    style={{
                      ...(isRightAligned(col.format) ? styles.tdRight : styles.td),
                      ...tdBase,
                    }}
                  >
                    {formatCell(row[col.field], col.format)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {totalsRow && (
          <tfoot>
            <tr>
              {totalsRow.map((cell, i) => {
                const col = columns[i];
                const formatted =
                  cell === "Total"
                    ? "Total"
                    : cell != null
                    ? formatCell(cell, col.format)
                    : "—";
                return (
                  <td
                    key={col.field}
                    style={isRightAligned(col.format) ? styles.tdTotalsRight : styles.tdTotals}
                  >
                    {formatted}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
