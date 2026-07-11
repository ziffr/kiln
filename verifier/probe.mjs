/**
 * probe.mjs — generate a real VBD app and either (a) POST it to a running verifier service, or
 * (b) with no URL, write it to ./sample-app so you can `docker run -v $PWD/sample-app:/work vbd-verifier`.
 *
 *   node probe.mjs                              # writes ./sample-app
 *   node probe.mjs http://localhost:8900/verify # posts to the service, prints the verdict
 */
import { generateApp } from "../packages/codegen/src/index.ts";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const caps = { version: "0.2", domain: "solar", capabilities: [{ id: "lead_management", name: "Lead" }, { id: "installation", name: "Install" }] };
const domain = {
  version: "0.1",
  aggregates: [
    { id: "lead", name: "Lead", owner: "lead_management", attributes: [{ name: "name", type: "text" }, { name: "value", type: "money" }] },
    { id: "job", name: "Job", owner: "installation", attributes: [{ name: "scheduledOn", type: "date" }] },
  ],
  commands: [{ id: "capture_lead", name: "Capture Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_captured"] }],
  events: [{ id: "lead_captured", name: "Lead Captured", aggregate: "lead" }],
  policies: [],
};
const files = generateApp(caps, domain);
const url = process.argv[2];

if (!url) {
  const root = join(process.cwd(), "sample-app");
  rmSync(root, { recursive: true, force: true });
  for (const [p, c] of Object.entries(files)) { const fp = join(root, p); mkdirSync(dirname(fp), { recursive: true }); writeFileSync(fp, c); }
  console.log(`wrote ${Object.keys(files).length} files → ${root}`);
  console.log(`test it in the sandbox:\n  docker run --rm --network none --memory 512m --cpus 1 -v ${root}:/work vbd-verifier`);
} else {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(process.env.VERIFY_SECRET ? { "x-verify-secret": process.env.VERIFY_SECRET } : {}) }, body: JSON.stringify({ files }) });
  const verdict = await res.json();
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.ok ? 0 : 1);
}
