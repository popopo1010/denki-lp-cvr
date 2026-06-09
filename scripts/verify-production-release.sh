#!/usr/bin/env bash
# 本番リリース前 HTTP 確認（Deploy Verify と同等 + LP ブリッジ）
set -euo pipefail
BASE="${RELEASE_VERIFY_BASE:-https://denkilp.builders-job.com/denki-lp-cvr}"
CACHE_BUSTER="${RELEASE_APP_JS_CACHE:-v1780930000}"
MAX_ATTEMPTS="${RELEASE_VERIFY_ATTEMPTS:-6}"
RETRY_SLEEP="${RELEASE_VERIFY_SLEEP:-15}"

check_200() {
  local url="$1"
  local code
  code=$(curl -sI -o /dev/null -w "%{http_code}" "$url")
  if [[ "$code" == "200" ]]; then
    echo "✓ $url ($code)"
  else
    echo "✗ $url (HTTP $code)" >&2
    return 1
  fi
}

echo "=== HTTP 200 ==="
check_200 "$BASE/thanks-v2/"
check_200 "$BASE/denkikouji-v2/"
check_200 "$BASE/sekoukanri-kentiku-v2/"
check_200 "$BASE/assets/data/booking-slots.json"
check_200 "$BASE/assets/js/app-v2.js"
check_200 "$BASE/assets/js/app.js"
check_200 "$BASE/denkikouji/thanks/"

echo "=== denkikouji/thanks redirect ==="
denki_thanks=$(curl -s "$BASE/denkikouji/thanks/?lp=denkikouji")
if echo "$denki_thanks" | grep -q '/denki-lp-cvr/thanks-v2/'; then
  echo "✓ denkikouji/thanks → thanks-v2 redirect page"
else
  echo "✗ denkikouji/thanks still old WP redirect (deploy generate-lp-thanks-redirects?)" >&2
  exit 1
fi
loc=$(curl -sI "$BASE/denkikouji/thanks/" | tr -d '\r' | grep -i '^location:' || true)
if echo "$loc" | grep -q 'builders-job.com/thanks/'; then
  echo "✗ denkikouji/thanks HTTP redirect still points to WP /thanks/" >&2
  exit 1
fi
echo "✓ denkikouji/thanks not WP 301"

echo "=== thanks-v2 HTML ==="
html=$(curl -s "$BASE/thanks-v2/")
for needle in \
  'thanks-v2-deferred.js?v=7' \
  'thanks-page-context.js?v=21' \
  'thanks-booking-custom.js?v=27' \
  't-hero--compact' \
  'id="t-future"' \
  'data-story-id'; do
  if echo "$html" | grep -q "$needle"; then
    echo "✓ HTML contains $needle"
  else
    echo "✗ HTML missing $needle" >&2
    exit 1
  fi
done

echo "=== booking-slots.json ==="
slots=$(curl -s "$BASE/assets/data/booking-slots.json")
echo "$slots" | grep -qE '"staff_count"[[:space:]]*:[[:space:]]*4' || {
  echo "✗ staff_count not 4" >&2
  exit 1
}
echo "✓ staff_count=4"

echo "=== LP bridge (app-v2.js) ==="
app=$(curl -s "$BASE/assets/js/app-v2.js")
for needle in dk_job_intent dk_lead_profile '_tel' 'AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw' 'thanks-v2' '09012345678'; do
  if echo "$app" | grep -q "$needle"; then
    echo "✓ app-v2.js has $needle"
  else
    echo "✗ app-v2.js missing $needle (未デプロイの可能性)" >&2
    exit 1
  fi
done

echo "=== LP bridge (app.js + denkikouji HTML) ==="
verify_denki_lp() {
  local denki_html app_js
  denki_html=$(curl -s "$BASE/denkikouji/")
  app_js=$(curl -s "$BASE/assets/js/app.js")
  echo "$denki_html" | grep -q "app.js?${CACHE_BUSTER}" || return 1
  echo "$denki_html" | grep -q 'app.js?v1779240000' && return 1
  echo "$app_js" | grep -q 'thanks-v2' || return 1
  echo "$app_js" | grep -q 'location.href = "/thanks/"' && return 1
  echo "$app_js" | grep -q '09012345678' || return 1
  return 0
}

verified=false
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if verify_denki_lp; then
    echo "✓ denkikouji uses app.js cache buster ${CACHE_BUSTER} (attempt ${attempt})"
    echo "✓ app.js redirects to thanks-v2"
    echo "✓ app.js has test-lead guard"
    verified=true
    break
  fi
  echo "… denkikouji LP not propagated yet (${attempt}/${MAX_ATTEMPTS}), waiting ${RETRY_SLEEP}s"
  sleep "$RETRY_SLEEP"
done
if [[ "$verified" != "true" ]]; then
  echo "✗ denkikouji still on stale app.js (expect ${CACHE_BUSTER})" >&2
  exit 1
fi

echo ""
echo "All production checks passed."
