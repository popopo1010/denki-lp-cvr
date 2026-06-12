# リリースインシデント記録（denkikouji / thanks-v2）

再発防止用。リリース前は `docs/CV-LINE-playbook.md` のチェックリストと併用。

## 2026-06-12 iOSキーボード表示中に固定CTAが入力欄・フッターに被さる

**症状:** 実機iOS（Safari / 検索アプリ内ブラウザ）でLPの入力ステップ（郵便番号・氏名・携帯番号）にフォーカスしてキーボードが開くと、ボトムの「戻る＋次へ/送信」CTAバーが画面中央に浮き上がり、生まれ年入力やフッターリンク（プライバシーポリシー等）に重なって表示崩れ。**オーナー実機で再発報告（2回目）**。

**原因:** `39ca1dc`（スマホUI密度調整）で入力ステップのCTAを `body.lp-input-step .c-nextLink { position: sticky; bottom: 0 }` 化。iOSはキーボード表示でvisual viewportが縮むため、stickyバーがキーボード上端に張り付き、ページ内容（入力欄・フッター）の上に被さる。`cvr-boost-denkikouji.css` / `cvr-boost-sekoukanri.css` の両方に同じ実装。デスクトップ・Androidでは再現しにくく、リリース前チェックをすり抜けた。

**対応:** `app.js` に focusin/focusout で `body.lp-kb-open` を付け外しするキーボード検知を追加し、CSS側で `body.lp-input-step.lp-kb-open .c-nextLink { position: static }` としてキーボード表示中だけstickyを解除（CTAは入力欄の下の通常フローに戻る）。`app.js?v20260713`・両CSS `?v20260702` に bump、deploy.yml / verify-production-release.sh / check-denkikouji-release.mjs / e2e-denkikouji-lp.mjs の検証も同時更新。

**再発防止:**
- **`bottom: 0` の sticky / fixed 要素を入力UIと同じ画面に置くときは、キーボード表示中の挙動（`lp-kb-open` での解除）を必ずセットで実装する**。thanks-v2のドック（`thanks-dock`）はLINE/予約ボタンのみで入力欄がないため対象外だが、入力UIを足す場合は同じ対処が必要
- スマホUI調整のコミット（密度・sticky化）は、**実機 or Playwright の `--device` + input focus 状態**でスクリーンショットを確認してからリリースする（39ca1dc はクマ消失に続き2件目のインシデント源）
- 検知ロジックは `app.js` 末尾の `lp-kb-open`、解除CSSは各 `cvr-boost-*.css` の sticky ブロック直後にある

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
