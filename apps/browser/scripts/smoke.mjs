import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

assert(html.includes("browserFrame"), "controlled browser frame is missing");
assert(html.includes("urlInput"), "address bar is missing");
assert(html.includes("verifyButton"), "verify button is missing");
assert(app.includes("runPipeline"), "browser must call COSMIC-lite pipeline");
assert(app.includes("BifrostNative"), "native WebView bridge is missing");
assert(app.includes("extractFromControlledFrame"), "same-origin extraction path is missing");
assert(app.includes("data-bifrost-answer"), "local AI lab answer selector is missing");
assert(app.includes("receipt_hash"), "sealed receipt output is missing");
assert(css.includes(".phone-shell"), "phone-first shell styling is missing");

console.log("[bifrost-browser] smoke ok");
