import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../src/sw.ts", import.meta.url), "utf8");

assert(html.includes('id="answerInput"'), "answer input is missing");
assert(html.includes('id="inputHashText"'), "input hash receipt field is missing");
assert(html.includes('href="/app.css"'), "compiled CSS reference is missing");
assert(html.includes('src="/app.js"'), "compiled JS reference is missing");

assert(manifest.name === "BIFROST Mobile", "manifest name changed");
assert(manifest.display === "standalone", "manifest display must be standalone");
assert(Boolean(manifest.share_target), "manifest share_target is missing");
assert(manifest.share_target.params.text === "text", "share_target text param changed");

assert(app.includes("runPipeline"), "mobile app must call the deterministic pipeline");
assert(app.includes("input_hash"), "mobile app must produce a stable input_hash");
assert(app.includes("0.1.0"), "mobile version marker is missing");

assert(serviceWorker.includes("bifrost-mobile-v1.0.1"), "service worker cache version is stale");
assert(serviceWorker.includes("/app.css"), "service worker must cache compiled CSS");

console.log("[bifrost-mobile] smoke ok");
