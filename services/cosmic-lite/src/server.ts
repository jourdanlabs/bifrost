import express, { Request, Response } from "express";
import cors from "cors";
import { runPipeline } from "./pipeline";

const PORT = Number(process.env.PORT ?? 8787);
const MAX_OUTPUT_BYTES = Number(process.env.BIFROST_MAX_OUTPUT_BYTES ?? 200_000);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "cosmic-lite", version: "0.1.0" });
});

app.post("/verify", (req: Request, res: Response) => {
  const body = req.body ?? {};
  const output = typeof body.output === "string" ? body.output : "";
  const input = typeof body.input === "string" ? body.input : undefined;

  if (!output) {
    return res.status(400).json({
      error: "missing required field: output (string)",
    });
  }
  if (output.length > MAX_OUTPUT_BYTES) {
    return res.status(413).json({
      error: `output exceeds ${MAX_OUTPUT_BYTES} bytes`,
    });
  }

  const { response, metrics } = runPipeline({ input, output });
  res.setHeader("X-Bifrost-Latency-Ms", String(metrics.total_ms));
  res.json(response);
});

app.post("/verify/debug", (req: Request, res: Response) => {
  const body = req.body ?? {};
  const output = typeof body.output === "string" ? body.output : "";
  if (!output) return res.status(400).json({ error: "missing output" });
  const result = runPipeline({ output, input: body.input });
  res.json(result);
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[cosmic-lite] listening on :${PORT}`);
  });
}

export { app };
