#!/usr/bin/env bash

set -euo pipefail

REPOSITORY="Complexity-ML/game-lab"
RELEASE_TAG="setup-latest"
CHANNEL="stable"

usage() {
  cat <<'EOF'
Install and open GAME LAB Setup on macOS.

Usage:
  install-game-lab-macos.sh [--channel stable|main]

Options:
  --channel stable  Install the latest published GAME LAB release (default).
  --channel main    Build and install the newest commit from main.
  -h, --help        Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)
      [[ $# -ge 2 ]] || {
        echo "Missing value after --channel." >&2
        exit 2
      }
      CHANNEL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$CHANNEL" != "stable" && "$CHANNEL" != "main" ]]; then
  echo "Channel must be stable or main." >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer supports macOS only." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64|aarch64)
    ARCHITECTURE="arm64"
    ;;
  x86_64)
    ARCHITECTURE="x64"
    ;;
  *)
    echo "Unsupported Mac architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

for command_name in curl shasum install awk; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

ASSET_NAME="GAME-LAB-Setup-${ARCHITECTURE}-helper"
DOWNLOAD_BASE="https://github.com/${REPOSITORY}/releases/download/${RELEASE_TAG}"
TEMP_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/game-lab-setup.XXXXXX")"
DOWNLOADED_HELPER="${TEMP_DIRECTORY}/${ASSET_NAME}"
DOWNLOADED_CHECKSUM="${DOWNLOADED_HELPER}.sha256"
INSTALL_DIRECTORY="${HOME}/Library/Application Support/GAME LAB/installer"
INSTALLED_HELPER="${INSTALL_DIRECTORY}/game-lab-setup"
SETUP_LOG="${TMPDIR:-/tmp}/game-lab-setup.log"

cleanup() {
  rm -rf "$TEMP_DIRECTORY"
}
trap cleanup EXIT

download() {
  local url="$1"
  local destination="$2"
  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --retry 3 \
    --retry-delay 2 \
    --connect-timeout 15 \
    --output "$destination" \
    "$url"
}

echo "Downloading GAME LAB Setup for ${ARCHITECTURE}…"
download "${DOWNLOAD_BASE}/${ASSET_NAME}" "$DOWNLOADED_HELPER"
download "${DOWNLOAD_BASE}/${ASSET_NAME}.sha256" "$DOWNLOADED_CHECKSUM"

EXPECTED_CHECKSUM="$(awk 'NR == 1 { print $1 }' "$DOWNLOADED_CHECKSUM")"
ACTUAL_CHECKSUM="$(shasum -a 256 "$DOWNLOADED_HELPER" | awk '{ print $1 }')"

if [[ -z "$EXPECTED_CHECKSUM" || "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]]; then
  echo "GAME LAB Setup checksum verification failed. Nothing was installed." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIRECTORY"
install -m 755 "$DOWNLOADED_HELPER" "$INSTALLED_HELPER"
printf '%s' "$CHANNEL" >"${INSTALL_DIRECTORY}/channel"

# The preview is intentionally unsigned. Remove quarantine only from the
# checksum-verified helper downloaded above.
xattr -d com.apple.quarantine "$INSTALLED_HELPER" 2>/dev/null || true

echo "Opening GAME LAB Setup (${CHANNEL})…"
nohup "$INSTALLED_HELPER" --channel "$CHANNEL" >"$SETUP_LOG" 2>&1 </dev/null &
SETUP_PROCESS=$!
sleep 1

if ! kill -0 "$SETUP_PROCESS" 2>/dev/null; then
  echo "GAME LAB Setup could not be opened. Log: $SETUP_LOG" >&2
  if [[ -s "$SETUP_LOG" ]]; then
    tail -n 20 "$SETUP_LOG" >&2
  fi
  exit 1
fi

echo "GAME LAB Setup is open. Choose the source and confirm installation in its window."
