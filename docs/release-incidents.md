# リリースインシデント記録（denkikouji / thanks-v2）

再発防止用。リリース前は `docs/CV-LINE-playbook.md` のチェックリストと併用。

## 2026-06-23 v2系LPの一連の修正で起きたミス（AIエージェント作業）

電気工事士LPの「検索サイト化」改修中に発生した複数のミスをまとめて記録。再発防止のため必読。

**① `?v=` を上げずにJS/CSSを修正 → 旧キャッシュが配信され「直したのに効かない」（最重要）**
- 症状: `app-v2.js` を名前→西暦の暴発修正・電話プレフィックス検証・自動送信・資格/都道府県の自動遷移と何度も直したのに、実機で「名前入力中に西暦へ飛ぶ」等が解消せずオーナーが繰り返し報告。
- 原因: HTMLが `app-v2.js?v1779310000` / `cvr-boost-v2.css?v...` を固定参照したまま `?v=` を一度も bump しなかった。ファイル内容は正しいが、ブラウザ/CDNが旧版をキャッシュ配信していた。
- 対応: 全HTML(29ファイル/52参照)の `app-v2.js` / `cvr-boost-v2.css` を新版 `?v1781300000` に統一。
- 再発防止: **`assets/js/*` `assets/css/*` を1行でも変えたら、同一コミットで参照HTMLの `?v=` を必ず bump する**。bump漏れを `check-denkikouji-release.mjs` で検出する仕組み（HTMLの参照 `?v=` とファイルのmtime/ハッシュ整合チェック）を検討。

**② app-v2.js が app.js から機能ドリフト（v2だけ挙動が欠落）**
- 症状: v3/非v2(app.js)にある「携帯番号プレフィックス検証・有効入力で自動送信・資格(checkbox)自動遷移・都道府県選択で自動遷移」が v2(app-v2.js) に無く、オーナーが1つずつ発見。
- 原因: v2フォームを app-v2.js に分岐した際、app.js のフォーム挙動を移植しきれていなかった。
- 再発防止: **フォーム挙動を直すときは app.js と app-v2.js の両方を必ず突き合わせる**。`data-auto-advance-ms` 等の前提HTML属性も両系で揃える。

**③ 一括置換が網羅的でなく取りこぼし多発**
- 症状: 「電話」表記の除去で `-v2`の3箇所だけ直し、FVバッジ「営業電話なし」/非v2/meta/`steps-lazy.html`/口コミを見落とし、オーナーが強く再指摘。`cvr-step-reason` 削除でも `style=`属性付き変種と `steps-lazy.html` を取りこぼした。
- 再発防止: 概念単位で消す/直すときは **(a) リポジトリ全体を grep（全工種・v2/非v2・meta・WPLP・自前LP・`steps-lazy.html`・alt属性・口コミまで）**、**(b) 属性付き(`class="x" style=...`)やマークアップ変種を許容する正規表現**、**(c) 遅延読込パーシャル(`steps-lazy.html`)を忘れない**。

**④ 入力中オートフォーカスの暴発**
- 症状: 名前(姓・名)が各1文字入った瞬間に `input` イベントで西暦へ focus を奪い、名前が中途半端に確定。
- 対応: `blur`(名フィールドを離れた)＋両方入力済み＋一度だけ に変更。
- 再発防止: **オートフォーカス/自動遷移は `input`中に発火させない**（`blur` か十分なデバウンス＋`activeElement`確認）。

**⑤ FVコピーは画像に焼き込まれている**
- 症状: FVの「オススメの求人を紹介」を直そうとしたが、HTMLテキストではなくバナー画像(`first_banner*`)＋alt。
- 再発防止: **FVコピー変更は画像再生成が前提**。altだけ変えると画像と不一致になるので画像差し替えとセットで。本番v2/searchのFVバナーはWPテーマ側にあり、リポジトリのデプロイ最適化対象外。

