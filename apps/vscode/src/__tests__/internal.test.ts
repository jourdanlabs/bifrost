import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256, globMatch } from "../internal";

test("sha256 is stable per content", () => {
  const a = sha256("hello world");
  const b = sha256("hello world");
  const c = sha256("hello world!");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test("globMatch handles ** and * and braces", () => {
  assert.equal(globMatch("**/*.ts", "a/b/c.ts"), true);
  assert.equal(globMatch("**/*.ts", "c.ts"), true);
  assert.equal(globMatch("**/*.ts", "c.js"), false);
  assert.equal(globMatch("**/*.{ts,tsx}", "a/b.tsx"), true);
  assert.equal(globMatch("**/*.{ts,tsx}", "a/b.ts"), true);
  assert.equal(globMatch("**/*.{ts,tsx}", "a/b.py"), false);
  assert.equal(globMatch("**/node_modules/**", "x/node_modules/y/z.ts"), true);
  assert.equal(globMatch("**/node_modules/**", "x/y/z.ts"), false);
});

test("hash-dedupe semantics: identical text triggers cache hit", () => {
  const lastHash = new Map<string, string>();
  const uri = "file:///foo.ts";
  const text = "function add(a, b) { return a + b; }";
  const h1 = sha256(text);
  const should1 = lastHash.get(uri) !== h1;
  lastHash.set(uri, h1);
  const should2 = lastHash.get(uri) !== sha256(text);
  assert.equal(should1, true, "first save must verify");
  assert.equal(should2, false, "second identical save must skip");
});

test("debounce semantics: only the last scheduled call fires", async () => {
  let fired = 0;
  const debouncers = new Map<string, NodeJS.Timeout>();
  const schedule = (key: string, fn: () => void, ms: number) => {
    const e = debouncers.get(key);
    if (e) clearTimeout(e);
    debouncers.set(key, setTimeout(() => { debouncers.delete(key); fn(); }, ms));
  };
  for (let i = 0; i < 5; i++) {
    schedule("file://x", () => fired++, 30);
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, 1, "rapid saves must coalesce to one verify");
});
