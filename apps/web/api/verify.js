// functions/_lib.ts
import Anthropic from "@anthropic-ai/sdk";

// ../../packages/ir/src/index.ts
var SHA256_K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);

// ../../packages/skills/src/components.ts
var FORMATS = ["text", "money", "date", "boolean", "badge", "longtext"];
var COMPONENTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["columns", "formFields"],
  properties: {
    description: { type: "string" },
    titleField: { type: "string" },
    columns: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["field", "format"], properties: { field: { type: "string" }, format: { type: "string", enum: [...FORMATS] } } }
    },
    formFields: { type: "array", items: { type: "string" } }
  }
};

// functions/_lib.ts
function readBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
}

// functions/verify.ts
async function handler(req, res) {
  const verifyUrl = process.env.VBD_VERIFY_URL;
  if (!verifyUrl) return void res.status(200).json({ configured: false, error: "verifier not configured (set VBD_VERIFY_URL)" });
  const body = readBody(req);
  try {
    const r = await fetch(verifyUrl.replace(/\/$/, "") + "/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-verify-secret": process.env.VBD_VERIFY_SECRET ?? "" },
      body: JSON.stringify(body)
    });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ ok: false, error: `verifier unreachable: ${e instanceof Error ? e.message : String(e)}` });
  }
}
var config = { maxDuration: 60 };
export {
  config,
  handler as default
};
