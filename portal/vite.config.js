import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// publicDir points to artifacts/ so that both the current-run tree and the
// historical-run tree are served from the same root:
//
//   /current/<dashboardId>/<filename>   ← current run artifacts (useArtifactPath)
//   /runs/<runId>/<dashboardId>/<filename> ← historical run artifacts (RunDetail links)
//   /current/run_history.json           ← run history index
//
// In production, artifacts/ is synced to S3 and served via CloudFront under
// the same prefix structure — both current/ and runs/ are in scope.
export default defineConfig({
  plugins: [react()],
  publicDir: "../artifacts",
  test: {
    environment: "node",
    globals: true,
  },
});
