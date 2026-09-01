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
echo "== 生成後の参照再検査 =="
# 生成スクリプトは静的チェックより後に走るので、生成物が参照切れを作っても
# 上の check-local-refs は見ていない。実際に 2026-08-31、画像をリポジトリ内へ
# 移した直後の generate-sekoukanri-variants.py が相対階層を1つ間違え、
# variant 12本に 39件の404を作った（チェックは「生成前」に通っていた）。
# 生成のあとにもう一度だけ参照を見る。
node scripts/check-local-refs.mjs
python3 scripts/generate-sekoukanri-variants.py > /dev/null
node scripts/check-local-refs.mjs

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
  # LPは50本以上あるが、広告費が乗っていて壊れると即CVを失うのは一部だけ
  # （Zoho商談の直近200件は denkikouji-v2 / denkikouji で占められている）。
  # 全部まとめて回すとメインの異常に気づくのが最後尾になるので、2段階に分ける。
  echo ""
  echo "== LPフォーム ローカルE2E ①現役11本 =="
  node scripts/e2e-lp-flow-local.mjs --tier active

  echo ""
  # アーカイブも本番では生きている。古い広告やブックマークから人が来るので外さない。
  echo "== LPフォーム ローカルE2E ②アーカイブ50本（本番では生きている） =="
  node scripts/e2e-lp-flow-local.mjs --tier archive
fi

echo ""
echo "✓ release-pre-check 完了（Slack投稿は LP送信→予約の目視を推奨）"
