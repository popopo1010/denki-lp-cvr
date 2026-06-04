#!/usr/bin/env bash
# リリース前一括チェック（静的 + 本番HTTP + 任意E2E）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== 1/5 thanks-v2 静的 =="
node scripts/check-thanks-v2-release.mjs

echo ""
echo "== 2/5 LP→GAS ブリッジ =="
node scripts/check-lp-bridge-release.mjs

echo ""
echo "== 3/6 LP /thanks/ → thanks-v2 転送 =="
node scripts/generate-lp-thanks-redirects.mjs

echo ""
echo "== 4/6 thanks-v2 ミラー同期 =="
node scripts/sync-thanks-v2-mirrors.mjs

echo ""
echo "== 5/6 予約枠 JSON =="
node scripts/sync-booking-slots.js

echo ""
echo "== 6/6 本番 HTTP =="
bash scripts/verify-production-release.sh

if [[ "${RUN_E2E:-}" == "1" ]]; then
  echo ""
  echo "== E2E (Playwright) =="
  node scripts/e2e-thanks-v2-release.mjs
fi

echo ""
echo "✓ release-pre-check 完了（Slack投稿は LP送信→予約の目視を推奨）"
