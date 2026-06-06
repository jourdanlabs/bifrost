# BIFROST Browser

BIFROST Browser is the mobile path for BIFROST. It is not a paste/share tool and
it is not a pretend Chrome extension. It is a controlled browser surface: users
open AI tools inside BIFROST, then BIFROST extracts the visible assistant answer,
runs COSMIC-lite, and seals the verdict receipt.

## Why This Exists

Desktop BIFROST works as a Chrome extension because desktop browsers allow page
injection. Mobile browsers generally do not provide the same extension surface.
The viable mobile product is a browser app, like DuckDuckGo's model: BIFROST owns
the WebView, so it can govern what happens inside it.

## V1 Workbench

This package ships the web workbench for the browser app:

- controlled address bar
- iframe-based local AI lab for same-origin extraction
- native `window.BifrostNative` bridge contract for iOS/Android WebView shells
- deterministic COSMIC-lite verification
- verdict panel and sealed JSON receipt
- explicit extraction failure state for pages the web workbench cannot inspect

## Native Bridge Contract

A native wrapper can provide:

```ts
window.BifrostNative = {
  openUrl(url: string): void | Promise<void>,
  extractVisibleAnswer(): {
    url: string;
    title?: string;
    prompt?: string;
    answer: string;
    selector?: string;
  } | Promise<...>
}
```

The web workbench can prove same-origin extraction. The native app owns
cross-origin WebView extraction.

## Build

```bash
pnpm --filter @bifrost/browser build
```

Static output lands in `apps/browser/dist`.

## Local Run

```bash
cd apps/browser/dist
python3 -m http.server 8795 --bind 127.0.0.1
```

Open `http://127.0.0.1:8795`, use `AI Lab`, then tap `Verify Page`.
