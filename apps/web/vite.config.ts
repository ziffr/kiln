import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Stamp the running version so the app can show which build it is (product version + short commit).
const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
let commit = "dev";
try { commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { /* no git → dev */ }

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  // Our @kiln/* workspace packages export TypeScript source; let Vite transpile them as
  // source rather than pre-bundling them as external deps (ADR-003 §4 client-side compute).
  optimizeDeps: {
    exclude: ["@kiln/ir", "@kiln/compiler", "@kiln/validation", "@kiln/narrative"],
  },
  server: { port: 5188, strictPort: true },
});