**⑥ デッドCSS判定は遅延読込先も確認**
- `cvr-step-reason`/`cvr-tel-reassurance` のCSSは v2系(cvr-boost-v2.css)では未使用だが、非v2/v3/v4が読む `steps-lazy.html` ではまだ使用中。**「HTMLに無い＝全CSS削除OK」ではない。どのCSSをどのLP/パーシャルが使うかを確認**してから削除する。

## 2026-06-15 入力ステップでフッターが入力欄・CTAに被さる（同症状3回目）

**症状:** 実機iOS（SNSアプリ内ブラウザ）で郵便番号・氏名/生まれ年・携帯番号の各入力ステップにフォーカスすると、WPテーマのフッター（利用規約／プライバシーポリシー／運営会社／サービスについて＋Copyright）が入力欄や sticky CTA（「求人リストを受け取る」「近くの求人を見る」）に重なって表示崩れ。**オーナー実機で再発報告（同種症状3回目）**。

**原因:** 2026-06-12 の `lp-kb-open` 対処（CTAの sticky をキーボード表示中だけ static に戻す）は **focusin/focusout イベント依存** で、SNSアプリ内ブラウザではイベントが安定して発火せず空振りすることがある。さらに本質的に、入力ステップはコンテンツが短く `.l-main{flex:1}` でフッター（`.l-footer`）が画面下に張り付くため、`bottom:0` の sticky CTA と衝突する／短いステップではフッターが入力欄の直下に浮き上がる。JSのタイミングに依存した対処では取り切れなかった。

**対応:** **JS非依存の構造的対処**に切替。`body.lp-input-step .l-footer { display: none !important }` を `cvr-boost-denkikouji.css` / `cvr-boost-sekoukanri.css` の両方（sticky ブロック直後・モバイルメディアクエリ内）に追加し、入力ステップではフッターを出さない。プライバシーポリシー／利用規約の導線は step06 の `.cvr-pp-text`（同意文＋リンク）で担保済みなので法務導線は維持。CSS `?v20260715` に bump し、`deploy.yml` / `check-denkikouji-release.mjs` / `e2e-denkikouji-lp.mjs` / `verify-production-release.sh` の検証バージョンも同時更新。`app.js` は不変（多数LPが参照するため触らない）。

**再発防止:**
- **入力UIと同じ画面に `bottom:0` の sticky/fixed 要素やフッターを置かない**。やむを得ず両立するときは、focus/viewport検知に頼らず `body.lp-input-step` で **被さり得る要素を display:none する**構造的対処を優先する（イベント検知はアプリ内ブラウザで空振りする前提で考える）。
- 入力ステップで「フッター・固定CTAが入力欄に被っていないか」を `docs/CV-LINE-playbook.md` のリリース前チェックに追加（step04〜06を実機 or Playwright `--device` + input focus で確認）。
- 同症状は3回目（39ca1dc 起点）。**スマホUIの密度・sticky・footer 周りを触るコミットは、必ず入力ステップのフォーカス状態スクショで確認してからリリース**。

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

## 2026-06-24 — 施工管理LP変更でDeploy検証が落ちた（検証文字列の同期漏れ）

**症状:** `sekoukanri/` の資格選択ステップ改修（CSS版 `?v20260715`→`?v20260624`、step01 `auto-advance-ms="1300"`→`"2800"`）を main マージ。rsyncは成功したが、Deploy検証ステップが6回リトライ後 `denkikouji or sekoukanri still on stale assets` で exit 1。

**原因:** `deploy.yml` の `verify_sekoukanri_lp()` が**本番が返すべき文字列をハードコード**している（`cvr-boost-sekoukanri.css?v20260715` / `auto-advance-ms="1300"`）。コンテンツ側だけ更新し検証側を更新しなかったため、新バージョンを「未伝播」と誤判定。ファイル自体は本番反映済みだった。

