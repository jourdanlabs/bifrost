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

## Native iOS App

This package also ships a Capacitor-backed iOS app at `ios/App`.

The iOS project is the installable mobile carrier for BIFROST Browser:

- app id: `com.jourdanlabs.bifrost.browser`
- app name: `BIFROST Browser`
- source web bundle: `dist`
- native carrier: Capacitor iOS with Swift Package Manager
- current verified path: local controlled AI lab -> extract visible answer -> COSMIC-lite verdict -> sealed receipt

The current native app is intentionally honest about the hard boundary:
same-origin pages can be extracted by the web workbench, and the native bridge
contract is ready for the full WKWebView extraction layer. Cross-origin AI pages
must be handled by the native bridge; when that bridge is absent, BIFROST fails
closed instead of pretending it can read the page.

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

## iOS Build

```bash
pnpm --filter @bifrost/browser ios:sync
cd apps/browser/ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```

Open the project in Xcode:

```bash
pnpm --filter @bifrost/browser ios:open
```

For a real device/App Store build, set the signing team in Xcode, build the
Release target, then archive through Xcode Organizer.

## Local Run

```bash
cd apps/browser/dist
python3 -m http.server 8795 --bind 127.0.0.1
```

Open `http://127.0.0.1:8795`, use `AI Lab`, then tap `Verify Page`.

## Native Verification Performed

The app has been verified on an iPhone simulator:

- `pnpm --filter @bifrost/browser build`
- `pnpm --filter @bifrost/browser test`
- `pnpm --filter @bifrost/browser ios:sync`
- `xcodebuild ... CODE_SIGNING_ALLOWED=NO`
- `xcrun simctl install`
- `xcrun simctl launch com.jourdanlabs.bifrost.browser`

Simulator screenshots were captured after launch to confirm the mobile layout
respects iOS safe areas.
