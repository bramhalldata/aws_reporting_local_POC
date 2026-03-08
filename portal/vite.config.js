import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// publicDir points to artifacts/current/ so that summary.json, manifest.json,
// etc. are served at /summary.json, /manifest.json, etc. without copying or
// proxying. The publisher always keeps current/ in sync with the latest run.
//
// In production, these files are served from S3 via CloudFront using the
// artifacts/current/ prefix.
export default defineConfig({
  plugins: [react()],
  publicDir: "../artifacts/current",
});
