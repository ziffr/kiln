import { MODELS, DEFAULT_MODEL, DEFAULT_EFFORT, EFFORTS, anthropicClient, type Req, type Res } from "./_lib.ts";

export default function handler(_req: Req, res: Res): void {
  res.status(200).json({
    models: MODELS,
    defaultModel: DEFAULT_MODEL,
    defaultEffort: DEFAULT_EFFORT,
    efforts: EFFORTS,
    ready: Boolean(anthropicClient()),
  });
}
