# v2アップデート論点整理（2026-07-02・Google CVRデータ反映）

データソース: Google広告統合分析レポート 2026-06-19（Ads API + Clarity 実測）／「LP form recorder」台帳（2026-05-20〜07-02、テスト行10件除外後 n=189）／Google広告メトリクスシート（〜07-02）／リポジトリ実装調査。

## 0. 前提となるデータの要点

- **CV減の主因はCVRではなく露出**。30日CVR 4.71%（直近週7.44%）、IMP -82%はrank_lost 82%が原因で、その根っこは**LP体験QSが全45KWで「下」**＝LP側がボトルネック。
- Clarity実測（Google流入）: **step-first早期離脱 17%** ／ **フォーム深部到達 37% に対し thanks 到達 7%**（＝step06電話が最大の離脱点）／ step04（エリア）が中間の詰まり。
- 台帳の6月CV: google 57% / Meta系 33%。sekoukanri は20件中19件がMeta（≒Meta専売）。
- **thanks-v2 の LINE一本化（6/23）後、LINEクリック率 9.8%→21.6%**（n=37、小標本）。予約は設計どおり0件。
- Google週次: 6月上旬 CPA ¥12,618 → 6/15週 ¥4,145（検索単体CVR 8.29%）→ 6月末〜7月頭に反落。P-MAX(011)はCVR 0.31%でほぼCVせず。広告グループでは「転職・求人・〇種・年収_統合」がCPA ¥5,077で最良、「年収_新LP」は¥9,210と不振。

## 1. 最重要論点：v2は配信ゼロ＝データゼロ

台帳の `_lp` / `_page` に **v2系識別子（denkikouji-v2 / sekoukanri-v2 / *-meta-v2）が1件も出現しない**。広告シートにもv2向け配信の痕跡なし。つまり「v2のCVR」はまだ存在せず、**v2は作ったが実戦投入されていない**。

→ 打ち手は2系統:
1. **v2を計測可能な形で少額配信に載せる**（`window.__LP_ID` と `lead_form_submit(lp_slug)` は実装済みなので、Final URLをv2に向けるだけで台帳・GTMで自動分離される）。Google側は勝ちグループ「統合」(CPA¥5,077)配下でのLPABが低リスク。
2. 併走で、**v1で実証済みの課題への対処をv2に先行実装**し、「v2＝改善仮説の載った版」として配信する（以下2〜4）。

## 2. Googleデータが示すLP課題 × v2実装の現状ギャップ

| # | データ上の課題 | v2の現状 | 対処 |
|---|---|---|---|
| G1 | **step06電話で最大離脱**（深部37%→thanks7%） | `denkikouji-v2/index.html` step06 に**安心文（cvr-tel-reassurance）が無い**。v1/v3〜v6には #43/#44 で「完全無料・現在の職場に知られることもありません」を追加済みだが **v2だけ未反映** | v1と同文言を移植（P0） |
| G2 | **step-first早期離脱 17%**。レポート推奨は「1タップ化」 | v2のFVは2択+「次の質問へ」のまま。v5の「最初のタップ集中」（FV要素グレーアウト・選択肢強調、`cvr-boost-v5` 系 #45）が未移植 | v5方式を `cvr-boost-v2.css` に移植（P0）。効果があればさらに1タップ化をAB |
| G3 | **「電気工事士 年収」KWが最大コスト×QS3**、年収_新LPグループ CPA¥9,210 | v2はヘッダーサブに「平均年収120万円UP」のみ。**年収レンジ（500〜700万）のAbove-the-fold提示なし** | FVに年収レンジ訴求を追加（P1）。ガイドライン上「600万以上」単独NG、レンジで |
| G4 | LP体験QS 45/45「下」（速度・モバイル適合） | v2はGTM遅延・critical CSS・steps eager化など対応済み（v1のstep03 lazy load問題はv2で解消済み） | LCP実測とAdsの「モバイル適合0%」の原因確認（P1・広告側と共同） |
| G5 | ステップ別ファネルが実測できない（Clarity Export APIはステップ別を返さない） | `form_step` dataLayer は実装済みだが **Clarityカスタムイベント（`clarity('set','lp_step',…)`）が未実装**（app.js / app-v2.js とも） | 各ステップ表示時に `lp_step` をセット（P1） |

