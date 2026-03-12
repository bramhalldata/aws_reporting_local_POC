import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";

/**
 * resolveFilterState — pure resolution logic for dashboard filter state.
 *
 * Exported for direct unit testing without a React context.
 * For each declared filter, resolves the value in priority order:
 *   1. Path parameters (pathParams)  — covers :client and :env route segments
 *   2. Query parameters (searchParams.get) — covers ?date_range=7d etc.
 *   3. The filter's declared `default` value
 *   4. null (absent, no default)
 *
 * @param {Array<{id: string, type: string, param: string, default?: string}>} filters
 * @param {Object} pathParams    — from useParams()
 * @param {URLSearchParams} searchParams — from useSearchParams()[0]
 * @returns {{ [filterId: string]: string | null }}
 */
export function resolveFilterState(filters, pathParams, searchParams) {
  const state = {};
  for (const filter of (filters ?? [])) {
    if (filter.type === "url_param") {
      const value =
        pathParams[filter.param] ??
        searchParams.get(filter.param) ??
        filter.default ??
        null;
      state[filter.id] = value;
    }
  }
  return state;
}

/**
 * useFilterState — React hook wrapping resolveFilterState.
 *
 * Reads the `filters` array from the dashboard definition and returns a stable
 * { [filterId]: value } map that re-computes only when the URL or filter
 * declarations change.
 *
 * NOTE: useDashboardArtifacts reads client/env from useParams() directly for
 * artifact path construction. That is intentional — artifact loading is a
 * separate concern from display filter state.
 *
 * @param {{ filters?: Array<{id: string, type: string, param: string, default?: string}> }} definition
 * @returns {{ [filterId: string]: string | null }}
 */
export function useFilterState(definition) {
  const pathParams = useParams();
  const [searchParams] = useSearchParams();

  return useMemo(
    () => resolveFilterState(definition.filters, pathParams, searchParams),
    [definition.filters, pathParams, searchParams]
  );
}
