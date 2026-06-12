# denkikouji CV + LINE プレイブック

電気工事士LP（`denkikouji` / `meta-lp/denkikouji`）の **フォーム完了 → thanks-v2 → 予約 → LINE** までを一貫させる運用ドキュメント。

## ゴール

| 段階 | KPI | 成功の定義 |
|------|-----|-----------|
| LP | フォーム完了率 | step01離脱↓・step05入力摩擦↓ |
| Thanks | 予約完了率 | 枠選択→確定（カレンダーは2026-06からデフォルト展開） |
| LINE | `thanks_line_click` | 予約後にLINE CTAクリック |

### 予約ファネルの dataLayer イベント（2026-06）

| イベント | タイミング | 主な属性 |
|----------|-----------|----------|
| `thanks_booking_context` | 予約UI初期化時 | `has_tel`（tel引き継ぎ可否） |
| `thanks_slot_select` | 枠タップ | `booking_day` / `booking_time` / `has_tel` |
| `thanks_booking_asap_click` | 「いますぐ電話を希望」タップ（最短枠ワンタップ確保） | 同上 |
| `thanks_booking_confirm_click` | 確定タップ | 同上 + `asap`（0/1） |
| `thanks_booking_error` | 失敗時 | `error_type`: `slots_load_failed` / `slot_taken` / `network` / `unknown` |
| `calendar_booked` | GAS予約成功 | `booking_tool` |

**telの扱い:** 電話番号はLPフォームで取得済みのため、thanksでは再入力させない。sessionStorage から引き継げなかった場合も tel 空のまま予約を通す（GASは新規行append+Slack通知。リード行とは名前・日時で突合）。`has_tel` で引き継ぎ失敗率を監視する。

## ファネル（コピー一貫）

```
LP step06（送信） ※bridgeコピーは2026-06に廃止（入力時は情報を絞る）
       ↓ app.js（sessionStorage + 600ms）
thanks-v2 ヒーロー
  ①登録完了 → ②10分相談枠 → ③LINE全文
       ↓ 予約完了（thanks-booking-custom.js）
LINEセクション解放 + スティッキー「LINEで全文を受け取る」
```

### 統一コピー（2026-06）

| 箇所 | 文言 |
|------|------|
| FV | 全5ステップ・約30秒｜無料・ハローワーク非掲載の求人あり |
| step06 電話方針 | 営業電話はしません。日程連絡は平日1回のみ・現在の職場に公開されません。（入力欄直下に1行統合） |
| step06 社会的証明 | 利用者の94%が満足と回答 – 34,513人が利用中（数値の根拠は `本番反映手順書.md` 確認事項） |
| step06 機会損失 | 求人は埋まり次第締切。いま送信するほど選べる求人が残っています |
| thanks カレンダー | 面談枠は直近から埋まります。希望の時間はお早めに |
| thanks LINEゲート | LPと同じ流れ。日時後にLINE登録が開く |

**入力ステップ（step04〜06）の原則:** クマ・`cvr-step-reward`（返報）・`cvr-step-opp`・`cvr-cta-proof`・職場非公開の不安除去は**全ステップで表示**する。「ミニマル化」目的でも、迷う直前のメリット/機会損失コピーを `display:none` にしない。

### ステップ数（5ステップ）

| 画面 | 残り | progress label |
|------|------|----------------|
| step01 | あと4 | あと4ステップ |
| step03 | あと3 | あと3ステップ |
| step04 | あと2 | あと2ステップ |
| step05 | あと1 | あと1ステップ |
| step06 | 最後 | 最後のステップ |

## 主要ファイル

| 役割 | パス |
|------|------|
| 通常LP | `denkikouji/index.html` |
| 遅延ステップ | `denkikouji/steps-lazy.html` |
| Meta LP | `meta-lp/denkikouji/index.html` |
| フォームJS | `assets/js/app.js` |
| LP CSS | `assets/css/cvr-boost-denkikouji.css` |
| Thanks | `thanks-v2/index.html` |
| 予約→LINE解放 | `assets/js/thanks-booking-custom.js` |
| LINEゲート | `assets/js/thanks-mobile-ux.js` |

## 本番URL

- LP: `https://denkilp.builders-job.com/denki-lp-cvr/denkikouji/`
- Meta: `https://denkilp.builders-job.com/denki-lp-cvr/meta-lp/denkikouji/`
- Thanks: `https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/?lp=denkikouji`

