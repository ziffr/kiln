/**
 * Local "Run app" preview page builder. The spawn/lifecycle side is integration-tested by hand (it needs
 * a child process + free port); here we lock the PURE, exported HTML builder: it inlines the model + API
 * base and never reflects untrusted values through innerHTML (data cells use textContent).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runClientHtml } from "../src/run.ts";

const model = {
  domain: "solar",
  entities: [{ id: "lead", name: "Lead", area: "Sales", fields: [{ name: "name", type: "text" }, { name: "value", type: "money" }] }],
  commands: [{ id: "capture_lead", name: "Capture Lead", entity: "lead" }],
  roles: ["installer"],
};

test("runClientHtml inlines the model + API base and boots without extra deps", () => {
  const html = runClientHtml(model, "http://localhost:54321");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Kiln live preview/);
  assert.match(html, /http:\/\/localhost:54321/); // API base injected
  assert.match(html, /"capture_lead"/); // command available for the action button
  assert.match(html, /"installer"/); // role selector populated
  assert.doesNotMatch(html, /<script src=/); // dependency-free (no external scripts)
});

test("runClientHtml escapes the domain in the <title> and tolerates a junk model", () => {
  const html = runClientHtml({ domain: "<script>alert(1)</script>" }, "http://x");
  assert.doesNotMatch(html, /<title>[^<]*<script>alert/); // domain is HTML-escaped in the title
  assert.match(html, /&lt;script&gt;/);
  // A non-object model must not throw and still yields a page.
  assert.match(runClientHtml(null, "http://x"), /<!doctype html>/i);
});
