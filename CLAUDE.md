# CLAUDE.md

このリポジトリで Claude Code / AI エージェントに作業させるときの基本方針。

## 4原則

### 1. 目的を先に確認する

- このリポジトリの主目的は、LPのCVR改善と本番反映の安全性を両立すること。
- 作業前に「何を改善するのか」「どのページに反映するのか」「本番影響があるか」を確認する。
- 目的が曖昧なまま、HTML/CSS/JSの編集を始めない。

### 2. 設計してから実装する

- 実装前に、変更方針・影響範囲・確認方法を短く提示する。
- 本番反映に関わる変更では、ロールバック方法も考慮する。
- 大きな変更は、まず小さく分けて安全に反映できる単位にする。

### 3. シンプルに保つ

- 不要なライブラリ追加、過剰なアニメーション、複雑な状態管理は避ける。
- 既存のファイル構成と実装パターンを優先する。
- CVR改善は、ユーザー理解・信頼性・フォーム完了率に直結する変更を優先する。
- 見た目の派手さより、読み込み速度・入力しやすさ・信頼感を優先する。

### 4. 事実確認が必要な情報を勝手に確定しない

- 求人数、利用者数、満足度、口コミ、許可番号、会社所在地、代表者、プライバシーポリシー情報は要確認項目として扱う。
- ダミー情報を本番用として扱わない。
- 数値や法務系の文言を変更した場合は、本番反映前の確認事項に追加する。

## 作業時のルール

- 変更前に対象ファイルを読み、既存の構造に合わせる。
- 既存の未コミット変更を勝手に戻さない。
- 本番反映手順に影響する変更は、必要に応じて `本番反映手順書.md` も更新する。
- GTM注入で反映するのか、テーマファイルに反映するのかを明確にしてから作業する。
- 実装後は、表示崩れ・フォーム動作・外部リンク・プライバシーポリシー導線を確認する。
- **ブランチへの push ≠ 本番反映**：本番デプロイ（GitHub Actions `Deploy to Xserver`）は **`main` への push でのみ起動**する（`workflow_dispatch` 手動を除く）。作業ブランチ（例 `claude/*`）に push しただけ・PRを作っただけでは、本番（`denkilp.builders-job.com`）は更新されない。
  - 完了報告では必ず**現在地を明示**する：「①ブランチに push 済み → ②PR作成済み → ③main マージ済み → ④本番デプロイ済み（`?v=` 反映）」のどの段階か。未デプロイなら「本番はまだ旧版のまま」と一言添える。
  - main へのマージ＝本番デプロイ起動は本番影響のある操作。**明示の許可なく `main` へ push/マージしない**。