**対応:** `deploy.yml` の該当 grep を新値（`?v20260624` / `"2800"`）に同期して再デプロイ。

**再発防止:**
- `?v=`（CSSキャッシュバスター）や `data-auto-advance-ms` 等、**`deploy.yml` の `verify_*_lp()` が grep している値を変えたら、必ず同コミットで deploy.yml も更新**する。変更前に `grep -n 'v20260\|auto-advance\|?v=' .github/workflows/deploy.yml` で検証対象を確認。
- 「cache not propagated」失敗は伝播待ちではなく**検証文字列のズレ**であることが多い。リトライ増ではなく期待値を疑う。

---

## 2026-06-27 — 施工管理LPのFVが「スカスカ・崩れ・トップが重なって見えない」（svh×フルハイトFVの罠）

**症状:** オーナー実機（Instagramアプリ内ブラウザ）で `sekoukanri/`（全工種）のFVが崩れて見える。CTAボタン直下に巨大な空白ができ、マイクロコピー・次セクションがフォールド外へ押し出され、トップが詰まって/重なって見える。

**原因:** `app.js` の `showPage("#step-first")` が FV に **inline で** `min-height:calc(100svh - 200px)` を、`.cvr-micro-copy` に `margin-top:auto` を付与している（FVを1画面に伸ばし、マイクロコピーを最下部にピン留めする「3秒FV」設計）。アプリ内ブラウザ（Instagram等）では **`svh` が実ビューポートより大きく算出される**ため、FV枠が想定より高くなり、`margin-top:auto` の空白が肥大化。CTA直下が巨大な空白になり「崩れ・スカスカ」に見えた。**過去に「FVを最適化（フルハイト化）」した結果の副作用で、再発しやすいパターン。**

**対応:** `cvr-boost-sekoukanri.css`（sekoukanri専用）で inline を `!important` 上書きし、FVを**内容なりの高さ**に。
- `#step-first { min-height: auto !important }` ＋ `#step-first .cvr-micro-copy { margin-top: 14px !important }` で巨大空白を排除（CTAは引き続きFV内）。
- ヘッダー `.l-header__container { padding-top: max(6px, env(safe-area-inset-top)) }` でノッチ/アプリ内バーの被りを軽減。
- CSS `?v20260624→?v20260627` に bump、`deploy.yml` の `verify_sekoukanri_lp()` の grep 値も同期。`app.js` は多数LP共有のため不変、sekoukanri CSS のみで対処。

**再発防止:**
- **FVを「フルハイト化（`min-height:calc(100svh|dvh|vh - N)`）＋ `margin-top:auto`」で最適化するときは、アプリ内ブラウザ（Instagram/LINE等）で巨大空白にならないか必ず確認**する。in-appブラウザでは `svh/dvh/lvh` が実ビューポートと一致しない前提で考える。空白が出るなら内容なり高さ（`min-height:auto`）に逃がす。
- FVの高さ・余白を司るのは **`app.js` の inline style（共有・触らない）** と **各 `cvr-boost-*.css`**。挙動修正は共有JSを避け、対象LPのCSSで `!important` 上書きする（denkikouji等への波及を防ぐ）。
- CSSを変えたら `?v=` を bump し、**同コミットで `deploy.yml` の `verify_*_lp()` grep 値も更新**（同症状は 2026-06-24 と同型）。
- 確認は通常画面だけでなく**短尺ビューポート（in-app相当）**でもFVをレンダリングし、CTA下に空白が出ないこと・次セクションが覗くことを見る。

---

## 2026-06-27 — 安心訴求の「しつこい営業なし」がCVRを下げる（“営業”priming）

**症状:** 施工管理LP（`/sekoukanri/`）のフォーム最終ステップ（携帯番号）に「送信後：条件に合う新着求人をご案内（しつこい営業なし）」「しつこい営業はしません。現在の職場に公開されません。」と表示。オーナーから「この“しつこい営業なし”はまじで消して。**営業が来るかもと錯覚する**から」と指摘。打ち消し表現でも“営業”という語を出すと、ユーザーに「営業電話が来る前提なのか」と逆効果（negative priming）になりCVRを下げる。