## 3. 再発予防・リスク論点（v2を配信に載せる前に潰す）

| # | 論点 | 該当箇所 | 対処 |
|---|---|---|---|
| R1 | **svh×フルハイトFVの罠**（in-appブラウザで巨大空白。sekoukanriで6/27再発済み）。v2をMeta配信するなら必ず踏む | `denkikouji-v2/index.html:57`（critical CSS）と `cvr-boost-v2.css:404` に `min-height:calc(100svh - 200px)` ＋ `.cvr-micro-copy{margin-top:auto}` | in-app相当の短尺ビューポートで確認し、必要なら `min-height:auto` フォールバック（P0、Meta配信の前提条件） |
| R2 | **偽のライブ通知**：「東京都の方が3分前に登録しました」はハードコードのローテーション（`app-v2.js` initNotifications）。事実でない社会的証明で、CLAUDE.md原則4・広告ポリシー・景表法リスク | `denkikouji-v2/index.html:131`、`meta-lp-v2/nenshu-shindan-*`（「診断しました」版）、`app-v2.js:1041-1074` | 停止 or 台帳実データからの生成に置換。配信前にオーナー判断（P0） |
| R3 | ダミー数値：FVの「今月の新着287件」は静的値。実績3点（13,829件/34,513人/94%）は要確認項目 | `denkikouji-v2/index.html:150-154, 112-129` | 事実確認・更新運用を決める（P1） |
| R4 | **禁止コピー「営業電話は一切ありません」が meta-lp-v2 に残存**（6/27一掃の漏れ） | `meta-lp-v2/nenshu-shindan-{kentiku,denkisekou,doboku}/index.html` | **本コミットで修正済み**（「完全無料・押し売りは一切ありません」へ） |
| R5 | クマ→CTA移動の配線 | `app-v2.js` は各選択ハンドラで `moveIconById("#"+nextBtn.id)` を呼ぶ配線が現存（415/452/507/539/627行等） | 変更のたびにスマホ実機で要確認（既定ルール） |
| R6 | 台帳に同一電話の重複リードが9番号（最大4回） | gas-recorder / Slack通知 | 重複フラグ付与を検討（P2、CVR過大評価とCA二重対応の防止） |

## 4. thanks-v2 / LINE（一本化の続き）

- LINEクリック 21.6% はまだ伸びしろ。`line_cta_position` 別の分析と、LINEあいさつメッセージ（残論点O10）の設定確認が前提。
- LP側 exit modal（入力が大変な方へ→LINE直リンク）はv2のみ。配信に載せたら `exit_intent_line_click` の発火数を確認。

## 5. アクション一覧（優先度順）

