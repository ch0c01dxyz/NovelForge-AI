#!/usr/bin/env bash
# NovelForge clean-clone verification — Ubuntu/Linux (bash).
# Fresh clone from the local repo HEAD -> pnpm install -> lint -> typecheck
# -> test -> build all apps -> docker compose config. Exits 0 only if every
# step passes. Usage: scripts/verify-clone.sh [source-repo-path] [--keep-dir]
set -euo pipefail

SOURCE="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
KEEP_DIR=0
[[ "${2:-}" == "--keep-dir" || "${1:-}" == "--keep-dir" ]] && KEEP_DIR=1
WORK_DIR="$(mktemp -d /tmp/novelforge-verify-XXXXXXXX)"
CLONE_DIR="$WORK_DIR/NovelForge-AI"
trap '[[ $KEEP_DIR -eq 1 ]] && echo "Work dir kept at: $WORK_DIR" || rm -rf "$WORK_DIR"' EXIT

echo "Source repo : $SOURCE"
echo "Clone target: $CLONE_DIR"

step() {
  local name="$1"; shift
  echo -e "\e[36m== $name ==\e[0m"
  "$@"
  echo -e "\e[32m-- $name OK\e[0m"
}

step "git clone" git clone --quiet "$SOURCE" "$CLONE_DIR"
cd "$CLONE_DIR"
step "pnpm install" pnpm install --frozen-lockfile
step "lint" pnpm lint
step "typecheck" pnpm typecheck
step "test" pnpm test
step "build apps" pnpm -r --filter "./apps/*" build
step "docker compose config" docker compose config --quiet

echo
echo -e "\e[32mCLEAN-CLONE VERIFICATION PASSED (Linux)\e[0m"
