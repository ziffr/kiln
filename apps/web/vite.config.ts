import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Our @vbd/* workspace packages export TypeScript source; let Vite transpile them as
  // source rather than pre-bundling them as external deps (ADR-003 §4 client-side compute).
  optimizeDeps: {
    exclude: ["@vbd/ir", "@vbd/compiler", "@vbd/validation", "@vbd/narrative"],
  },
  server: { port: 5188, strictPort: true },
});