### P0（今週・実装は小さい）→ **2026-07-02 本ブランチで実装済み**
1. ~~v2 step06に電話の安心文を移植~~ → **済**。denkikouji-v2 / sekoukanri-v2 / sekoukanri-*-v2（3種）/ meta-lp-v2の4LPに v1同文言（完全無料・現在の職場に知られることもありません）を追加。`cvr-boost-v2.css` に対応CSSも追加。
2. ~~v5の「FV最初のタップ集中」をv2へ移植~~ → **済**（root v2 5LPのインラインCSSに v5 #45 準拠のルールを追加：FV画像を減光・選択ボタンを強調）。svh は `min(calc(100svh - 200px), 560px)` で上限を設定（インラインcritical CSS＋`cvr-boost-v2.css`）。in-appブラウザの巨大空白を構造的に抑止。
3. ~~偽ライブ通知の停止/実データ化~~ → **オーナー判断「ありのまま」を受け撤去済み**。`cvr-live-notification`（58ファイル）と静的な新着件数バッジ `new-job-count`（42ファイル）を全パイプライン（root・WPLP・自前LP・meta-lp・nenshu-shindan・v2-deploy/wp-html・dk_lp・denkikouji-search）から一掃。app.js / app-v2.js 内の `initNotifications` は要素が無いため no-op（デッドコード。次回JS変更時に削除する — app.jsの`?v`はdeploy検証が `v20260801` 固定値で見ているため今回は非改変）。
4. ~~禁止コピー一掃（R4）~~ → 済。
5. **Clarityステップイベント（P1-6）も実装済み**: `app-v2.js` の `form_step` 送信箇所と送信完了時に `clarity('set','lp_step',…)` を追加（WPLP/自前LPミラー同期済み・`check-lp-bridge-release.mjs` 10/10 pass）。`app.js`（v1）への同実装は次回のv1変更に同乗させる。
6. **年収コピー（P1-7）を先行実装**: denkikouji-v2 FVに「年収500万円以上の求人も多数」を追加（RSA勝ち見出し「年収500万以上・年休120日以上」と整合）。**本番反映前の要確認: 「500万円以上の求人が多数ある」ことの事実確認**。
7. `?v=` は v2系一式を `v20260702a` にバンプ（deploy検証の期待値はv1系のみのため影響なし）。
8. **FV 2択ボタンのCTA化**（root v2 5LP）: 青グラデ＋白文字＋「›」＋シャイン（reduced-motion対応）、モバイルで幅を明示（テーマCSS非依存に）。Clarityのdead click対策。
9. **sekoukanriファミリーのFVバナー差し替え**: v1系4LP＋meta-lp 3LPの電気バナー（「電気業界特化」焼き込み）を `sekoukanri_hero`（「建設業界特化」焼き込み）へ。モバイル用に `sekoukanri_hero-sp.webp`（480w・23KB）を生成し、v1系はimagesrcset、v2系4LPにもsp sourceを追加（LCP改善）。meta-lp sekoukanri系の未使用バナーpreloadを削除。
10. **Meta面のsvh上限を横展開**: meta-lp / meta-lp-v2 の critical CSS にも `min(calc(100svh - 200px),560px)` を適用（in-app空白の再発防止）。
11. **UI検証済み（2026-07-02）**: 全系統FVスクショ（v1 denki/sekou・v5・meta-lp-v2×2）JSエラー0、denkikouji-v2フォームをFV→step06まで実操作（クマ追従・安心文・フッター非表示・2800ms自動遷移を確認）、`check-lp-bridge-release` 10/10・`check-denkikouji-release` 18/18 pass。

### P1（v2を数字の出る状態に）
5. **v2への少額配信開始**: Google「統合」グループ配下でLPAB（Final URL＝`/denkikouji-v2/`）。Meta側は sekoukanri-v2 / meta-lp-v2 でテスト。台帳 `_lp` で自動分離。
6. **Clarityステップイベント実装**（app.js / app-v2.js）＋ GTMの `form_step`→GA4 連携確認。→ ステップ別離脱が初めて実測になる。
7. **年収レンジのFV提示**（G3）。年収系KWのQS3・CPA¥9,210の改善レバー。
8. 実績数値3点の事実確認（R3）。

### P2（中期）
9. thanks-v2 LINE率 21.6%→30% 目標: ティーザー・位置別分析・あいさつメッセージ整備。
10. 重複リードのフラグ運用（R6）。
11. **Meta広告メトリクスのデータ源整備**: 「Meta広告_DB」シートの中身は実はGoogle広告のみ。sekoukanriがMeta専売なのに費用対効果が見えない状態を解消する。

## 6. 計測メモ

- 6/4〜6/8にLP CV計測切れの前科あり。v2配信開始時は `lead_conversion`（qualifiedのみ）の実発火をTag Assistantで確認（RELEASEチェックリスト残項目）。
- 判断の正本: `wiki/マーケティング/Google広告_今後の方針シート.md`（別リポジトリ）。広告側の実行順序は ①LP/見出しでQS底上げ → ②死蔵BROAD停止・不承認解消 → ③勝ちPHRASEにtCPA微増。LP改善（本ドキュメントのP0/P1）は①の中核。
