import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Our @kiln/* workspace packages export TypeScript source; let Vite transpile them as
  // source rather than pre-bundling them as external deps (ADR-003 §4 client-side compute).
  optimizeDeps: {
    exclude: ["@kiln/ir", "@kiln/compiler", "@kiln/validation", "@kiln/narrative"],
  },
  server: { port: 5188, strictPort: true },
});
