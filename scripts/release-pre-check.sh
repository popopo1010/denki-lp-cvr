#!/usr/bin/env bash
# リリース前一括チェック（静的 + 本番HTTP + 任意E2E）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== 0 禁止コピー/ラベル =="
python3 scripts/check-workflow-shell.py  # ワークフロー内シェルの構文（2026-09-04 STG #511 の再発防止）
node scripts/check-banned-copy.mjs
node scripts/check-kuma-anchor.mjs
node scripts/check-lazy-steps.mjs
node scripts/check-local-refs.mjs
node scripts/check-form-invariants.mjs # 消えやすいフォーム配線（スクロール/自己修復/クマ移動）
node scripts/check-input-attrs.mjs     # 入力欄の属性が全LPで揃っていること
node scripts/check-faq-schema.mjs      # FAQ本文と構造化データが一致していること
node scripts/check-asset-versions.mjs  # ?v= の上げ忘れ・不揃い
node scripts/check-lp-guard.js         # LPガード（本番反映手順書に載っている）
node scripts/check-denkikouji-release.mjs # denkikouji のコピー必須文言（ci.yml にしか無かった）
node scripts/check-agency-share.mjs   # 代理店共有シートに個人情報が出ないこと
node scripts/check-zoho-field-limits.mjs # Zoho項目の長さ超過で商談が作られない事故を防ぐ
node scripts/check-gas-row-integrity.mjs # 送信行の状態列を別人の行に書かない
node scripts/check-fv-images.mjs       # モバイルにPC用のFV画像を配らない
node scripts/check-minify-coverage.mjs # deploy.yml の minify 対象の取りこぼし

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
# verify-production-release.sh は set -e なので、本番ホストへ到達できない環境（Claude Code の
# サンドボックス等・egress 制限）では最初の curl が exit 56 で「無言で」落ちる（2026-09-16）。
# 到達できないこと自体は本番の異常ではないので、先に切り分けて理由を出す。
# 同じ確認は GitHub 側（probe-status.yml・deploy.yml の Verify deployment）が担う。
if [[ "${PRECHECK_SKIP_HTTP:-}" == "1" ]]; then
  echo "⚠ PRECHECK_SKIP_HTTP=1: 本番HTTP確認をスキップ（probe-status.yml / deploy の Verify deployment で代替）"
elif ! curl -sS -o /dev/null --max-time 20 "https://denkilp.builders-job.com/" 2>/tmp/precheck-curl.err; then
  echo "✗ 本番ホスト denkilp.builders-job.com へ到達できない（$(head -c 200 /tmp/precheck-curl.err)）"
  echo "  → この環境からは本番HTTP確認ができない。0〜5 は通過。本番の到達確認は GitHub 側の"
  echo "    probe-status.yml と deploy.yml の Verify deployment を見る（PRECHECK_SKIP_HTTP=1 で明示スキップ可）"
  exit 2
else
  bash scripts/verify-production-release.sh
fi

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
