// Static list of available client/env scopes.
// Phase 1: hardcoded here — no publisher changes or async fetch required.
// Phase 2: if scopes need to be dynamic, publish /scopes.json and load async.
//
// Rules:
//   - envs must be non-empty for every entry.
//   - The selector only controls what appears in the dropdown; it does not restrict direct URL access.
export const SCOPES = [
  { client: "default",    envs: ["local"] },
  { client: "contexture", envs: ["local", "prod"] },
];