**原因:** 安心コピーに“営業”という語の打ち消し（「しつこい営業なし」「営業電話なし」）を多用していた。過去（denkikouji）で「営業電話」を一掃したが、`しつこい営業` 系が sekoukanri 含む多数LPに残存（cvr-step-reward / tel reassurance / FVチップ `cvr-fv-offers` / meta-fv__sub / micro-copy）。

**対応:** LPフォーム/FVの“営業”打ち消しコピーを**営業を連想させない表現に置換**（copy-only）。
- `…をご案内（しつこい営業なし）` → `…をご案内（無料）`
- `しつこい営業はしません。現在の職場に公開されません。` → `現在の職場に知られることはありません。`
- `しつこい営業はしません。合わなければその場でお断りください。` → `合わなければその場でお断りいただけます。`
- FVチップ `しつこい営業／なし` → `押し売り／なし`（既存FVピル「押し売りなし」と統一）
- meta-fv__sub `…無料・しつこい営業なし` → `…無料`
- 対象: 全工種sekoukanri(steps-lazy.html)・工種別・v2・WPLP・自前LP・meta-lp(-v2)・dk_lp・v2-deploy/wp-html の**40ファイル**。`thanks-v2`系は別の検証パイプライン(`check-thanks-v2-release.mjs` が `しつこい営業は` を必須チェック)があるため今回は対象外。
- `steps-lazy.html?v20260701→?v20260627` に bump、`deploy.yml` の `verify_sekoukanri_lp()` の grep も同期。

**再発防止:**
- **LPの安心訴求に「営業」という語を使わない**（打ち消しでも逆効果）。安心は「押し売りなし／完全無料／転職しなくてOK／現在の職場に知られません」で表現。CLAUDE.md「作業時のルール」に明記。
- 概念単位の一掃は **リポジトリ全体を grep**（全工種・v2/非v2・meta・WPLP・自前LP・`steps-lazy.html`・`v2-deploy/wp-html`・`dk_lp`）。「営業電話」一掃時(2026-06)に `しつこい営業` を取りこぼした＝**同義の別表現も同時に洗う**（incident ③と同根）。
- partial（`steps-lazy.html`）を変えたら `?v=` を bump し `deploy.yml` 検証も同コミットで更新。

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

## 2026-07-01 step01自動遷移タイマーの残存でステップ重複表示（app.js / app-v2.js 共通）

- 症状: denkikouji-v2 で「step03(実務経験)とstep04(都道府県)が画面に同時表示」される。再現手順＝step03で経験選択→step04→**戻る**→step03→**次へ**。以後 step03 が step04 に重なって残る。
- 原因: step01(資格 checkbox) の `data-auto-advance-ms`(2800ms) の自動遷移タイマー（`scheduleAutoAdvance` の `setTimeout`）が、**ユーザーが手動で先に進んでもクリアされず**、2800ms後に `nextBtn.click()`（step01→step03）を発火。現在表示中のステップ（step04等）に step03 を重ねて表示していた。`showPage` は対象ページの表示のみ行い他ページを隠さない設計のため、残存タイマー由来の誤 `showPage("#step03")` で重複が残る。
- 影響範囲: **step01に自動遷移(2800ms)を持つ全LP**。共有 `assets/js/app.js`（denkikouji本番/v3/v4/v5/v6・sekoukanri系）と `assets/js/app-v2.js`（全v2系34LP）の双方に同一バグ。ミラー(WPLP/自前LP)も同じ。
- 対応: 自動遷移タイマーの発火条件に「step01がまだ表示中」を追加。
  `if (hasAny() && !nextBtn.classList.contains(DISABLE) && getComputedStyle(group).display !== "none") nextBtn.click();`
  app.js / app-v2.js 両方＋ミラー(WPLP/自前LP)を同一化。レンダリングで再現手順→重複解消を確認。
