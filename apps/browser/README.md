# BIFROST Browser

BIFROST Browser is the owned-browser path for BIFROST. It is not a paste/share
tool and it is not a pretend Chrome extension. It is a controlled browser
surface: users open AI tools inside BIFROST, then BIFROST extracts the visible
assistant answer, runs COSMIC-lite, and seals the verdict receipt.

## Why This Exists

The Chrome extension remains useful, but the durable product is a browser app,
like DuckDuckGo's model: BIFROST owns the WebView/BrowserView, so it can govern
what happens inside it across mobile and desktop.

## V1 Workbench

This package ships the web workbench for the browser app:

- controlled address bar
- iframe-based local AI lab for same-origin extraction
- native `window.BifrostNative` bridge contract for iOS/macOS shells
- deterministic COSMIC-lite verification
- verdict panel and sealed JSON receipt
- explicit extraction failure state for pages the web workbench cannot inspect
- real browser navigation controls: back, forward, reload, URL normalization
- tab state shared across desktop and mobile shells
- local sealed receipt history with copy/export actions
- desktop browser layout with workspace sidebar, tab strip, page viewport, and
  right-side verification inspector

## Native iOS App

This package also ships a Capacitor-backed iOS app at `ios/App`.

The iOS project is the installable mobile carrier for BIFROST Browser:

- app id: `com.jourdanlabs.bifrost.browser`
- app name: `BIFROST Browser`
- source web bundle: `dist`
- native carrier: Capacitor iOS with Swift Package Manager
- current verified path: local controlled AI lab -> extract visible answer -> COSMIC-lite verdict -> sealed receipt

The native iOS app uses a Swift WKWebView bridge for cross-origin page loading
and visible-answer extraction. When the bridge is absent, BIFROST fails closed
instead of pretending it can read the page.

Mobile uses the shared browser state and exposes tabs through the verification
drawer. iOS currently uses one active native WKWebView while the shared UI owns
the tab model; switching external tabs may reload that target. The desktop app
uses one BrowserView per external tab.

## Native macOS App

The macOS target is an Electron browser shell at `desktop/`.

- app id: `com.jourdanlabs.bifrost.browser`
- product name: `BIFROST Browser`
- source web bundle: `dist`
- native carrier: Electron BrowserWindow + BrowserView
- desktop layout: left workspace rail, top address controls, tab strip, central
  page viewport, right verification inspector
- external tabs preserve separate BrowserViews
- native navigation emits URL/title/back-forward/loading state to the renderer
- current verified path: controlled AI lab -> extract visible answer ->
  COSMIC-lite verdict -> sealed receipt
- current external page path: ChatGPT opens inside the native BrowserView with
  `NATIVE WEBVIEW` status

## Native Bridge Contract

A native wrapper can provide:

```ts
type Frame = { x: number; y: number; width: number; height: number };
type NativeState = {
  tabId?: string;
  url?: string;
  title?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  loading?: boolean;
};

window.BifrostNative = {
  openUrl(target: string | {
    tabId?: string;
    url: string;
    frame?: { x: number; y: number; width: number; height: number };
  }): void | Promise<void>,
  closeUrl(target?: { tabId?: string } | string): void | Promise<void>,
  activateTab(target: { tabId: string; frame?: Frame; visible?: boolean }): void | Promise<void>,
  updateFrame(target: { tabId: string; frame: Frame }): void | Promise<void>,
  goBack(target?: { tabId: string }): void | Promise<void>,
  goForward(target?: { tabId: string }): void | Promise<void>,
  reload(target?: { tabId: string }): void | Promise<void>,
  getState(target?: { tabId: string }): NativeState | Promise<NativeState>,
  extractVisibleAnswer(target?: { tabId: string }): {
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

## macOS Build

Run the desktop browser in development:

```bash
pnpm --filter @bifrost/browser desktop:dev
```

Package a local unsigned DMG:

```bash
pnpm --filter @bifrost/browser desktop:pack
```

The DMG lands in `apps/browser/desktop/release/`.

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
