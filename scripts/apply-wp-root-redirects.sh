#!/usr/bin/env bash
# WP ドキュメントルートの .htaccess に旧LP→静的LP 301 を idempotent 適用
set -euo pipefail

FRAGMENT="${1:-deploy/wp-legacy-redirects.htaccess.fragment}"
MARKER_BEGIN="# BEGIN dk-lp-legacy-redirects"
MARKER_END="# END dk-lp-legacy-redirects"

for name in XSERVER_HOST XSERVER_PORT XSERVER_USER XSERVER_DEPLOY_PATH; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing env: $name" >&2
    exit 1
  fi
done

if [[ ! -f "$FRAGMENT" ]]; then
  echo "Fragment not found: $FRAGMENT" >&2
  exit 1
fi

WP_ROOT="$(dirname "${XSERVER_DEPLOY_PATH%/}")"
SSH=(ssh -p "$XSERVER_PORT" -i "${HOME}/.ssh/id_ed25519"
  -o ConnectTimeout=60 -o ServerAliveInterval=15
  "${XSERVER_USER}@${XSERVER_HOST}")

echo "Applying WP legacy redirects to ${WP_ROOT}/.htaccess"

FRAGMENT_B64=$(base64 < "$FRAGMENT" | tr -d '\n')

"${SSH[@]}" "WP_ROOT='${WP_ROOT}' MARKER_BEGIN='${MARKER_BEGIN}' MARKER_END='${MARKER_END}' FRAGMENT_B64='${FRAGMENT_B64}' bash -s" <<'REMOTE'
set -euo pipefail
HT="${WP_ROOT}/.htaccess"
FRAGMENT=$(echo "$FRAGMENT_B64" | base64 -d)
TMP="$(mktemp)"
FRAG_TMP="$(mktemp)"

printf '%s\n' "$FRAGMENT" > "$FRAG_TMP"

if [[ -f "$HT" ]]; then
  cp "$HT" "${HT}.bak.$(date +%s)"
  awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
    $0 == begin { skip=1; next }
    $0 == end { skip=0; next }
    !skip { print }
  ' "$HT" > "$TMP"
else
  : > "$TMP"
fi

{ cat "$FRAG_TMP"; echo; cat "$TMP"; } > "${HT}.new"
mv "${HT}.new" "$HT"
rm -f "$TMP" "$FRAG_TMP"
echo "Updated $HT"
REMOTE

echo "Done."