旧 `thanks/` は `thanks-v2` へ301相当のJSリダイレクト。

## リリース前チェック（事業・マーケ責任者）

```bash
node scripts/check-denkikouji-release.mjs   # LP静的（コピー・資産・禁止表記）
node scripts/check-thanks-v2-release.mjs    # thanks静的
node scripts/e2e-thanks-v2-release.mjs      # thanks本番E2E
node scripts/e2e-denkikouji-lp.mjs          # LP本番スモーク（FV・送信ボタン）
bash scripts/verify-production-release.sh   # 本番HTTP（デプロイ後）
```

| 観点 | 合格基準 |
|------|----------|
| ファネルコピー | LP step06 bridge ↔ thanks ①②③ ↔ LINEゲート が一致 |
| 計測 | `lead_conversion` は qualified のみ / 直アクセスCVなし |
| 予約基盤 | GAS slots OK・booking-slots.json 48h以内 |
| UX | FV CTA・資格・入力欄がタップ可能サイズ / 送信ボタン二重表示なし |
| ダークモード | `color-scheme: only light`・`html/body` 白背景・sticky CTAバー不透明（check-denkikouji-release.mjs に回帰チェックあり / 2026-06-12 事故） |
| 禁止 | 本登録・旧 `/thanks/` CVトリガー依存（94%・34,513は2026-06に復活、根拠は確認事項） |
| デプロイ | Actions `Deploy to Xserver` success・本番 `?v=` 反映 |

**Go条件:** 上記スクリプトすべて pass + GTMコンテナで `lead_conversion` タグ公開（計測の最終関門）

## デプロイ後チェック（5分）

1. LP: step-first → step06 まで遷移・CTA文言・ステップ数
2. 送信後: thanks-v2 ヒーローに3件プレビュー・フロー①②③表示
3. カレンダー: **トグル操作なしで枠が見える（デフォルト展開）** → 枠選択 → LINEセクション解放・ドックにLINEボタン
4. LINEクリック: GTM `thanks_line_click` / beacon送信
5. ハードリロードで `?v=` キャッシュ更新確認

## 本番検証（自動・2026-06-11）

```bash
npx playwright install chromium
node scripts/e2e-thanks-v2-release.mjs
```

| 項目 | 結果 |
|------|------|
| GTM `GTM-KV525PZ` 読込 | OK |
| GAS `action=slots` | OK（staff=4） |
| `booking-slots.json` 本番 | OK（366枠・48h以内更新） |
| `sync-booking-slots` Actions | 直近 success |
| dataLayer `thanks_page_view` | OK |
| dataLayer `lead_conversion`（qualified） | OK |
| 直アクセス thanks → CV なし | OK |
| 予約枠 UI | OK |
| 予約前 LINE ロック | OK |
| 予約後 LINE 解放 | OK |
| dataLayer `thanks_booking_recommended_complete` | OK |
| dataLayer `thanks_line_click` | OK |
| denkikouji ブランド・案件プレビュー | OK |

予約の GAS `action=book` は E2E 内でモック（本番スプシ汚染回避）。実予約は `?dk_test=1` で手動確認。

### GTM コンテナ（人手・未確認）

コード側 dataLayer は上記のとおり。**GTM タグの実発火**は Tag Assistant プレビューで確認:

1. `denkikouji/?dk_test=1` → テスト送信 → thanks-v2
2. `lead_conversion` で Google Ads / Meta / GA4 タグが fire するか
3. 旧 `/thanks/` URL トリガーの awct・CompleteRegistration が **停止** されているか

手順詳細: `docs/GTM-thanks-v2-revival.md`

## Meta LP 再生成

```bash
python3 scripts/generate-meta-lp.py
```

`denkikouji` 更新後に実行。`cvr-boost-denkikouji.css`・lazy steps パス・FV subcopy を反映。

## 残タスク（コード外）

- GTM コンテナで `CE - lead_conversion` タグ公開・旧 `/thanks/` トリガー停止 → `docs/GTM-thanks-v2-revival.md`
- 口コミ実データ差し替え（許諾後）

## 関連ドキュメント

- **過去の失敗・再発防止:** `docs/release-incidents.md`
- 本番手順: `本番反映手順書.md`
- LP設計: `LP作成リファレンス.md`
- Thanks残論点: `docs/thanks-v2-残論点.md`
- パフォーマンス: `docs/軽量化.md`
