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
assert(html.includes("backButton"), "back button is missing");
assert(html.includes("forwardButton"), "forward button is missing");
assert(html.includes("reloadButton"), "reload button is missing");
assert(html.includes("desktopTabs"), "desktop tab strip is missing");
assert(html.includes("mobileTabList"), "mobile tab drawer is missing");
assert(html.includes("receiptHistoryList"), "receipt history panel is missing");
assert(html.includes("recentPagesList"), "recent pages panel is missing");
assert(html.includes("clearLocalDataButton"), "local data clear control is missing");
assert(app.includes("runPipeline"), "browser must call COSMIC-lite pipeline");
assert(app.includes("BifrostNative"), "native WebView bridge is missing");
assert(app.includes("extractFromControlledFrame"), "same-origin extraction path is missing");
assert(app.includes("goBack"), "native back navigation is missing");
assert(app.includes("goForward"), "native forward navigation is missing");
assert(app.includes("reloadPage"), "reload navigation is missing");
assert(app.includes("duckduckgo.com"), "private search fallback is missing");
assert(app.includes("data-bifrost-answer"), "local AI lab answer selector is missing");
assert(app.includes("receipt_hash"), "sealed receipt output is missing");
assert(app.includes("RECEIPT_HISTORY_KEY"), "receipt history persistence is missing");
assert(app.includes("PAGE_HISTORY_KEY"), "recent page persistence is missing");
assert(css.includes(".phone-shell"), "phone-first shell styling is missing");
assert(css.includes(".mobile-tab-item"), "mobile tab styling is missing");
assert(css.includes(".recent-page-item"), "recent page styling is missing");

console.log("[bifrost-browser] smoke ok");
