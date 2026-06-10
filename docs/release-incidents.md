# リリースインシデント記録（denkikouji / thanks-v2）

再発防止用。リリース前は `docs/CV-LINE-playbook.md` のチェックリストと併用。

## 2026-06-10 Deploy 3連続失敗（本番が古いまま）

**症状:** `Deploy to Xserver` が success にならず、本番 LP が `cvr-boost-denkikouji.css?v20260619` のまま。UX修正がユーザーに届かない。

**原因:** `.github/workflows/deploy.yml` の `verify_denki_lp` が **存在しない** `app.js?v1780930000` を期待（denkikouji 実装は `v20260617`）。

**対応:** 検証を `app.js?v20260617` + `cvr-boost-denkikouji.css?v20260621` + `全5ステップ` に更新。`scripts/verify-production-release.sh` も同期。

**再発防止:**
- denkikouji の `?v=` を変えたら **同一PRで** `deploy.yml` / `verify-production-release.sh` / `check-denkikouji-release.mjs` を更新
- push 後は `gh run list --workflow=deploy.yml` で **success** を確認してから「リリース完了」と言う

---

## 2026-06-10 最終ステップ送信ボタン崩れ

**症状:** step06 で「送信」と「あなたに合う求人を見る」が横並び二重表示。

**原因:** `cvr-boost-denkikouji.css` の `input { font-size: 16px !important }` が `.c-submit-button input` の `font-size: 0`（WPテーマ）を上書き。

**対応:** `input:not(.wpcf7-submit)` に変更 + `.c-submit-button input { opacity:0; font-size:0 !important }` を明示。

**再発防止:** グローバル `input` / `font-size !important` 追加時は **submit input を必ず除外**。`e2e-denkikouji-lp.mjs` で送信ボタンを確認。

---

## 2026-06-10 FV CTA が 76px にならない

**症状:** CSS で `min-height: 76px` を指定したが本番・E2E では 48px。

**原因:** 同一 `@media (max-width:767px)` 内の後方ルールで `.p-firstButton { min-height: 48px }` が **後勝ち**。

**対応:** 共通48pxルールから `.p-firstButton` を除外し、`#step-first .p-firstButton { min-height: 76px }` を別宣言。

**再発防止:** サイズ変更後は **ファイル末尾の上書きルール** を grep。`e2e-denkikouji-lp.mjs` の FV 高さチェックを通す。

---

## 2026-06-10 リリース検証スクリプトの陳腐化

**症状:** `e2e-thanks-v2-release.mjs` / `check-thanks-v2-release.mjs` / `deploy.yml` が thanks アセット v=15, css v=48, booking v=32 を期待。

**対応:** 現行バージョンに更新。柔軟マッチ（v=32|33）を deploy 検証に導入。

**再発防止:** thanks-v2 の `?v=` 変更時は `check-thanks-v2-release.mjs` と `deploy.yml` Verify セクションを同時更新。

---

## 2026-06-10 index.html クリティカルCSSの不整合

**症状:** コミット `e5f59f5` でインライン CSS が `min-height:68px` / `css?v20260619` のまま残存（外側は 76px / v20260620）。

**再発防止:** `denkikouji/index.html` 変更時は **インライン `<style>` と link の `?v=` が1箇所でもズレていないか** diff で確認。

---

## チェックコマンド（定番）

```bash
node scripts/check-denkikouji-release.mjs
node scripts/check-thanks-v2-release.mjs
node scripts/e2e-denkikouji-lp.mjs
node scripts/e2e-thanks-v2-release.mjs
bash scripts/verify-production-release.sh   # デプロイ後
gh run list --workflow=deploy.yml --limit 3
```
