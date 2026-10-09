#!/usr/bin/env bash
# Build production Electron packages: macOS (dmg+zip) on a macOS host, or
# Linux (AppImage) + Windows (nsis) on a Linux host — each platform's
# electron-builder target needs its own prebuild-pruned resources copy, since
# better-sqlite3 ships one native module per platform/arch (see below).
# Pass platform names (mac/linux/win) as args to override the host default.
# Building the Windows target from a non-Windows host needs Wine (wine64 + wine32/i386)
# installed — see the preflight check below for why and the install command.
# Assumes tests were already run by `scripts/release.sh` (or run `pnpm test` yourself).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$#" -gt 0 ]]; then
  PLATFORMS=("$@")
else
  case "$(uname -s)" in
    Darwin) PLATFORMS=(mac) ;;
    Linux) PLATFORMS=(linux win) ;;
    *)
      echo "error: unsupported host OS '$(uname -s)' for Electron packaging; pass target platforms explicitly (mac/linux/win)" >&2
      exit 1
      ;;
  esac
fi

for platform in "${PLATFORMS[@]}"; do
  case "$platform" in
    mac|linux|win) ;;
    *)
      echo "error: unknown Electron target platform '$platform' (expected mac, linux, or win)" >&2
      exit 1
      ;;
  esac

  # Building the Windows NSIS installer from a non-Windows host needs Wine: electron-builder
  # runs the freshly-built installer.exe itself (via Wine) to produce the uninstaller.exe,
  # which needs both wine64 and wine32 (a 32-bit NSIS installer stub runs under Wow64) — without
  # it the build fails deep inside electron-builder with a cryptic "wine process failed ENOENT".
  if [[ "$platform" == "win" && "$(uname -s)" != "Windows_NT" ]] && ! command -v wine >/dev/null 2>&1; then
    echo "error: building the Windows target from a non-Windows host requires Wine (wine64 + wine32/i386), e.g. on Ubuntu:" >&2
    echo "  sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine wine32:i386" >&2
    exit 1
  fi
done

RESOURCES_DIR="$ROOT/dist/electron-resources/_build"
APP_DIR="$ROOT/dist/electron-app"
STANDALONE_DIR="$ROOT/.next/standalone"
STATIC_DIR="$ROOT/.next/static"
ENV_STASH_DIR="$ROOT/.paisa-watch-env-stash"

# Next.js dotenv files that can carry secrets / NEXT_PUBLIC_* inlines.
# Explicit names only — never scoop `.env.example` / `env.example` via a broad `.env.*` glob.
STASHABLE_ENV_FILES=(
  .env
  .env.local
  .env.development
  .env.development.local
  .env.production
  .env.production.local
  .env.test
  .env.test.local
)

