#!/usr/bin/env bash
# Meta 広告クリエイティブの legacy URL を recommended に一括更新（--apply で実行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAP="${ROOT}/deploy/wp-legacy-url-map.json"
META="${META_CLI:-/Users/ikeobook15/meta_ads_cli_env_313/bin/meta}"
APPLY=false
DRY_RUN=true

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true; DRY_RUN=false ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

if [[ -z "${AD_ACCOUNT_ID:-}" ]]; then
  echo "Set AD_ACCOUNT_ID (act_XXXX) before running." >&2
  exit 2
fi

echo "=== Meta Ads landing URL migration (dry_run=$DRY_RUN) ==="

pairs=$(jq -r '.adLandingUrls[] | .legacy[]? as $l | "\($l)\t\(.recommended)"' "$MAP" | sort -u)

raw=$("$META" --no-input --output json ads creative list --limit "${META_CREATIVE_LIMIT:-200}" 2>&1) || {
  echo "$raw" >&2
  exit 3
}

updated=0
echo "$raw" | jq -c '.data[]?' | while read -r creative; do
  id=$(echo "$creative" | jq -r '.id')
  name=$(echo "$creative" | jq -r '.name')
  link=$(echo "$creative" | jq -r '.object_story_spec.link_data.link // empty')
  [[ -z "$link" ]] && continue

  while IFS=$'\t' read -r legacy rec; do
    [[ -z "$legacy" ]] && continue
    if [[ "$link" == "$legacy"* ]] || [[ "$link" == "${legacy%/}"* ]]; then
      new_link="${link/$legacy/$rec}"
      new_link="${new_link/${legacy%/}/$rec}"
      echo "creative $id ($name)"
      echo "  $link"
      echo "  → $new_link"
      if [[ "$APPLY" == "true" ]]; then
        "$META" --no-input ads creative update "$id" --link-url "$new_link" || {
          echo "  update failed" >&2
          continue
        }
        echo "  updated"
        updated=$((updated + 1))
      fi
    fi
  done <<< "$pairs"
done

if [[ "$APPLY" != "true" ]]; then
  echo
  echo "Dry run only. Re-run with --apply to update creatives."
fi
