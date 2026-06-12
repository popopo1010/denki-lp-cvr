# リリースインシデント記録（denkikouji / thanks-v2）

再発防止用。リリース前は `docs/CV-LINE-playbook.md` のチェックリストと併用。

## 2026-06-12 ダークモード端末で入力ステップのCTAバーが暗転（視認性事故・2回目）

**症状:** denkikouji LP の step04（郵便番号）・step06（携帯番号）で、キーボード表示中に「戻る＋CTA」バーが暗い帯に食い込み、ボタンが見えない/読めない。ダークモード端末（Samsung Internet 等の強制ダーク・アプリ内ブラウザ）で発生。視認性劣化はスマホUI調整時（daf7591）に続き2回目。

**原因:**
1. `denkikouji/index.html`（meta-lp も同様）に `color-scheme` 宣言と `html/body` の背景色指定がなく、ダークモード端末でページ地色が暗色化（computed: `background: transparent` / `color-scheme: normal`）
2. 入力ステップの sticky CTAバー `.c-nextLink` の背景が「上28%透明→白」のグラデーションで、**背面が白である前提**。地色が暗転すると透過部分にボタン上部が重なり視認不能に

**対応:**
- LP/meta-LP の critical CSS に `:root{color-scheme:only light}html,body{background-color:#fff}` を追加 + `<meta name="color-scheme" content="only light">`（強制ダーク自動反転のオプトアウト）
- `cvr-boost-denkikouji.css` にも同バックストップを追加し、sticky バーのフェードを padding 内の10pxに短縮（ボタン本体は常に不透明な白の上）
- CSS `?v=` v20260701 → v20260713（HTML×2 / deploy.yml / check / e2e / verify-production-release.sh を同一コミットで同期）

**再発防止:**
- `check-denkikouji-release.mjs` に **ダークモード回帰チェック6項目**（color-scheme meta / 地色白 critical CSS / CSS バックストップ / sticky バー不透明背景）を追加。リリース前に必ず実行
- **半透明・グラデ背景の固定/sticky 要素を追加するときは、背面が白以外（ダークモード強制反転含む）でも成立するか確認する**
- スマホ実機確認は**ライト/ダーク両モード**で行う（特にフォーム入力ステップ＋キーボード表示状態）

---

## 2026-06-11 thanks-v2 の ?v= bump で Deploy 検証だけ失敗

**症状:** thanks-v2 改修（カレンダーデフォルト展開等）の main マージ後、`Deploy to Xserver` run 253 が「Verify deployment」で failure。rsync 自体は成功しており本番ファイルは更新済み（検証未通過のまま）。

**原因:** `deploy.yml` の検証が `thanks-v2-deferred.js?v=13` / `thanks-page.css v=(50|51)` / `booking-custom v=3[23]` をハードコード。HTML 側は v=14 / v=53 / v=35 に bump 済みでズレた。2026-06-10 の denkikouji 版と同型。

**対応:** `deploy.yml` の検証を v=14 / v=53 / v=35 に更新して再デプロイ。

**再発防止:** `check-thanks-v2-release.mjs` に **HTML の ?v= と deploy.yml 検証バージョンの一致チェック**（deploy-verify）を追加。thanks 系の `?v=` を変えたら同一コミットで deploy.yml も更新し、このチェックで自動検出する。

---

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

## 2026-06-11 クマと返報コピーが入力ステップで消失

**症状:** 全LPの初期表示（FV）からクマが消える。入力ステップ（step04〜06）でクマ・`cvr-step-reward`・`cvr-step-opp`・`cvr-cta-proof` が非表示で、メリット/機会損失の訴求がゼロ。

**原因:**
1. `39ca1dc`（スマホUI密度調整）の `showPage` firstArea 分岐が FV の `.p-first__buttonArea` に一致せず、else で `icon.style.display="none"`
2. 同コミットの「入力ステップ: さらにミニマル」CSSがクマと返報系コピーを `display:none`

**対応:** step-first はマークアップ定位置（`cvr-kuma-wrap`）に復帰、全ステップでクマ表示。返報・社会的証明・不安除去コピーを入力ステップでも表示（フォントだけ縮小）。

**再発防止:**
- 「密度を下げる」整理で UI 要素を消すときは、**消す対象が CVR 装置（クマ・返報・証明・不安除去）でないか** playbook の統一コピー表と突き合わせる
- LP 変更後は Playwright で **FV→step06 を通し**、クマと各 `cvr-*` コピーの表示を確認

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
