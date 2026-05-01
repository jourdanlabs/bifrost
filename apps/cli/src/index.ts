#!/usr/bin/env node
// BIFROST CLI.
//
// Usage:
//   bifrost verify "prompt or output text"
//   bifrost verify file.txt
//   cat output.txt | bifrost verify
//   bifrost verify --json file.txt
//
// Endpoint via $BIFROST_ENDPOINT (default http://localhost:8787/verify).

import * as fs from "node:fs";
import type { BifrostResponse } from "@bifrost/types";

const DEFAULT_ENDPOINT = process.env.BIFROST_ENDPOINT || "http://localhost:8787/verify";

function usage(): never {
  process.stderr.write(
    [
      "BIFROST CLI",
      "",
      "Usage:",
      '  bifrost verify "text"',
      "  bifrost verify file.txt",
      "  cat file | bifrost verify",
      "",
      "Flags:",
      "  --json         emit raw JSON response",
      "  --endpoint URL override $BIFROST_ENDPOINT",
      "",
      `Endpoint: ${DEFAULT_ENDPOINT}`,
      "",
    ].join("\n")
  );
  process.exit(2);
}

function colorize(verdict: string): string {
  // Respect NO_COLOR; otherwise apply minimal ANSI.
  if (process.env.NO_COLOR || !process.stdout.isTTY) return verdict;
  if (verdict === "APPROVED") return `\x1b[32m${verdict}\x1b[0m`;
  if (verdict === "LOW_CONFIDENCE") return `\x1b[33m${verdict}\x1b[0m`;
  return `\x1b[31m${verdict}\x1b[0m`;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function resolveOutput(args: string[]): Promise<string> {
  if (args.length === 0) return readStdin();
  // If exactly one arg and it points to a file, read it.
  if (args.length === 1 && fs.existsSync(args[0]) && fs.statSync(args[0]).isFile()) {
    return fs.readFileSync(args[0], "utf8");
  }
  return args.join(" ");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) usage();

  const cmd = argv.shift();
  if (cmd !== "verify") usage();

  let json = false;
  let endpoint = DEFAULT_ENDPOINT;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") json = true;
    else if (a === "--endpoint") {
      endpoint = argv[++i] ?? endpoint;
    } else if (a === "-h" || a === "--help") {
      usage();
    } else {
      rest.push(a);
    }
  }

  const output = (await resolveOutput(rest)).trim();
  if (!output) {
    process.stderr.write("error: empty input\n");
    process.exit(2);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ output }),
    });
  } catch (e) {
    process.stderr.write(`error: cannot reach ${endpoint}: ${(e as Error).message}\n`);
    process.exit(1);
  }
  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`error: HTTP ${response.status}: ${body}\n`);
    process.exit(1);
  }
  const data = (await response.json()) as BifrostResponse;

  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    process.exit(data.verdict === "REJECTED" ? 1 : 0);
  }

  const conf = data.confidence.toFixed(2);
  process.stdout.write(`[${colorize(data.verdict)} ${conf}]\n`);
  for (const r of data.reasons) process.stdout.write(`  - ${r}\n`);
  if (data.pulsar_findings.length > 0) {
    process.stdout.write("\nPULSAR findings:\n");
    for (const f of data.pulsar_findings) {
      process.stdout.write(`  * ${f.type}: ${f.description}\n`);
      process.stdout.write(`    impact: ${f.impact}\n`);
    }
  }
  process.exit(data.verdict === "REJECTED" ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
