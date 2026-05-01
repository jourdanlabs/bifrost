// BIFROST VS Code extension.
//
// Save trigger contract (addendum C):
//   - debounce 1000-5000ms (default 1500)
//   - skip if SHA-256 of document text matches last verified hash for that URI
//   - skip if file does not match include / matches exclude
//
// All side-effects are scoped to the activated editor; no background polling.

import * as vscode from "vscode";
import type { BifrostResponse } from "@bifrost/types";
import { sha256, globMatch } from "./internal";

interface Settings {
  endpoint: string;
  verifyOnSave: boolean;
  debounceMs: number;
  include: string[];
  exclude: string[];
}

function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration("bifrost");
  return {
    endpoint: c.get<string>("endpoint", "http://localhost:8787/verify"),
    verifyOnSave: c.get<boolean>("verifyOnSave", true),
    debounceMs: c.get<number>("debounceMs", 1500),
    include: c.get<string[]>("include", []),
    exclude: c.get<string[]>("exclude", []),
  };
}

const debouncers = new Map<string, NodeJS.Timeout>();
const lastVerifiedHash = new Map<string, string>();
const inFlight = new Set<string>();

function shouldVerify(doc: vscode.TextDocument, settings: Settings): boolean {
  if (!settings.verifyOnSave) return false;
  if (doc.uri.scheme !== "file") return false;
  const ws = vscode.workspace.getWorkspaceFolder(doc.uri);
  const rel = ws ? vscode.workspace.asRelativePath(doc.uri, false) : doc.fileName;
  const matchAny = (patterns: string[]) =>
    patterns.some((p) => vscode.languages.match({ pattern: p }, doc) > 0)
    || patterns.some((p) => vscode.languages.match({ pattern: new vscode.RelativePattern(ws ?? doc.uri, p) }, doc) > 0)
    || patterns.some((p) => globMatch(p, rel));
  if (settings.include.length > 0 && !matchAny(settings.include)) return false;
  if (matchAny(settings.exclude)) return false;
  return true;
}

let statusItem: vscode.StatusBarItem;

function setStatus(state: "idle" | "unverified" | "approved" | "low" | "rejected" | "unavailable", detail?: string) {
  if (!statusItem) return;
  switch (state) {
    case "idle":
      statusItem.text = "$(shield) BIFROST";
      statusItem.tooltip = "BIFROST is enabled";
      statusItem.backgroundColor = undefined;
      break;
    case "unverified":
      statusItem.text = "$(sync~spin) BIFROST: UNVERIFIED";
      statusItem.tooltip = `Verifying ${detail ?? "..."}`;
      statusItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      break;
    case "approved":
      statusItem.text = "$(pass) BIFROST: APPROVED";
      statusItem.tooltip = detail ?? "Approved";
      statusItem.backgroundColor = undefined;
      break;
    case "low":
      statusItem.text = "$(warning) BIFROST: LOW";
      statusItem.tooltip = detail ?? "Low confidence";
      statusItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      break;
    case "rejected":
      statusItem.text = "$(error) BIFROST: REJECTED";
      statusItem.tooltip = detail ?? "Rejected";
      statusItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      break;
    case "unavailable":
      statusItem.text = "$(circle-slash) BIFROST: UNAVAILABLE";
      statusItem.tooltip = detail ?? "BIFROST cannot verify (this does not mean the AI output is suspicious)";
      statusItem.backgroundColor = undefined;
      break;
  }
}

async function callVerify(endpoint: string, output: string): Promise<BifrostResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ output }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return (await res.json()) as BifrostResponse;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyDocument(doc: vscode.TextDocument, settings: Settings, force = false) {
  const key = doc.uri.toString();
  if (inFlight.has(key)) return;

  const text = doc.getText();
  if (!text.trim()) return;
  const hash = sha256(text);

  if (!force && lastVerifiedHash.get(key) === hash) {
    // Identical content already verified — skip per addendum C.
    return;
  }

  inFlight.add(key);
  setStatus("unverified", vscode.workspace.asRelativePath(doc.uri));

  try {
    const result = await callVerify(settings.endpoint, text);
    lastVerifiedHash.set(key, hash);

    const detail = `${result.verdict} ${result.confidence.toFixed(2)} — ${doc.fileName.split("/").pop()}`;
    if (result.verdict === "APPROVED") setStatus("approved", detail);
    else if (result.verdict === "LOW_CONFIDENCE") setStatus("low", detail);
    else setStatus("rejected", detail);

    if (result.verdict === "REJECTED") {
      const findings = result.pulsar_findings.map((f) => `${f.type}: ${f.description}`).join("\n");
      const choice = await vscode.window.showWarningMessage(
        `BIFROST: REJECTED (${result.confidence.toFixed(2)})${findings ? "\n" + findings : ""}`,
        "Show details"
      );
      if (choice === "Show details") {
        const out = vscode.window.createOutputChannel("BIFROST", { log: true });
        out.appendLine(JSON.stringify(result, null, 2));
        out.show(true);
      }
    }
  } catch (e) {
    const err = e as Error & { status?: number };
    let detail = err.message;
    if (err.name === "AbortError") detail = "timeout (>1500ms)";
    else if (err.status === 401 || err.status === 403) detail = "Add API key";
    else if (err.status === 429) detail = "Rate limit exceeded";
    else if (/fetch|network|connection/i.test(err.message)) detail = "Service unreachable";
    setStatus("unavailable", detail);
  } finally {
    inFlight.delete(key);
  }
}

function scheduleVerify(doc: vscode.TextDocument, settings: Settings) {
  const key = doc.uri.toString();
  const existing = debouncers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    debouncers.delete(key);
    verifyDocument(doc, settings).catch((e) => console.error("[bifrost]", e));
  }, settings.debounceMs);
  debouncers.set(key, timer);
}

export function activate(context: vscode.ExtensionContext) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = "bifrost.verifyCurrent";
  setStatus("idle");
  statusItem.show();
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const s = readSettings();
      if (!shouldVerify(doc, s)) return;
      scheduleVerify(doc, s);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bifrost.verifyCurrent", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("BIFROST: no active editor");
        return;
      }
      await verifyDocument(editor.document, readSettings(), /* force */ true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bifrost.toggleOnSave", async () => {
      const cfg = vscode.workspace.getConfiguration("bifrost");
      const current = cfg.get<boolean>("verifyOnSave", true);
      await cfg.update("verifyOnSave", !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `BIFROST: verify-on-save ${!current ? "enabled" : "disabled"}`
      );
    })
  );
}

export function deactivate() {
  for (const t of debouncers.values()) clearTimeout(t);
  debouncers.clear();
  lastVerifiedHash.clear();
  inFlight.clear();
}

