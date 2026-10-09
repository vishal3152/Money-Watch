#!/usr/bin/env bash
# Production release: tests → typecheck → Electron package → GitHub Release → Vercel.
#
# Prerequisites:
#   - `gh auth login` (GitHub CLI) with permission to create releases on this repo
#   - `pnpm exec vercel login` once (or set VERCEL_TOKEN for CI)
#   - Project linked (`pnpm exec vercel link --yes --project <name>`) or first
#     deploy creates one using package.json `name` (must be lowercase; the
#     folder name e.g. Paisa-Watch-1 is not a valid Vercel project name)
#   - Production env vars set in the Vercel project (Dashboard → Settings → Environment Variables):
#       DEPLOYMENT_MODE=cloud
#       NEXT_PUBLIC_SUPABASE_URL
#       NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
#       POSTGRES_URL
#
# Env:
#   VERCEL_TOKEN   — optional; enables non-interactive CI deploys
#   VERCEL_ORG_ID / VERCEL_PROJECT_ID — optional; set automatically after `vercel link`
#
# Flags:
#   --skip-tests
#   --skip-typecheck
#   --skip-electron
#   --skip-github
#   --skip-vercel
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_TESTS=0
SKIP_TYPECHECK=0
SKIP_ELECTRON=0
SKIP_GITHUB=0
SKIP_VERCEL=0

for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --skip-typecheck) SKIP_TYPECHECK=1 ;;
    --skip-electron) SKIP_ELECTRON=1 ;;
    --skip-github) SKIP_GITHUB=1 ;;
    --skip-vercel) SKIP_VERCEL=1 ;;
    -h|--help)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

# Keep step order in sync with scripts/release-steps.ts (tested).
STEPS=()
if [[ "$SKIP_TESTS" -eq 0 ]]; then STEPS+=("test"); fi
if [[ "$SKIP_TYPECHECK" -eq 0 ]]; then STEPS+=("typecheck"); fi
if [[ "$SKIP_ELECTRON" -eq 0 ]]; then STEPS+=("electron"); fi
if [[ "$SKIP_GITHUB" -eq 0 ]]; then STEPS+=("github"); fi
if [[ "$SKIP_VERCEL" -eq 0 ]]; then STEPS+=("vercel"); fi

if [[ "${#STEPS[@]}" -eq 0 ]]; then
  echo "error: Nothing to run: every release step was skipped." >&2
  exit 1
fi

echo "==> Release plan: ${STEPS[*]}"

upload_github_release() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "error: GitHub CLI (gh) not found on PATH" >&2
    exit 1
  fi

  local version tag
  version="$(node -p "require('./package.json').version")"
  tag="v${version}"

  shopt -s nullglob
  local assets=(dist/electron/*.dmg dist/electron/*.zip dist/electron/*.AppImage dist/electron/*.exe)
  shopt -u nullglob

  if [[ "${#assets[@]}" -eq 0 ]]; then
    echo "error: no Electron .dmg/.zip/.AppImage/.exe under dist/electron/ — run the electron step first" >&2
    exit 1
  fi

  echo "==> GitHub Release ${tag} (${#assets[@]} asset(s))"

  if gh release view "$tag" >/dev/null 2>&1; then
    gh release upload "$tag" "${assets[@]}" --clobber
  else
    gh release create "$tag" "${assets[@]}" \
      --title "Paisa-Watch ${tag}" \
      --generate-notes
  fi

  echo "==> GitHub Release URL: $(gh release view "$tag" --json url -q .url)"
}

for step in "${STEPS[@]}"; do
  case "$step" in
    test)
      echo "==> Running tests"
      pnpm test
      ;;
    typecheck)
      echo "==> Typecheck"
      pnpm typecheck
      ;;
    electron)
      echo "==> Building production Electron package"
      bash "$ROOT/scripts/package-electron.sh"
      ;;
    github)
      upload_github_release
      ;;
    vercel)
      echo "==> Deploying to Vercel (production)"
      # --yes: skip confirmation prompts when already linked / token present
      # --project: explicit lowercase name — directory names like Paisa-Watch-1
      # are rejected by Vercel's project-name API (must be lowercase).
      vercel_project="$(node -p "require('./package.json').name")"
      pnpm exec vercel deploy --prod --yes --project "$vercel_project"
      ;;
  esac
done

echo "==> Release finished"
