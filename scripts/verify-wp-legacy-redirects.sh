#!/usr/bin/env bash
# WP旧URLが静的LPへ301されるか確認（deploy/wp-legacy-url-map.json ベース）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAP="${ROOT}/deploy/wp-legacy-url-map.json"
BASE="${WP_REDIRECT_VERIFY_BASE:-https://denkilp.builders-job.com}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq required" >&2
  exit 1
fi

check_redirect() {
  local path="$1"
  local expect="$2"
  local headers loc
  headers=$(/usr/bin/curl -sI "${BASE}${path}")
  loc=$(echo "$headers" | tr -d '\r' | grep -i '^location:' | head -1 || true)
  if echo "$loc" | grep -qi "$expect"; then
    echo "✓ ${path} → ${expect}"
    return 0
  fi
  echo "✗ ${path} expected Location containing ${expect}, got: ${loc:-none}" >&2
  return 1
}

echo "=== WP legacy redirects ==="
while IFS= read -r row; do
  from=$(echo "$row" | jq -r '.from')
  to=$(echo "$row" | jq -r '.to')
  check_redirect "$from" "$to"
done < <(jq -c '.redirects[]' "$MAP")

# UTM引き継ぎ
check_redirect "/denkikouji-kyujin-2/?utm_source=test" "/denki-lp-cvr/denkikouji/"

# -v2 が誤って denkikouji/-v2/ にならないこと
loc=$(/usr/bin/curl -sI "${BASE}/denkikouji-kyujin-2-v2/" | tr -d '\r' | grep -i '^location:' | head -1 || true)
if echo "$loc" | grep -qi '/denki-lp-cvr/denkikouji-v2/' && ! echo "$loc" | grep -q 'denkikouji/-v2'; then
  echo "✓ /denkikouji-kyujin-2-v2/ → denkikouji-v2 (not denkikouji/-v2)"
else
  echo "✗ /denkikouji-kyujin-2-v2/ bad redirect: ${loc:-none}" >&2
  exit 1
fi

echo "All WP legacy redirect checks passed."
