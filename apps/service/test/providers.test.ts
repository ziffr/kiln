/**
 * Multi-engine provider seam (Anthropic default + OpenRouter / omniroute gateways).
 * Covers the two PURE pieces the routing depends on:
 *   · resolveModelOption — { provider, model } → concrete ModelOption (incl. free-text gateway slugs)
 *   · buildChatRequest   — LlmRequest → OpenAI-compatible /chat/completions body (schema + effort mapping)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, MODELS, DEFAULT_MODEL, DEFAULT_PROVIDER, modelById, providerById, resolveModelOption } from "../src/models.ts";
import { buildChatRequest } from "../src/providers/openaiCompatible.ts";

test("catalog: Anthropic is first/default and every model id is globally unique", () => {
  assert.equal(PROVIDERS[0].id, "anthropic");
  assert.equal(DEFAULT_PROVIDER, "anthropic");
  assert.ok(modelById(DEFAULT_MODEL));
  const ids = MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate model id across providers would break id-only routing");
});

test("catalog: gateway providers expose an OpenAI dialect + free-text models", () => {
  const or = providerById("openrouter")!;
  const om = providerById("omniroute")!;
  assert.equal(or.kind, "openai");
  assert.equal(om.kind, "openai");
  assert.equal(or.allowCustomModel, true);
  assert.equal(om.allowCustomModel, true);
  assert.equal(providerById("anthropic")!.allowCustomModel, false);
});

test("resolveModelOption: exact catalog model in the named provider", () => {
  const m = resolveModelOption({ provider: "openrouter", model: "openai/gpt-5" });
  assert.equal(m.id, "openai/gpt-5");
  assert.equal(m.provider, "openrouter");
});

test("resolveModelOption: free-text slug on a gateway is honoured (synthesised option)", () => {
  const m = resolveModelOption({ provider: "openrouter", model: "some-vendor/brand-new-model" });
  assert.equal(m.id, "some-vendor/brand-new-model");
  assert.equal(m.provider, "openrouter");
  assert.equal(m.inPerM, 0, "unknown gateway pricing → 0 (estimate shows n/a)");
});

test("resolveModelOption: unknown model on Anthropic (no custom) falls back to the provider default", () => {
  const m = resolveModelOption({ provider: "anthropic", model: "not-a-real-model" });
  assert.equal(m.id, providerById("anthropic")!.defaultModel);
});

test("resolveModelOption: model id with no provider resolves across catalogs", () => {
  const m = resolveModelOption({ model: "deepseek/deepseek-chat" });
  assert.equal(m.provider, "openrouter");
});

test("buildChatRequest: maps schema → response_format json_schema and effort → reasoning_effort", () => {
  const body = buildChatRequest(
    { system: "SYS", user: "USER", schema: { type: "object" } },
    "openai/gpt-5",
    "high",
    true,
  );
  assert.equal(body.model, "openai/gpt-5");
  const rf = body.response_format as { type: string; json_schema: { schema: unknown } };
  assert.equal(rf.type, "json_schema");
  assert.deepEqual(rf.json_schema.schema, { type: "object" });
  assert.equal(body.reasoning_effort, "high");
  const msgs = body.messages as Array<{ role: string; content: string }>;
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[0].content, /JSON object/i); // JSON nudge added when a schema is present
  assert.equal(msgs[1].content, "USER");
});

test("buildChatRequest: 'max' effort clamps to 'high'; effort omitted when unsupported", () => {
  assert.equal(buildChatRequest({ system: "s", user: "u" }, "m", "max", true).reasoning_effort, "high");
  assert.equal(buildChatRequest({ system: "s", user: "u" }, "m", "high", false).reasoning_effort, undefined);
});

test("buildChatRequest: degrade pass drops response_format + reasoning_effort", () => {
  const body = buildChatRequest(
    { system: "s", user: "u", schema: { type: "object" } },
    "m",
    "high",
    true,
    false, // withStructured = false
  );
  assert.equal(body.response_format, undefined);
  assert.equal(body.reasoning_effort, undefined);
});
