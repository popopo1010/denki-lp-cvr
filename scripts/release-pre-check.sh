#!/usr/bin/env bash
# リリース前一括チェック（静的 + 本番HTTP + 任意E2E）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== 0 禁止コピー/ラベル =="
node scripts/check-banned-copy.mjs
node scripts/check-kuma-anchor.mjs
node scripts/check-lazy-steps.mjs
node scripts/check-local-refs.mjs
node scripts/check-form-invariants.mjs # 消えやすいフォーム配線（スクロール/自己修復/クマ移動）
node scripts/check-input-attrs.mjs     # 入力欄の属性が全LPで揃っていること
node scripts/check-faq-schema.mjs      # FAQ本文と構造化データが一致していること
node scripts/check-asset-versions.mjs  # ?v= の上げ忘れ・不揃い
node scripts/check-lp-guard.js         # LPガード（本番反映手順書に載っている）
node scripts/check-agency-share.mjs   # 代理店共有シートに個人情報が出ないこと
node scripts/check-company-info.mjs   # 会社情報が全ページで一致（別会社テンプレ由来の値の混入）

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
# 予約バックエンドはLINE一本化後の残置（ページ未読込）。deploy.yml と同様に
# GAS到達不可（プロキシ403等）でチェック全体を止めない（warning扱いで続行）
node scripts/sync-booking-slots.js || echo "⚠ 予約枠JSON同期に失敗（GAS未到達）。deployと同じく非致命として続行"

echo ""
echo "== 6/6 本番 HTTP =="
bash scripts/verify-production-release.sh

if [[ "${RUN_E2E:-}" == "1" ]]; then
  echo ""
  echo "== E2E (Playwright) =="
  node scripts/e2e-thanks-v2-release.mjs
  echo ""
  echo "== LPフォーム ローカルE2E（本番不要・主要LP） =="
  node scripts/e2e-lp-flow-local.mjs \
    --lp /denkikouji/ /sekoukanri/ /denkikouji-v2/ /sekoukanri-v2/ /sekoukanri-kentiku-v2/
fi

echo ""
echo "✓ release-pre-check 完了（Slack投稿は LP送信→予約の目視を推奨）"