- 再発防止: **自動遷移/自動送信のタイマーは発火時に「そのステップがまだ可視か」を必ず確認する**（`getComputedStyle(group).display !== "none"` か `group.offsetParent !== null`）。手動遷移でタイマーをクリアし損ねても誤爆しないよう防御的に書く。app.js と app-v2.js は同種ロジックを持つため両方直す（②のドリフト教訓と同じ）。

## 2026-07-03 step06表示時にページ上部が見えない（scrollTo(0,0)がスクロールアンカリングに巻き戻される）

- 症状: 最終ステップ(step06 電話番号)に進むと、ヘッダー/STEP表示/タイトルが画面外に消え、入力欄だけが見える（オーナー実機報告）。LPにより発生・非発生が分かれた（denkikouji=OK、sekoukanri系/v3=NG）。
- 原因は3層:
  1. `showPage` の autofocus 後 `scrollIntoView({block:"center"})` が、入力欄を中央寄せしてトップを画面外へ押し出す → `block:"nearest"`（見えていればスクロールしない）に変更。
  2. `html{scroll-behavior:smooth}`（全cvr-boost CSS）下では `window.scrollTo(0,0)` がアニメーション化され、他のsmoothスクロールに割り込まれて途中で止まる → 切替時は `documentElement.style.scrollBehavior="auto"` で一時無効化して瞬時スクロール。
  3. **本丸**: `scrollTo(0,0)` を「旧ページ display:none → 新ページ display:block」の同期処理中（レイアウトdirty）に呼ぶと、直後のレイアウト確定時に**スクロールアンカリングが旧スクロール位置を復元**し、scrollTo が無かったことになる。→ 表示切替の**後**に `void page.offsetHeight` で reflow を強制してから `scrollTo(0,0)`。
- 対応: app.js / app-v2.js 両方＋ミラー(WPLP/自前LP)同期。Playwright(375px)で denkikouji / sekoukanri / sekoukanri-denkisekou / meta-lp/denkikouji / v3 / v2 の6系統で step06 到達時 scrollY=0・上部可視・tel focus を確認。
- 再発防止: **ページ切替のスクロールリセットは「表示切替後＋reflow強制＋瞬時(scroll-behavior無効化)」の3点セット**で行う。デバッグ時、フック内で `scrollY` を読むだけでレイアウトが flush され再現が消える（ハイゼンバグ）ことに注意。

## 2026-07-03 meta-lp/denkikouji の遅延ステップが404でフォーム停止（6/21から本番露出）

- 症状: meta-lp/denkikouji で step01(資格)から先に進めない。step03以降が `data-lazy-src` の遅延読み込みで、その fetch が404のためマウントされない。
- 原因: 2026-06-21 PR#21 で導入された `data-lazy-src="../denkikouji/steps-lazy.html"` が、`/meta-lp/denkikouji/` 基準で **自分自身のディレクトリ**（`/meta-lp/denkikouji/steps-lazy.html`＝存在しない）に解決される相対パス誤り。導入時から一度も動いていない。正: `../../denkikouji/steps-lazy.html`。
- 発見: 2026-07-03 の step06 全LP挙動確認（Playwright全ステップ走行）で step03 クリックが要素なしで失敗し発覚。**全ステップを実走するE2Eでしか捕まらない**タイプの欠陥。
- 対応: パス修正＋`scripts/check-lazy-steps.mjs` 新設（全HTMLの `data-lazy-src` をHTML基準で解決し実在確認）。deploy.yml / release-pre-check.sh に組み込み、404なら**デプロイ前にブロック**。
- 再発防止: 相対パスの partial 参照を追加/変更したら、**そのページのディレクトリ基準で解決先を確認**する（`../` の数え間違いに注意）。遅延読み込みはコンソールにエラーが出ず静かに壊れるため、ガードスクリプトで機械検証する。