- **【必ず確認】選択 → クマ（アイコン）が次のCTAへ移動する挙動**：LPフォームは、ステップで選択（資格・希望・都道府県等）すると `js-icon-target` のクマ（`.cvr-kuma` / `.c-fixed-icon` 等のフォロワーアイコン）が `moveIconById("#"+nextBtn.id, true)` で**次のCTAボタンへ移動**する。この挙動は**変更のたびに消えやすい**（再発多数。例: コミット `79491bf`「クマがCTAに移動しないバグ修正」）。app.js / app-v2.js / steps / CSS いずれを触っても、**スマホで「選択したらクマがCTAへ移動するか」を必ず確認する**。実機確認できない場合も、各選択ハンドラ（radio/checkbox/select）が選択完了時に `moveIconById("#"+nextBtn.id …)` を呼ぶ配線が残っているかをコードで点検する。 **初期位置も対象**：FVのクマは最初のCTA（2択ボタン）を**隠さずに**指す：白カードFV（denkikouji本番系）=右上密着（`top:0; right:-4px`）、**CTA化した色付きボタンのLP（v2系・sekoukanri本番系）**=矢印を隠さないよう**ボタン群直下**（`bottom:-38px; right:0`）。負のtopでタイトル側に浮かせない。`.cvr-kuma` は `pointer-events:none`。step06では安心文（`.cvr-tel-reassurance`）に `padding-right:52px` を確保してクマと重ねない。2026-07-02にv2が `top:-36px` で逸脱し本番露出（オーナー指摘）→ `scripts/check-kuma-anchor.mjs` が deploy / release-pre-check で自動ブロックする。
- **【頻出バグ 2026-07-05】ステップ上部（STEP表示・タイトル）が画面外に隠れる**：オーナーから**繰り返し**報告のある症状（step04/05/06すべてで発生実績）。原因は毎回「ページ内スクロールを起こすコード」であり、既知の犯人は4クラス：①autofocus/クマ移動に伴う `scrollIntoView({block:"center"})`（中央寄せは上を押し出す。**必ず `block:"nearest"`**）②`html{scroll-behavior:smooth}` 下の `scrollTo(0,0)` はアニメーション化され他スクロールに割り込まれて途中で止まる（切替時は `scrollBehavior="auto"` で瞬時に）③レイアウトdirty中の `scrollTo` はスクロールアンカリングが旧位置を復元して無効化（**表示切替後に `void page.offsetHeight` で reflow 強制→scrollTo**）④`focus()` を preventScroll なしで呼ぶとブラウザが入力欄まで勝手にスクロール。**スクロール/フォーカス/ステップ遷移に触るコードを書いたら、この4点を全部確認**し、`grep -rn 'scrollIntoView\|scrollTo\|focus(' `で**全実装**（app.js / app-v2.js / dk_lp/denkikouji/assets/js/main.js / dk_lp/assets/js/app.js とミラー）に同じ修正を当てる。さらに**アプリ内ブラウザ（Instagram/LINE）は半透明バーが上部〜100pxに被さる**ため、scrollY=0でも最上部要素は隠れて見える——重要情報（STEP表示・タイトル）はローカルPlaywrightでは再現できず、**実機のアプリ内ブラウザでの確認が必須**。対策として app.js / app-v2.js / dk_lp main.js がUA検知で `html.dk-inapp` を付与し、全 cvr-boost*.css の `html.dk-inapp body.lp-form-step .js-page-body{padding-top:44px}` で余白を確保する（2026-07-05実装）。この配線もJS/CSS変更で消えやすいので触ったら確認。経緯: `docs/release-incidents.md` 2026-07-03/2026-07-05。
- **【教訓 2026-07-03】FVの見た目はWPテーマCSSに侵食される**：FVの2択ボタン(`.p-firstButton`)・質問タイトル(`.c-title01`)には、テーマ側が「赤い▶矢印(擬似要素/`.arrow`)」「タイトルの緑帯背景」「テキスト左寄せ・両端揃え」を持ち込む。CTA化/中央寄せしても**テーマ装飾が二重表示・位置ズレとして本番に出る**（ローカルはテーマCSS未読込のため気づけない）。対策は各 `cvr-boost*.css` の `@media(max-width:767px) #step-first` スコープで、①タイトルの `background:none!important;text-align:center` ②ボタンの `p-firstButton__text{text-align:center}`・`__container{justify-content:center}` ③テーマ矢印(`.arrow`／擬似要素)を `display:none!important`、で無効化する。**FV/ボタン/タイトルのCSSを触ったら本番反映後に必ずスマホ実機で「矢印二重・帯・寄り」を確認**。3系統(sekoukanri/denkikouji/v2)同時に直すこと。
- **【コピー禁止】安心訴求に「営業」という語を使わない**：「しつこい営業なし」「営業電話なし」等の“営業”を含む打ち消し表現は、**「営業（電話）が来るのでは」と逆に錯覚させCVRを下げる**ためLPで使わない（オーナー指摘・再発あり）。安心は「押し売りなし／完全無料／転職しなくてOK／現在の職場に知られません」など**営業を連想させない言い回し**で表現する。過去に「営業電話」をdenkikoujiから一掃 → 2026-06-27 に「しつこい営業」をsekoukanri含む全LPフォーム/FVから一掃（`thanks-v2`系は別パイプラインのため未対応）。コピー変更時は **リポジトリ全体を `しつこい営業`/`営業` で grep**（全工種・v2/非v2・meta・WPLP・自前LP・`steps-lazy.html`・`v2-deploy/wp-html`・`dk_lp`）して取りこぼさない。経緯: `docs/release-incidents.md` 2026-06-27。2026-07-02 に thanks-v2系・年収診断系も一掃済みで**残存ゼロ**。以後は `scripts/check-banned-copy.mjs` が deploy / release-pre-check で自動ブロックする。
- **【コピー禁止】返報文のラベル接頭辞「◯◯：」を使わない**：「このあと：」「回答後：」は #48 で全LPから削除したが、**固定文言の置換で対応したため別文言の「次の画面：」がv2系で生き残った**（2026-07-02 オーナー指摘）。ルールは“この文言を消す”ではなく“`cvr-step-reward` 等のマイクロコピーにラベル接頭辞を入れない”。新しいラベル文言を発明しても不可。`scripts/check-banned-copy.mjs` が既知パターンをブロックするが、**新規パターンを作ったら同スクリプトの BANNED に追加**すること。

## denkikouji の CV + LINE

