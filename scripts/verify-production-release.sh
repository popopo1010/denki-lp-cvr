#!/usr/bin/env bash
# 本番リリース前 HTTP 確認（Deploy Verify と同等 + LP ブリッジ）
set -euo pipefail
BASE="${RELEASE_VERIFY_BASE:-https://denkilp.builders-job.com/denki-lp-cvr}"

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
  'thanks-v2-deferred.js?v=5' \
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
for needle in dk_job_intent dk_lead_profile '_tel' 'AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw' 'thanks-v2'; do
  if echo "$app" | grep -q "$needle"; then
    echo "✓ app-v2.js has $needle"
  else
    echo "✗ app-v2.js missing $needle (未デプロイの可能性)" >&2
    exit 1
  fi
done

echo "=== LP bridge (app.js + denkikouji HTML) ==="
denki_html=$(curl -s "$BASE/denkikouji/")
app_js=$(curl -s "$BASE/assets/js/app.js")
if echo "$denki_html" | grep -q 'app.js?v1780920000'; then
  echo "✓ denkikouji uses app.js cache buster v1780920000"
else
  echo "✗ denkikouji still on stale app.js (expect v1780920000)" >&2
  exit 1
fi
if echo "$denki_html" | grep -q 'app.js?v1779240000'; then
  echo "✗ denkikouji still references old app.js?v1779240000" >&2
  exit 1
fi
if echo "$app_js" | grep -q 'thanks-v2'; then
  echo "✓ app.js redirects to thanks-v2"
else
  echo "✗ app.js missing thanks-v2 path" >&2
  exit 1
fi
if echo "$app_js" | grep -q 'location.href = "/thanks/"'; then
  echo "✗ app.js still has old /thanks/ redirect" >&2
  exit 1
fi

echo ""
echo "All production checks passed."
