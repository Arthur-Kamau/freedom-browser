#!/usr/bin/env bash
# Reproduce the vendored aqua-rs-sdk WASM build under src/main/aqua/vendor/.
#
# Usage: scripts/build-aqua-wasm.sh <git-tag-or-commit> [path-to-aqua-rs-sdk-checkout]
#
# Builds the SDK at exactly that ref in a detached git worktree with
# `wasm-pack --target nodejs --features wasm`, copies the package into the
# vendor directory and rewrites PROVENANCE. Needs rustup with the
# wasm32-unknown-unknown target and wasm-pack on PATH. Commit the result
# together with the PROVENANCE change.
set -euo pipefail

REF="${1:?git tag or commit of aqua-rs-sdk}"
SDK="${2:-${AQUA_RS_SDK_DIR:-}}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$HERE/src/main/aqua/vendor/aqua-rs-sdk"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -z "$SDK" ]; then
  git clone --quiet https://github.com/inblockio/aqua-rs-sdk "$WORK/sdk"
  SDK="$WORK/sdk"
fi
git -C "$SDK" worktree add --detach "$WORK/src" "$REF" >/dev/null
trap 'git -C "$SDK" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

COMMIT="$(git -C "$WORK/src" rev-parse "HEAD^{commit}")"
(cd "$WORK/src" && wasm-pack build --release --target nodejs --out-dir "$WORK/pkg" --features wasm)

mkdir -p "$VENDOR"
for f in aqua_rs_sdk.js aqua_rs_sdk_bg.wasm aqua_rs_sdk.d.ts aqua_rs_sdk_bg.wasm.d.ts package.json LICENSE; do
  cp "$WORK/pkg/$f" "$VENDOR/$f"
done

CRATE="$(grep -m1 '^version' "$WORK/src/Cargo.toml" | sed 's/.*"\(.*\)".*/\1/')"
PROTO="$(node -e "console.log(require('$VENDOR/aqua_rs_sdk.js').protocolVersion())")"
{
  echo "# Vendored build of aqua-rs-sdk for Freedom Browser (main process, worker thread)"
  echo "source_repo: https://github.com/inblockio/aqua-rs-sdk"
  echo "source_tag: $REF"
  echo "source_commit: $COMMIT"
  echo "crate_version: $CRATE"
  echo "protocol_version: $PROTO"
  echo "built_on: $(date -u +%Y-%m-%d)"
  echo "wasm_pack: $(wasm-pack --version | awk '{print $2}')"
  echo "rustc: $(rustc --version | awk '{print $2}')"
  echo "target: wasm32-unknown-unknown"
  echo "command: wasm-pack build --release --target nodejs --out-dir <out> --features wasm"
  echo "sha256_wasm: $(sha256sum "$VENDOR/aqua_rs_sdk_bg.wasm" | awk '{print $1}')"
  echo "sha256_js: $(sha256sum "$VENDOR/aqua_rs_sdk.js" | awk '{print $1}')"
  echo "reproduce: scripts/build-aqua-wasm.sh $REF"
} > "$VENDOR/PROVENANCE"
echo "Vendored aqua-rs-sdk $REF ($COMMIT) into $VENDOR"
