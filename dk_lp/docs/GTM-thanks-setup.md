# GTM サンクス計測セットアップ（GTM-KV525PZ）

LP / サンクスとも `dataLayer.push` する前提。GTM コンテナに以下を追加する。

**本番サンクス URL（v2）**: `https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/`  
旧 WP `/thanks/` は使わない。

## 1. データレイヤ変数（User-Defined Variables）

| 変数名 | タイプ | データレイヤ変数名 |
|--------|--------|-------------------|
| DLV - lp_slug | データレイヤ変数 | `lp_slug` |
| DLV - thanks_qualified | データレイヤ変数 | `thanks_qualified` |
| DLV - conversion_source | データレイヤ変数 | `conversion_source` |
| DLV - booking_tool | データレイヤ変数 | `booking_tool` |
| DLV - page_type | データレイヤ変数 | `page_type` |

## 2. カスタムイベント トリガー

| トリガー名 | イベント名 |
|------------|------------|
| CE - lead_form_submit | `lead_form_submit` |
| CE - thanks_page_view | `thanks_page_view` |
| CE - lead_conversion | `lead_conversion` |
| CE - thanks_line_click | `thanks_line_click` |
| CE - calendar_booked | `calendar_booked` |
| CE - thanks_line_step_revealed | `thanks_line_step_revealed` |
| CE - form_complete（レガシー） | `form_complete` |

### 推奨：CV用（ノイズ除去）

**CE - lead_conversion（qualified）**

- イベント: `lead_conversion`
- 条件（すべて）: `thanks_qualified` equals `true`  
  ※ JS は qualified 時のみ発火するが、念のため

**CE - thanks_page_view（qualified）**（代替CV）

- イベント: `thanks_page_view`
- 条件: `thanks_qualified` equals `true`

直アクセス `thanks-v2` は `thanks_qualified = false` のため、**Google Ads / Meta のコンバージョンには `lead_conversion` を使う**。

### 予約 → LINE フロー用（マイクロCV）

| トリガー | 用途 |
|----------|------|
| CE - calendar_booked | 面談枠の予約完了 |
| CE - thanks_line_step_revealed | 予約後に LINE ブロック表示（第2ステップ到達） |
| CE - thanks_line_click | LINE友だち追加クリック（最終アクション） |

## 3. タグ例

### Google Ads コンバージョン

- トリガー: `CE - lead_conversion`
- 必要なら URL に `lp={{DLV - lp_slug}}` を送る

### Meta Pixel（標準イベント Lead）

- イベント名: Lead
- トリガー: `CE - lead_conversion`
- パラメータ例: `content_name: {{DLV - lp_slug}}`

### GA4 イベント

| GA4 イベント名 | トリガー | パラメータ |
|----------------|----------|------------|
| `generate_lead` | `CE - lead_conversion` | `lp_slug`, `conversion_source` |
| `form_submit` | `CE - lead_form_submit` | `lp_slug` |
| `thanks_view` | `CE - thanks_page_view` | `lp_slug`, `thanks_qualified` |
| `line_friend_click` | `CE - thanks_line_click` | `lp_slug` |
| `calendar_booked` | `CE - calendar_booked` | `booking_tool`, `page_type` |
| `thanks_line_revealed` | `CE - thanks_line_step_revealed` | `booking_day`, `booking_time` |

## 4. dataLayer イベント一覧

### LP送信（`app-v2.js` / `dk_lp main.js`）

```js
{
  event: "lead_form_submit",
  lp_slug: "denkikouji-v2" | "sekoukanri-kentiku-meta" | ...,
  page_location: "...",
  page_path: "..."
}
```

sessionStorage `dk_lp_lead_v1` に `{ ts, lp, href }` を保存（30分有効）。

### `thanks_page_view`（thanks-v2 表示時・毎回）

`assets/js/thanks-gtm.js` が送信。

```js
{
  event: "thanks_page_view",
  lp_slug: "...",
  thanks_qualified: true | false,
  page_location: "...",
  page_path: "/denki-lp-cvr/thanks-v2/",
  page_type: "thanks-v2"
}
```

### `lead_conversion`（フォーム送信後30分以内のサンクスのみ・1回）

```js
{
  event: "lead_conversion",
  lp_slug: "...",
  conversion_source: "lp_form"
}
```

### `thanks_line_click`（LINE友だち追加）

```js
{
  event: "thanks_line_click",
  lp_slug: "...",
  thanks_qualified: true | false
}
```

### `calendar_booked`（独自予約UI・予約成功時）

`thanks-booking-custom.js` が送信。

```js
{
  event: "calendar_booked",
  page_type: "thanks",
  booking_tool: "custom"
}
```

### `thanks_line_step_revealed`（予約完了後 LINE 表示時）

```js
{
  event: "thanks_line_step_revealed",
  page_type: "thanks",
  booking_tool: "custom",
  booking_day: "6月3日(火)",
  booking_time: "10:00"
}
```

### `form_complete`（レガシー・thanks-gtm.js も送信）

既存タグがある場合は `page_type: thanks-v2` で残す。新規は `lead_conversion` を推奨。

## 5. デプロイ手順

1. `施工管理LP` を `denki-lp-cvr` リポジトリへ push（`thanks-v2/`, `assets/js/`）
2. **GTM 復活**: `v2-deploy/gtm/thanks-v2-revival.md` に従い `lead_conversion` トリガーへ切替
3. thanks-v2 は GTM **即時読込**（CV 取りこぼし防止。LP 側 lazy はそのまま）
4. GTM プレビュー: LP送信 → `lead_form_submit` → サンクスで `thanks_page_view` + `lead_conversion`
4. カレンダー予約 → `calendar_booked` → LINE表示で `thanks_line_step_revealed` → LINEクリックで `thanks_line_click`
5. 直開き `thanks-v2` → `thanks_qualified: false` で CV タグが**出ない**こと

## 6. サンクス URL 例

```
https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/?lp=denkikouji-v2&utm_source=google&utm_campaign=xxx
```

`lp` と UTM は LP 側 JS が自動付与。電話番号は `sessionStorage._tel`（LPフォームが設定）。

## 7. ローカル確認

```bash
cd 施工管理LP && python3 -m http.server 8765
```

1. LPを開きフォーム送信相当で `_tel` を sessionStorage にセット  
2. `http://localhost:8765/thanks-v2/` を開く → LINE非表示  
3. 枠を予約 → LINE表示・スクロール
