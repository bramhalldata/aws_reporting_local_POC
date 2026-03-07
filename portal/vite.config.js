import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// publicDir points to the artifacts directory so that summary.json and
// manifest.json are served by the dev server at /summary.json and
// /manifest.json without any copying or proxying.
//
// In production, these files are served from S3 via CloudFront.
export default defineConfig({
  plugins: [react()],
  publicDir: "../artifacts",
});