restore_env_files() {
  if [[ ! -d "$ENV_STASH_DIR" ]]; then
    return 0
  fi

  # Move stashed dotenv files back even if the build failed or was interrupted.
  # Idempotent: safe to call at start (recover prior crash) and on EXIT.
  # dotglob is required — stash entries are named `.env*` and plain `*` skips them
  # (that miss is what stranded files under TMPDIR before).
  local f base
  shopt -s nullglob dotglob
  for f in "$ENV_STASH_DIR"/*; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    # Never restore a directory entry (`.` / `..` are excluded by the glob; be strict anyway).
    [[ "$base" == "." || "$base" == ".." ]] && continue
    echo "==> Restoring $base from Electron env stash"
    mv -f "$f" "$ROOT/$base"
  done
  shopt -u nullglob dotglob

  # Only remove the stash dir once empty — refuse to rm -rf if anything remains.
  if [[ -n "$(find "$ENV_STASH_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
    echo "error: Electron env stash was not fully restored; leaving $ENV_STASH_DIR intact" >&2
    return 1
  fi
  rmdir "$ENV_STASH_DIR" 2>/dev/null || true
}

stash_env_files() {
  # Next.js auto-loads dotenv files from the project root and can inline NEXT_PUBLIC_*
  # into the client bundle. Desktop is local-only — cloud credentials must not
  # be present during the Electron package build.
  restore_env_files

  mkdir -p "$ENV_STASH_DIR"
  local name
  for name in "${STASHABLE_ENV_FILES[@]}"; do
    if [[ -f "$ROOT/$name" ]]; then
      echo "==> Stashing $name away from Electron build"
      mv "$ROOT/$name" "$ENV_STASH_DIR/"
    fi
  done

  # If nothing was stashed, drop the empty dir so a later restore is a no-op.
  rmdir "$ENV_STASH_DIR" 2>/dev/null || true
}

assert_no_env_files_in_tree() {
  local tree="$1"
  local found=""
  local name
  for name in "${STASHABLE_ENV_FILES[@]}"; do
    found+=$(find "$tree" -name "$name" 2>/dev/null || true)
    found+=$'\n'
  done
  found="$(printf '%s' "$found" | sed '/^$/d')"
  if [[ -n "$found" ]]; then
    echo "error: env/credential files must not ship in the Electron package:" >&2
    echo "$found" >&2
    exit 1
  fi
}

# EXIT covers normal finish, `exit`, and signal-driven exits from the handlers below.
# INT/TERM explicitly exit so EXIT runs restore (SIGKILL still cannot be trapped).
trap restore_env_files EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "==> Cleaning previous Electron resources"
rm -rf "$ROOT/dist/electron-resources" "$APP_DIR" "$ROOT/.next"
mkdir -p "$RESOURCES_DIR/next" "$APP_DIR/electron"

stash_env_files

echo "==> Building Next.js standalone output for Electron (no dotenv files loaded)"
# Explicit local desktop env only — do not inherit cloud secrets from the shell either.
env -u NEXT_PUBLIC_SUPABASE_URL \
  -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  -u POSTGRES_URL \
  -u CRON_SECRET \
  -u VERCEL_OIDC_TOKEN \
  -u VERCEL_TOKEN \
  ELECTRON_PACKAGE=1 \
  DEPLOYMENT_MODE=local \
  PAISA_WATCH_DESKTOP=1 \
  pnpm build

if [[ ! -f "$STANDALONE_DIR/server.js" ]]; then
  echo "error: expected $STANDALONE_DIR/server.js after ELECTRON_PACKAGE=1 build" >&2
  exit 1
fi

echo "==> Assembling extraResources tree"
# pnpm/standalone may nest the app under a package folder; prefer the tree that has server.js at root.
if [[ -f "$STANDALONE_DIR/server.js" ]]; then
  cp -R "$STANDALONE_DIR"/. "$RESOURCES_DIR/next/"
else
  echo "error: standalone output missing server.js" >&2
  exit 1
fi

mkdir -p "$RESOURCES_DIR/next/.next"
cp -R "$STATIC_DIR" "$RESOURCES_DIR/next/.next/static"
if [[ -d "$ROOT/public" ]]; then
  mkdir -p "$RESOURCES_DIR/next/public"
  cp -R "$ROOT/public"/. "$RESOURCES_DIR/next/public/"
fi

# Build-time DB artifacts and any accidental dotenv copies must not ship.
rm -f "$RESOURCES_DIR/next/paisa-watch.db" "$RESOURCES_DIR/next/"*.db
# Same allowlist as stash — do not touch env.example / .env.example if somehow present.
for name in "${STASHABLE_ENV_FILES[@]}"; do
  find "$RESOURCES_DIR" -name "$name" -delete
done

cp -R "$ROOT/drizzle" "$RESOURCES_DIR/drizzle"

echo "==> Bundling prepare-database into next/ (so require resolves better-sqlite3)"
mkdir -p "$RESOURCES_DIR/next/scripts"
pnpm exec esbuild "$ROOT/scripts/prepare-database.ts" \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile="$RESOURCES_DIR/next/scripts/prepare-database.cjs" \
  --alias:@="$ROOT/src" \
  --external:better-sqlite3

# Ensure the native module the bundled prepare script needs is reachable from next's node_modules.
if [[ ! -d "$RESOURCES_DIR/next/node_modules/better-sqlite3" ]]; then
  echo "error: better-sqlite3 missing from standalone output; cannot package desktop DB bootstrap" >&2
  exit 1
fi

# better-sqlite3 ships one prebuilt .node per platform/arch; standalone tracing
# can't know at build time which one runs, so it copies all 8 into every build
# (~15MB of dead weight per target). Each electron-builder platform target
# gets its own pruned copy of the resources tree (package.json's build.<mac|linux|win>
# each point extraResources at dist/electron-resources/<platform>/) since mac/linux/win
# packages each need a different single prebuild kept.
better_sqlite3_prebuild_for() {
  local platform="$1"
  local arch
  arch="$(uname -m)"
  case "$platform" in
    mac)
      case "$arch" in
        arm64) echo "darwin-arm64.node" ;;
        x86_64) echo "darwin-x64.node" ;;
        *) return 1 ;;
      esac
      ;;
    linux)
      case "$arch" in
        aarch64|arm64) echo "linux-arm64.node" ;;
        x86_64) echo "linux-x64.node" ;;
        *) return 1 ;;
      esac
      ;;
    win)
      # Cross-packaged from a non-Windows host regardless of host arch — x64 is
      # the common case; Windows-on-arm64 desktop is not requested/supported here.
      echo "win32-x64.node"
      ;;
    *)
      return 1
      ;;
  esac
}

electron_builder_args=()
for platform in "${PLATFORMS[@]}"; do
  KEEP_PREBUILD="$(better_sqlite3_prebuild_for "$platform")" || {
    echo "error: no better-sqlite3 prebuild mapping for platform '$platform' on host arch '$(uname -m)'" >&2
    exit 1
  }

  PLATFORM_RESOURCES_DIR="$ROOT/dist/electron-resources/$platform"
  echo "==> Pruning better-sqlite3 prebuilds for $platform (keeping $KEEP_PREBUILD)"
  rm -rf "$PLATFORM_RESOURCES_DIR"
  mkdir -p "$PLATFORM_RESOURCES_DIR"
  cp -R "$RESOURCES_DIR"/. "$PLATFORM_RESOURCES_DIR/"

  # -print -quit (not a `| head -1` pipe, which trips `set -o pipefail` on a `find` that keeps
  # writing after the reader closes) stops at the first match — dirname only ever wants one path,
  # and would otherwise choke on multiple lines if node_modules ever nested a second copy.
  BETTER_SQLITE3_PREBUILDS_DIR="$(dirname "$(find "$PLATFORM_RESOURCES_DIR/next/node_modules" -path '*/better-sqlite3/package.json' -print -quit)")/prebuilds"
  if [[ ! -f "$BETTER_SQLITE3_PREBUILDS_DIR/$KEEP_PREBUILD" ]]; then
    echo "error: expected $BETTER_SQLITE3_PREBUILDS_DIR/$KEEP_PREBUILD to exist" >&2
    exit 1
  fi
  find "$BETTER_SQLITE3_PREBUILDS_DIR" -type f -name '*.node' ! -name "$KEEP_PREBUILD" -delete

  assert_no_env_files_in_tree "$PLATFORM_RESOURCES_DIR"

  case "$platform" in
    mac) electron_builder_args+=(--mac dmg zip) ;;
    linux) electron_builder_args+=(--linux AppImage) ;;
    win) electron_builder_args+=(--win nsis) ;;
  esac
done

# Master unpruned copy is no longer needed once every platform has its own pruned copy.
rm -rf "$RESOURCES_DIR"

echo "==> Staging Electron app directory (empty deps — avoid packing project node_modules into asar)"
cp "$ROOT/electron/main.cjs" "$ROOT/electron/preload.cjs" "$ROOT/electron/app-paths.cjs" "$APP_DIR/electron/"
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const rootPkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const staged = {
  name: rootPkg.name,
  version: rootPkg.version,
  private: true,
  main: "electron/main.cjs",
  dependencies: {}
};
fs.writeFileSync(
  path.join(process.cwd(), "dist/electron-app/package.json"),
  `${JSON.stringify(staged, null, 2)}\n`
);
NODE

assert_no_env_files_in_tree "$APP_DIR"

echo "==> Packaging with electron-builder (${PLATFORMS[*]})"
# Packaged Next/prepare children run under Electron-as-Node. better-sqlite3 ≥13
# ships platform prebuilds that load under Electron 44's Node; no electron-rebuild.
pnpm exec electron-builder "${electron_builder_args[@]}" --publish never

assert_no_env_files_in_tree "$ROOT/dist/electron"

echo "==> Electron package(s) written under dist/electron/"
