# thanks-v2 残論点・進捗（2026-06-16 更新）

> **運用の入口**: LP〜LINEまでの一貫コピー・チェックリストは **`docs/CV-LINE-playbook.md`** を参照。

## 完了済み

| # | 項目 | 備考 |
|---|------|------|
| 1 | 予約→LINEフロー | `thanks-booking-custom.js` |
| 2 | 予約枠の高速化 | bootstrap v11・LSキャッシュ・プリウォーム |
| 3 | 口コミ6件・折りたたみ・詳細CTA | `thanks-testimonials.js` |
| 4 | コピー推敲（心理・紹介事業視点） | `2b363bc` |
| 5 | イラストプロフィールアイコン | `assets/img/testimonials/*.svg` `8ffd129` |
| 6 | LP→`thanks-v2` 遷移 | `app-v2.js` / `app.js` |
| 7 | 軽量化（WP CSS削除・GTM遅延・minify） | `docs/軽量化.md` |
| 8 | denkikouji LP/thanks コピー一貫 | `CV-LINE-playbook.md` 参照 |
| 9 | 旧 `thanks/` → `thanks-v2` リダイレクト | `thanks/index.html` 他 |
| 10 | thanks フロー表示（①②③）+ LINEゲートコピー | `thanks-v2/index.html` |
| 11 | LP マイクロコピー統一・step lazy・perf | `denkikouji/` `9161849` 以降 |
| 12 | `generate-meta-lp.py` denkikouji 同期 | lazy path / denkikouji CSS / FV sub |

## 今回対応（コード・2026-06-02）

| # | 項目 | ファイル |
|---|------|----------|
| A | M.K（半信半疑）を2番目に固定 | HTML + `thanks-testimonials.js` |
| B | 資格に近い口コミを上に並べ替え | `data-license` + `_license` 保存 |
| C | 予約前の心理的ハードル低減コピー | `t-cal__sub` |
| D | 本番デプロイ検証にアバターURL追加 | `deploy.yml` |

## 今回対応（コード・2026-06-11: 予約ファネル改善）

| # | 項目 | ファイル |
|---|------|----------|
| E | カレンダーをデフォルト展開（折りたたみ廃止・トグルは閉じる操作のみ） | `thanks-v2/index.html` + `thanks-mobile-ux.js` |
| F | ドック退避は「展開済みカレンダーが画面内」のときのみ | `thanks-mobile-ux.js` |
| G | tel未引き継ぎでも予約を通す（thanksで電話番号は再入力させない。デッドエンド解消） | `thanks-booking-custom.js` |
| H | 予約ファネル計測（slot_select / confirm_click / booking_error / has_tel） | `thanks-booking-custom.js`（詳細は `CV-LINE-playbook.md`） |

## 今回対応（コード・2026-06-12: LINE先行フロー）

| # | 項目 | ファイル |
|---|------|----------|
| I | LINEロック廃止・②LINE受取口→③予約に順序変更（全文ゲートは電話のまま） | `thanks-v2/index.html` + `thanks-mobile-ux.js` |
| J | LINEクリック計測を document 委譲化 + `line_cta_position` / `booked` 属性 + `dk_line_clicked` フラグ | `thanks-v2-shared.js`（v8） |
| K | ドック状態機械（LINE→クリック後は予約CTA→両完了で退避） | `thanks-mobile-ux.js` |
| L | 予約完了カード・LINEセクションをLINEクリック状況で分岐 | `thanks-booking-custom.js`（v37） |
| M | LINE beacon を委譲イベント追従（hero/dock/完了カードでも発火） | `thanks-line-beacon.js` |

## 運用・要人手（コード外）

| # | 項目 | やること |
|---|------|----------|
| O1 | GAS 枠キャッシュ | `clasp push` + 再デプロイ + `BOOKING_STAFF_JSON`（林・福山・山田の calendar_id） |
| O2 | `sync-booking-slots` workflow | GitHub Actions が green か確認 |
| O3 | 実体験談への差し替え | 許諾取得後、文言・写真を実データに |
| O4 | 計測・A/B | GTMで口コミ展開率・予約完了率。順序・文言の検証 |
| O5 | 旧 `thanks/` | **リダイレクト済み**（`thanks/` `WPLP/thanks/` `自前LP/thanks/`）。WP側301は deploy 要確認 |
| O6 | WP旧URL→静的LP | **自動**: deploy が `deploy/wp-legacy-redirects.htaccess.fragment` を WP ルート `.htaccess` に適用（301）。GTM `wp-redirect-snippet.html` はバックアップ |
| O7 | E2Eテストデータ | `app.js` / `app-v2.js` が 09012345678・テスト太郎・`?dk_test=1` で Zapier/GAS 送信をスキップ |
| O8 | Slack予約スレッド修正の反映 | `gas-recorder/コード.js` 修正後に `clasp push -f` + `clasp redeploy`。`SLACK_MENTION_CA`（@ca の `S...` ID）を設定 → テスト予約でリードスレッドに @ca+日時の返信を目視 |
| O10 | **LINEあいさつメッセージ（2026-06-12・LINE先行の前提）** | LINE公式アカウントのあいさつメッセージに「ティーザー（3件の概要）＋予約ページ導線」を設定。未設定だと「追加したのに何も来ない」で逆効果 |
| O11 | LINE先行の効果検証 | 前後比較: 予約率（`calendar_booked`/`lead_conversion`）とサンクス→LINE率。`line_cta_position` で位置別クリックも確認。予約率が大きく沈むなら巻き戻し |
| O9 | **いますぐ枠の解放（2026-06-11）** | Apps Script の**スクリプトプロパティ `BOOKING_LEAD_HOURS=0`** を設定（コンソールから即時反映・デプロイ不要）。これで枠が「次の15分区切り」から生成され、thanksの「いますぐ電話を希望する」ボタンが直近時刻を確保できる。コード既定も0に変更済み（次回 `clasp push` 以降はプロパティ未設定でも0）。GASキャッシュ180秒+静的JSON5分同期なので反映は最大8分 |

## 将来の改善（優先低〜中）

| # | 項目 | 期待効果 |
|---|------|----------|
| F1 | 予約完了後だけ口コミ表示 | カレンダーLCP優先（要UX判断） |
| F2 | 実写プロフィール（許諾あり） | 信頼↑・コンプラ管理必須 |
| F3 | 口コミ動画30秒 | 滞在↑・制作コスト↑ |
| F4 | Meta向け4問クイズLP | 別ページ `meta-lp-v2` 想定 |

## 本番チェックリスト

詳細は **`docs/RELEASE-thanks-v2-チェックリスト.md`**

- [x] thanks-v2 / booking-slots.json / 主要JS・SVG が 200（2026-06-03 確認）
- [x] GAS slots + booking-slots.json + dataLayer + 予約→LINEゲート（`node scripts/e2e-thanks-v2-release.mjs` 26/26、2026-06-11）
- [ ] GTM コンテナで `lead_conversion` タグ実発火（Tag Assistant・人手）
- [ ] Slack Bot 導入後 E2E（リード→予約スレッド）
- [ ] 口コミ実データ差し替え（許諾後）

## 設計リファレンス

- **`docs/reference-kinoshita-marketing.md`** — 木下勝寿（北の達人）マーケ・LP・サンクス設計の調査蓄積（9段階ニーズ、4段階コピー、マイクロコピー、thanks-v2対応表）
- **`LP作成リファレンス.md`** §2 — 当社LPへの短い転用・チェックリスト
- **`docs/reference-build-job-lp-thanks.md`** — 競合 thanks
