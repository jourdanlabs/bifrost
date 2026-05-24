#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${BIFROST_REPO_URL:-https://github.com/jourdanlabs/bifrost.git}"
INSTALL_DIR="${BIFROST_INSTALL_DIR:-$HOME/.bifrost}"
PORT="${BIFROST_PORT:-8787}"
SERVICE_ID="com.jourdanlabs.bifrost-cosmic-lite"

log() {
  printf '[bifrost-install] %s\n' "$*"
}

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[bifrost-install] missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

need git
need node

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    log "enabling pnpm through corepack"
    corepack enable pnpm >/dev/null 2>&1 || true
  fi
fi
need pnpm

if [ -d "$INSTALL_DIR/.git" ]; then
  log "updating $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  log "cloning $REPO_URL -> $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

log "installing dependencies"
pnpm install

log "building local verifier + Chrome extension"
pnpm --filter @bifrost/types build
pnpm --filter @bifrost/cosmic-lite build
pnpm --filter @bifrost/extension build

if [ "${BIFROST_SKIP_SERVICE:-0}" = "1" ]; then
  log "skipping service install because BIFROST_SKIP_SERVICE=1"
elif [ "$(uname -s)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/$SERVICE_ID.plist"
  NODE_BIN="$(command -v node)"
  log "installing macOS LaunchAgent $SERVICE_ID"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$SERVICE_ID</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$INSTALL_DIR/services/cosmic-lite/dist/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>$PORT</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/bifrost-cosmic-lite.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/bifrost-cosmic-lite.err.log</string>
</dict>
</plist>
PLIST
  launchctl unload "$PLIST" >/dev/null 2>&1 || true
  launchctl load "$PLIST"
  launchctl kickstart -k "gui/$(id -u)/$SERVICE_ID" >/dev/null 2>&1 || true
else
  log "non-macOS detected; start manually with:"
  log "  cd $INSTALL_DIR && PORT=$PORT pnpm --filter @bifrost/cosmic-lite start"
fi

log "checking verifier"
if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null; then
  log "BIFROST verifier is live at http://127.0.0.1:$PORT/verify"
else
  log "verifier did not answer yet; check logs, then retry http://127.0.0.1:$PORT/healthz"
fi

cat <<EOF

BIFROST installed.

Chrome extension folder:
  $INSTALL_DIR/apps/extension/dist

Load it in Chrome:
  chrome://extensions -> Developer Mode -> Load unpacked -> select the folder above

EOF
