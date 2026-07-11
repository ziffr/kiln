/**
 * service.mjs — the host-side verification service. Accepts a generated app (a file map), writes it
 * to an ephemeral temp dir, and runs the sandbox container against it with hard isolation, returning
 * the runner's JSON verdict. This process only orchestrates Docker; the untrusted code runs INSIDE
 * the container (no network, resource-capped, read-only root, non-root user, auto-removed).
 *
 * Run:  VERIFY_SECRET=... node service.mjs      (build the image first — see README)
 * Call: POST /verify  { "files": { "server.mjs": "...", "web/src/App.jsx": "..." } }
 */
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, normalize } from "node:path";

const PORT = Number(process.env.PORT || 8900);
const IMAGE = process.env.VERIFY_IMAGE || "vbd-verifier";
const SECRET = process.env.VERIFY_SECRET || "";
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 90_000);

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,x-verify-secret" });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => { let d = ""; req.on("data", (c) => { d += c; if (d.length > 8e6) { req.destroy(); reject(new Error("payload too large")); } }); req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error("invalid JSON")); } }); });

// Reject path traversal / absolute paths — the file map comes from a client we authenticate, but
// belt-and-braces before writing to disk.
function safeWrite(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = normalize(join(dir, rel));
    if (!p.startsWith(dir + "/") || rel.includes("..")) throw new Error("unsafe path: " + rel);
    if (typeof content !== "string" || content.length > 2e6) throw new Error("bad file: " + rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

function runContainer(dir) {
  const args = [
    "run", "--rm",
    "--network", "none",           // no outbound network for untrusted code
    "--memory", "512m", "--cpus", "1",
    "--pids-limit", "256",
    "--read-only", "--tmpfs", "/tmp",
    "--security-opt", "no-new-privileges",
    "-v", `${dir}:/work`,          // the app (writable: data.db, dist, node_modules symlink)
    IMAGE,
  ];
  return new Promise((resolve) => {
    execFile("docker", args, { timeout: TIMEOUT_MS, maxBuffer: 8e6 }, (err, stdout, stderr) => {
      const m = String(stdout).match(/\{[\s\S]*\}\s*$/); // the runner prints the verdict JSON last
      if (m) { try { return resolve(JSON.parse(m[0])); } catch { /* fall through */ } }
      const detail = (err && err.killed ? "timed out" : "") + " " + (stderr || err?.message || "no verdict from runner");
      resolve({ ok: false, checks: [{ name: "sandbox", ok: false, detail: detail.slice(0, 400) }] });
    });
  });
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, image: IMAGE });
  if (req.method !== "POST" || req.url !== "/verify") return send(res, 404, { error: "POST /verify" });
  if (SECRET && req.headers["x-verify-secret"] !== SECRET) return send(res, 401, { error: "unauthorized" });

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
  const files = body && body.files;
  if (!files || typeof files !== "object" || !files["server.mjs"]) return send(res, 400, { error: "files map with server.mjs required" });

  const dir = mkdtempSync(join(tmpdir(), "vbd-verify-"));
  try {
    safeWrite(dir, files);
    const verdict = await runContainer(dir);
    send(res, 200, verdict);
  } catch (e) {
    send(res, 400, { error: String(e.message || e) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}).listen(PORT, () => console.log(`verifier on http://localhost:${PORT} (image=${IMAGE}, auth=${SECRET ? "on" : "OFF"})`));
