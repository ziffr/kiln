#!/usr/bin/env node
// Config-as-code for Nango integration DEFINITIONS — the reproducible half of "migrate Nango"
// (Cloud ↔ self-host). Dependency-free (Node ≥20 built-in fetch only); invoked by `kiln.sh
// nango:export` / `nango:apply`, which source .env first.
//
//   export  GET  ${NANGO_HOST}/integrations           → write tools/nango/integrations.json
//   apply   POST/PATCH ${NANGO_HOST}/integrations     ← read the manifest, one call per integration
//
// SECRETS BY NAME (invariant #7): the manifest stores each integration's OAuth client id/secret as the
// NAME of an env var (client_id_env / client_secret_env), never the value. `apply` resolves the values
// from the environment (your .env) at call time. `export` cannot read secrets back — Nango redacts them —
// so it only captures unique_key / provider / scopes and (re)uses the env-var NAMES.
//
// CONNECTIONS ARE NOT MIGRATED: the authorized end-user accounts (tokens) stay in each instance's own
// encrypted store; re-authorize them on the target (or, self-host↔self-host, carry the Postgres volume +
// the same NANGO_ENCRYPTION_KEY). This tool is integration definitions only.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MANIFEST = new URL("./integrations.json", import.meta.url);
const HOST = (process.env.NANGO_HOST || "").replace(/\/+$/, "");
const KEY = process.env.NANGO_SECRET_KEY || "";
const mode = process.argv[2];

function die(msg) { console.error("✗ " + msg); process.exit(1); }
if (!HOST) die("NANGO_HOST is not set — put it in .env (e.g. http://localhost:3003, or https://api.nango.dev for Cloud).");
if (!KEY) die("NANGO_SECRET_KEY is not set — copy it from the Nango dashboard → Environment Settings into .env.");

const headers = { authorization: "Bearer " + KEY, "content-type": "application/json" };

// Nango wraps list responses differently across versions; accept {data:[...]}, {integrations:[...]}, or a bare array.
const asArray = (j) => (Array.isArray(j) ? j : j?.data ?? j?.integrations ?? j?.configs ?? []);
const scopesToString = (s) => (Array.isArray(s) ? s.join(",") : typeof s === "string" ? s : "");
const envName = (key, suffix) => "NANGO_" + String(key).toUpperCase().replace(/[^A-Z0-9]+/g, "_") + suffix;

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(HOST + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    die(`could not reach Nango at ${HOST}${path} — is it up? (${e.message})`);
  }
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

async function doExport() {
  const r = await api("GET", "/integrations");
  if (!r.ok) die(`GET /integrations → ${r.status}. ${JSON.stringify(r.json)}`);
  const list = asArray(r.json);
  // Preserve any env-var names already chosen in an existing manifest so re-export is stable.
  let prev = {};
  if (existsSync(MANIFEST)) {
    try { for (const it of JSON.parse(readFileSync(MANIFEST, "utf8")).integrations || []) prev[it.unique_key] = it; } catch {}
  }
  const integrations = list.map((it) => {
    const key = it.unique_key ?? it.uniqueKey ?? it.provider_config_key ?? it.providerConfigKey ?? it.id;
    const p = prev[key] || {};
    return {
      unique_key: key,
      provider: it.provider ?? it.provider_slug ?? p.provider ?? "",
      scopes: scopesToString(it.scopes ?? it.credentials?.scopes ?? p.scopes),
      client_id_env: p.client_id_env || envName(key, "_CLIENT_ID"),
      client_secret_env: p.client_secret_env || envName(key, "_CLIENT_SECRET"),
    };
  });
  const out = {
    _about: "Kiln-managed Nango integration definitions. Secrets are referenced by ENV VAR NAME (never value; invariant #7). `./kiln.sh nango:export` writes this from a live Nango; `./kiln.sh nango:apply` recreates it on whatever NANGO_HOST/NANGO_SECRET_KEY your .env points at. Connections (authorized accounts) are NOT included — re-authorize them on the target.",
    integrations,
  };
  writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ exported ${integrations.length} integration(s) from ${HOST} → tools/nango/integrations.json`);
  if (integrations.length) {
    console.log("  Set each integration's client id/secret env vars in .env, then `./kiln.sh nango:apply` against your target:");
    for (const it of integrations) console.log(`    ${it.unique_key}: ${it.client_id_env}, ${it.client_secret_env}`);
  }
}

async function doApply() {
  if (!existsSync(MANIFEST)) die("tools/nango/integrations.json not found — create it (or run `./kiln.sh nango:export` against an existing Nango first).");
  let manifest;
  try { manifest = JSON.parse(readFileSync(MANIFEST, "utf8")); } catch (e) { die("tools/nango/integrations.json is not valid JSON: " + e.message); }
  const items = manifest.integrations || [];
  if (!items.length) die("no integrations in tools/nango/integrations.json.");

  // Which already exist? (create vs update). Best-effort — if the list call fails we just POST then PATCH on conflict.
  const existing = new Set();
  const l = await api("GET", "/integrations");
  if (l.ok) for (const it of asArray(l.json)) existing.add(it.unique_key ?? it.uniqueKey ?? it.provider_config_key ?? it.id);

  let ok = 0, skipped = 0, failed = 0;
  for (const it of items) {
    const key = it.unique_key;
    const clientId = process.env[it.client_id_env];
    const clientSecret = process.env[it.client_secret_env];
    if (!key || !it.provider) { console.log(`  ! ${key || "(no key)"}: missing unique_key/provider — skipped`); skipped++; continue; }
    if (!clientId || !clientSecret) {
      console.log(`  ! ${key}: ${it.client_id_env} / ${it.client_secret_env} not set in the environment — skipped`);
      skipped++; continue;
    }
    const credentials = { type: "OAUTH2", client_id: clientId, client_secret: clientSecret, scopes: scopesToString(it.scopes) };
    const exists = existing.has(key);
    // create: POST /integrations {unique_key, provider, credentials}; update: PATCH /integrations/{key} {credentials}
    let r = exists
      ? await api("PATCH", "/integrations/" + encodeURIComponent(key), { provider: it.provider, credentials })
      : await api("POST", "/integrations", { unique_key: key, provider: it.provider, credentials });
    // Fall back the other way if our exists-guess was wrong (409 on create, 404 on update).
    if (!r.ok && !exists && r.status === 409) r = await api("PATCH", "/integrations/" + encodeURIComponent(key), { provider: it.provider, credentials });
    if (!r.ok && exists && r.status === 404) r = await api("POST", "/integrations", { unique_key: key, provider: it.provider, credentials });
    if (r.ok) { console.log(`  ✓ ${key} (${it.provider}) ${exists ? "updated" : "created"}`); ok++; }
    else { console.log(`  ✗ ${key}: ${r.status} ${JSON.stringify(r.json)}`); failed++; }
  }
  console.log(`\n${ok} applied, ${skipped} skipped, ${failed} failed → ${HOST}`);
  if (failed) process.exit(1);
}

if (mode === "export") await doExport();
else if (mode === "apply") await doApply();
else die("usage: integrations.mjs <export|apply>");
