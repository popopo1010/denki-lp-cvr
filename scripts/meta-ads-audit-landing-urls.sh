#!/usr/bin/env bash
# Meta 広告クリエイティブのリンク先 URL を監査（legacy → recommended）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAP="${ROOT}/deploy/wp-legacy-url-map.json"
META="${META_CLI:-/Users/ikeobook15/meta_ads_cli_env_313/bin/meta}"
LIMIT="${META_CREATIVE_LIMIT:-200}"

if [[ ! -f "$MAP" ]]; then
  echo "Missing $MAP" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq required" >&2
  exit 1
fi

echo "=== Meta Ads landing URL audit ==="
if ! "$META" --no-input auth status >/dev/null 2>&1; then
  echo "Meta CLI not authenticated. Run: meta auth login" >&2
  exit 1
fi

if [[ -z "${AD_ACCOUNT_ID:-}" ]]; then
  echo "Set AD_ACCOUNT_ID (e.g. act_123456789) to list creatives." >&2
  echo "Legacy URLs still 301 via .htaccess; update ads when API is available." >&2
  exit 2
fi

raw=$("$META" --no-input --output json ads creative list --limit "$LIMIT" 2>&1) || {
  echo "$raw" >&2
  exit 3
}

legacy_patterns=$(jq -r '.adLandingUrls[] | .legacy[]?' "$MAP" | sort -u)
recommended=$(jq -c '.adLandingUrls[]' "$MAP")

echo "$raw" | jq -r '.data[]? | [.id, .name, (.object_story_spec.link_data.link // .asset_feed_spec.link_urls[0].website_url // .url_tags // "—")] | @tsv' 2>/dev/null | while IFS=$'\t' read -r id name link; do
  for legacy in $legacy_patterns; do
    if [[ "$link" == *"${legacy#https://}"* ]] || [[ "$link" == "$legacy"* ]]; then
      lp=$(echo "$recommended" | jq -r --arg l "$legacy" 'select(.legacy[]? == $l) | .lp' | head -1)
      rec=$(echo "$recommended" | jq -r --arg l "$legacy" 'select(.legacy[]? == $l) | .recommended' | head -1)
      echo "LEGACY  creative=$id  lp=$lp"
      echo "        name: $name"
      echo "        link: $link"
      echo "        → recommended: $rec"
      echo
    fi
  done
done

echo "Audit complete."