- フォーム完了後は `thanks-v2` へ。**2026-06-23〜 LINE一本化**：日程調整カレンダー（③予約）は撤去し、thanks の主アクションは LINE登録のみ（①登録完了→②LINEで受け取る）。日程調整は登録後のLINE上で実施。LINEロックは廃止、全文・社名のゲートは「電話」のまま（LINEで日程調整→お電話→LINEへ全文）。予約バックエンド（GAS・`booking-slots.json`・`thanks-booking-*.js`）はLINE経由向けに残置（ページ未読込）。
- コピー・ステップ数・計測の一貫性は `docs/CV-LINE-playbook.md` を正とする。
- リリース失敗の教訓（Deploy検証・CSS副作用）は `docs/release-incidents.md` を必ず参照する。
- 入力ステップ（step04〜06）では、フッター（`.l-footer`）や `bottom:0` の sticky/fixed 要素を入力欄と同じ画面に出さない。被さると表示崩れの再発になる（同症状3回。経緯: `docs/release-incidents.md` 2026-06-15）。両CSSに `body.lp-input-step .l-footer{display:none}` で対処済み。プライバシー/利用規約の導線は step06 の `.cvr-pp-text` で担保。focus/viewport の JS検知はアプリ内ブラウザで空振りする前提で、被さり得る要素は構造的に隠す。

## sekoukanri（施工管理）資格選択ステップ（step01）

- step01「どの資格をお持ちですか？」は**複数選択**（`js-checkbox-button` / 「続けてタップ」）。`#step01[data-auto-advance-ms]` で最後のタップから一定時間後に自動で次へ進む（タップごとにタイマー再セット＝デバウンス）。
- **教訓（2026-06-24）**：自動遷移が速すぎると「複数お持ちの方は続けてタップ」と矛盾し、1つ選んだ瞬間に画面が飛ぶ＝「早く移動しすぎる」。施工管理ファミリー全体（`sekoukanri*` / `meta-lp*/sekoukanri*`、旧 1300〜900ms）を **2800ms** に統一。値はHTMLの `data-auto-advance-ms` 属性。`scripts/generate-sekoukanri-variants.py` はこの属性を上書きしないため、テンプレート `sekoukanri/index.html` の値が再生成で variant にも引き継がれる。
- **視認性（2026-07-02 現仕様）**：step01のモバイルは**2カラム×必ず1行**で1画面に収める。級・種別は `q-grade` チップ（1級/2級/第一種/第二種）、表示名は**「技士」省略**（例:「1級 建築施工管理」。denkikouji系の「1級電気施工管理」と同じ流儀。**data-valueは技士付きのまま不変**）。実装は `cvr-boost-sekoukanri.css` のstep01メディアブロック（grid 1fr 1fr・flex+nowrapの`!important`強制・font 16px・min-height 48px）。CSS変更時は `?v=` を全参照＋deploy.yml期待値までバンプ。
- **【教訓 2026-07-02】step01レイアウトの罠**：WPテーマは `.c-button__text` に `text-align:justify`、ボタン群に**flexレイアウト**を持つ。①ラベルにinline-block断片を作るとjustifyで文字がバラける（「建 施工管理技/築 士」化）、②コンテナへの `grid-template-columns` 指定はテーマがflexだと無効。対策は「flexコンテナごと `display:grid!important` で奪う＋テキストは flex+nowrap でjustify無効化」。**テーマCSSはサンドボックス/ローカルから取得できない**ため、ローカルスクショが正常でも本番で崩れうる——step01系のレイアウト変更は本番反映後にスマホ実機で必ず確認する。
- **【FVの罠】svh×フルハイトFVでスカスカ/崩れ**：`app.js` が FV(`#step-first`)に inline で `min-height:calc(100svh - 200px)` ＋ `.cvr-micro-copy{margin-top:auto}` を付与する。**アプリ内ブラウザ(Instagram/LINE)では `svh/dvh/lvh` が実ビューポートより大きく算出され、CTA直下に巨大な空白が出て「崩れ・スカスカ・トップが重なって見えない」状態になる**（2026-06-27 再発）。FVを「フルハイト化＋margin-top:auto」で最適化するときは in-app相当の短尺ビューポートで空白を確認。出るなら `cvr-boost-sekoukanri.css` 側で `#step-first{min-height:auto!important}` ＋ `.cvr-micro-copy{margin-top:○○!important}` と内容なり高さに逃がす。共有の `app.js` は触らず対象LPのCSSで上書きする。経緯: `docs/release-incidents.md` 2026-06-27。

## LP作成・改善のリファレンス

- 新規LP設計・CVR改善の考え方（木下勝寿／北の達人の転用ナレッジ含む）→ **`LP作成リファレンス.md`**

## LP改善で優先する観点

- ファーストビューで「何のサービスか」「誰向けか」「無料か」が伝わること。
- フォーム入力前に、信頼性と利用メリットが伝わること。
- 入力ステップごとに、ユーザーの不安を減らす説明があること。
- 送信前に、個人情報の扱いと同意内容が明確であること。
- 追加した施策が、読み込み速度や操作性を悪化させないこと。