## 2026-07-03 全LP網羅スイープで発見した参照切れ・鏡像ドリフト（エラーゼロ総点検）

- 全HTML静的参照スキャン（src/href/data-lazy-src/srcset/imagesrcset・1287参照）＋全99ページのブラウザ実ロード＋標準フロー41LPの全ステップ実走を実施。発見と対応:
  1. **dk_lp/sekokanri のFV画像srcsetが1階層不足**（`../assets/`→正 `../../assets/`）でスマホ用webpが404。pictureフォールバックで見た目は保たれるがLCP劣化。→修正＋`scripts/check-local-refs.mjs` 新設（srcset系まで含む相対参照の実在検証、deploy/release-pre-checkでブロック）。
  2. **v2-deploy/wp-html の sekoukanri hero webp が相対参照**（WP貼り付け先では解決不能）→ 既存の絶対URL（github.io）に統一。
  3. **dk_lp が旧JSのまま取り残し**: `dk_lp/assets/js/app.js`（?v20260630固定）が本体app.jsから145行ドリフト（step06スクロール修正・都道府県optgroup・タイマーガード等が未反映）→本体から同期＋?v bump。`dk_lp/denkikouji/assets/js/main.js`（完全独自実装）にも step06 3点セット修正（reflow強制+瞬時scrollTo / focus preventScroll / nearest）を移植。
  4. **WPLP/自前LP の貼り付け用HTMLの ?v が旧値のまま**（app.js?v20260630 / app-v2.js?v1781300000）→ 最新（v20260703d / v20260703b）に統一。1年immutableキャッシュ下では旧?vのままWPに貼ると再訪者に旧JSが配られ続ける。
- 教訓: **共有JSの「ミラー」はWPLP/自前LPだけではない**。dk_lp のような別ディレクトリの複製・独自実装も横展開の対象に含める（バグ修正はリポジトリ全体を `scrollTo\|scrollIntoView` 等で grep して全実装に当てる）。ローカル検証では **WPテーマCSS由来の挙動（.js-form-group非表示等）が再現しない**ため、ローカルNGでも「テーマCSS前提の構造か」を確認してから本番バグと断定する。

## 2026-07-05 step04/05でも上部（STEP表示・タイトル）が隠れる（オーナー実機・頻出報告）

- 症状: 実機（アプリ内ブラウザ）で step04（都道府県）・step05（お名前）でも、STEP表示〜タイトルが画面上部に隠れる。step06修正（2026-07-03）後も残存。
- 原因: 選択のたびにクマ移動と同時に走る `moveIcon` の `scrollIntoView({block:"center"})`（CTAを画面中央へ寄せる）と、step05の生まれ年への `block:"center"` スクロールが、**上部を画面外へ押し出していた**。step06のautofocusで直したのと同じ「center寄せ」クラスの残り。
- 対応: `moveIcon`（app.js/app-v2.js 111・129行）と `bdayYear`（783・645行）の scrollIntoView を **`block:"nearest"`** に変更（CTAが見えていればスクロールなし、見えない時だけ最小限）。全ミラー（WPLP/自前LP/dk_lp）同期、`app.js?v20260705a` / `app-v2.js?v20260705a` に bump。クマのCTA移動（DOM移動）と41LP全ステップ実走は維持を確認。
- 補足: アプリ内ブラウザは半透明バーが上部に被さるため、scrollY=0 でも最上部の要素はぼけて見える。これはブラウザ仕様で、コードでは消せない——「隠れてはいけない情報を最上部1行に置かない」設計側の注意で吸収する。
- 再発防止: CLAUDE.md に**【頻出バグ】上部が隠れる＝スクロール4クラス（center寄せ／smooth割り込み／アンカリング復元／focusのpreventScroll漏れ）を全実装でgrep確認**のルールを追加。今後 `block:"center"` は原則禁止。
