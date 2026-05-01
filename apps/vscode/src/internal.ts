// Pure helpers — no `vscode` import — so they can be unit-tested.

import * as crypto from "node:crypto";

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// Tiny glob matcher — handles `**`, `*`, `?`, and brace alternates `{a,b}`.
// Sufficient for the bifrost.include / bifrost.exclude defaults.
//
// Uses a token pass so substitutions don't recursively rewrite each other:
// glob metacharacters become \x00..\x06 first, then are emitted as the
// regex equivalents at the end.
export function globMatch(pattern: string, value: string): boolean {
  const T = {
    DSTAR_SLASH: "\x01",
    DSTAR: "\x02",
    STAR: "\x03",
    QMARK: "\x04",
    BRACE_OPEN: "\x05",
    BRACE_CLOSE: "\x06",
    PIPE: "\x07",
  };
  // 1. Tokenize glob metachars before regex-escape.
  let s = pattern
    .replace(/\*\*\//g, T.DSTAR_SLASH)
    .replace(/\*\*/g, T.DSTAR)
    .replace(/\*/g, T.STAR)
    .replace(/\?/g, T.QMARK)
    .replace(/\{([^}]+)\}/g, (_m, alts: string) =>
      T.BRACE_OPEN + alts.split(",").join(T.PIPE) + T.BRACE_CLOSE
    );
  // 2. Escape everything else for regex.
  s = s.replace(/[.+^$()|[\]\\]/g, "\\$&");
  // 3. Emit regex for the tokens.
  s = s
    .replace(new RegExp(T.DSTAR_SLASH, "g"), "(?:.*/)?")
    .replace(new RegExp(T.DSTAR, "g"), ".*")
    .replace(new RegExp(T.STAR, "g"), "[^/]*")
    .replace(new RegExp(T.QMARK, "g"), "[^/]")
    .replace(new RegExp(T.BRACE_OPEN, "g"), "(?:")
    .replace(new RegExp(T.BRACE_CLOSE, "g"), ")")
    .replace(new RegExp(T.PIPE, "g"), "|");
  return new RegExp("^" + s + "$").test(value);
}
