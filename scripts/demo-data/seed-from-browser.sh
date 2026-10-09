#!/usr/bin/env bash
# Open the in-app browser seed loader.
# Prerequisites: `pnpm demo:generate` and `pnpm dev` (or electron:dev).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SEED_FILE="$ROOT/public/demo-data/seed-data.json"
BASE_URL="${PAISA_WATCH_URL:-http://localhost:3000}"

if [[ ! -f "$SEED_FILE" ]]; then
  echo "Missing $SEED_FILE — run: pnpm demo:generate" >&2
  exit 1
fi

open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url"
  else
    echo "Open this URL in your browser: $url"
  fi
}

echo "Opening $BASE_URL/dev/seed — click “Load seed data” in the browser."
open_url "$BASE_URL/dev/seed"
