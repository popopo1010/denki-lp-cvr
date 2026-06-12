# thanks-v2 計測ダッシュボード設計

木下流KPI: **登録 ＜ 予約 ＜ LINE ＜ 採算リード**  
GA4 プロパティ: `G-3J55ZMS7K1` · GTM: `GTM-KV525PZ`

---

## 1. ファネル定義（ダッシュボードの芯）

```
LP送信          サンクス(qualified)    LINEクリック        予約完了
lead_form_submit → lead_conversion   → thanks_line_click → calendar_booked
     ①                  ②                  ⑤                  ③
```

> **2026-06-12〜 LINE先行フロー:** LINEロック廃止により ⑤（LINEクリック）は ③（予約）の**前後どちらでも**発生する。
> `thanks_line_click` の `line_cta_position`（hero / section / dock / booking_done）と `booked`（0/1）で分解する。
> `thanks_line_step_revealed`（④）は予約完了時に発火するイベントとして継続（互換維持）。

| 段階 | イベント（dataLayer） | GA4推奨名 | 意味 | 広告CV |
|------|----------------------|-----------|------|--------|
| ① LP登録 | `lead_form_submit` | `form_submit` | フォーム送信 | マイクロ |
| ② サンクス到達 | `lead_conversion` | `generate_lead` | qualified のみ（30分以内） | **主CV** |
| ②' サンクス表示 | `thanks_page_view` | `thanks_view` | qualified / 非qualified 両方 | 分析用 |
| ③ 電話予約 | `calendar_booked` | `calendar_booked` | GAS予約成功 | マイクロ |
| ④ LINE表示 | `thanks_line_step_revealed` | `thanks_line_revealed` | 予約後UI | マイクロ |
| ⑤ LINE友だち | `thanks_line_click` | `line_friend_click` | lin.ee クリック | **第2CV** |

### マイクロ（ボトルネック特定用）

| イベント | GA4名案 | 用途 |
|----------|---------|------|
| `thanks_job_preview_view` | `thanks_jobs_view` | 求人カード表示 |
| `thanks_job_preview_cta` | `thanks_jobs_cta` | 「希望条件を伝えて、最適な求人を受け取る」タップ |
| `thanks_job_intent_select` | `thanks_jobs_intent` | 比べたい軸切替 |
| `thanks_job_card_click` | `thanks_jobs_card` | 求人カードタップ |
| `thanks_booking_recommended_complete` | `booking_complete` | 予約完了（重複計測注意） |

---

## 2. 見るべきKPI（週次）

| KPI | 計算式 | 木下流の解釈 |
|-----|--------|-------------|
| **登録CVR** | ② / ① | 広告→フォーム（LP側） |
| **サンクス到達率** | ② / ① | リダイレクト・計測漏れチェック（≒100%想定） |
| **予約率** | ③ / ② | **サンクス最重要**（主アクション・LINE先行で沈まないか監視） |
| **サンクス→LINE率** | ⑤ / ② | **LINE KPI**（LINE先行後の主指標・上限が予約数でなくなった） |
| **LINE→予約率** | ③ / ⑤(booked=0) | LINE開設者がそのまま予約に進むか（ドック切替の効果） |
| **予約後LINE率** | ⑤(booked=1) / ③ | 予約完了カード・LINEセクションの回収力 |
| **qualified率** | `thanks_qualified=true` / 全thanks_view | 直アクセスノイズ |

**セグメント必須**: `lp_slug`（denkikouji / sekoukanri 等）、`deviceCategory`、`sessionSource`

---

## 3. GA4 探索レポート（15分で作れる）

### 3.1 ファネル探索

1. GA4 → **探索** → **ファunnel探索**
2. ステップ（同一セッション・順不同可）:

| Step | 条件 |
|------|------|
| 1. LP登録 | イベント `form_submit` または `lead_form_submit` |
| 2. サンクスCV | イベント `generate_lead` または `lead_conversion` |
| 3. 予約 | イベント `calendar_booked` |
| 4. LINE表示 | イベント `thanks_line_revealed` |
| 5. LINEクリック | イベント `line_friend_click` |

3. ** breakdown**: `lp_slug`（カスタム次元登録後）
4. 期間: 直近28日

### 3.2 自由形式（週次テーブル）

- **行**: `eventName`
- **列**: `eventCount`, `totalUsers`
- **フィルタ**: `pagePath` contains `/thanks-v2`
- **並び**: eventCount 降順

期待イベントが並ぶこと:

```
thanks_view / generate_lead / calendar_booked / thanks_line_revealed / line_friend_click
```

### 3.3 カスタム次元（GA4 管理）

| パラメータ | スコープ | 備考 |
|-----------|----------|------|
| `lp_slug` | イベント | GTM DLV から送信 |
| `thanks_qualified` | イベント | true/false |
| `booking_tool` | イベント | `custom` |
| `registration_step` | イベント | `line_friend_add` 等 |

登録: **管理 → データ表示 → カスタム定義 → カスタムディメンション**

---

## 4. GTM → GA4 タグ（未設定なら追加）

`docs/GTM-thanks-setup.md` の主5イベントに加え、探索用に以下を **GA4 イベント** タグで送る。

| トリガー（新規CE） | GA4イベント名 |
|-------------------|---------------|
| `thanks_job_preview_view` | `thanks_jobs_view` |
| `thanks_job_preview_cta` | `thanks_jobs_cta` |
| `thanks_job_intent_select` | `thanks_jobs_intent` |
| `thanks_job_card_click` | `thanks_jobs_card` |

**コンバージョンにマークするイベント（GA4）**

- `generate_lead`（主）
- `calendar_booked`（予約）
- `line_friend_click`（LINE）

---

## 5. Looker Studio テンプレート構成

### ページ1: エグゼクティブ（木下・週次）

| ウィジェット | 内容 |
|-------------|------|
| スコアカード×5 | ①〜⑤ の件数（28日） |
| スコアカード×3 | 予約率 / 予約→LINE率 / サンクス→LINE率 |
| 折れ線 | 週次 `generate_lead` と `calendar_booked` |
| 表 | `lp_slug` × 予約率 |

### ページ2: サンクス内行動

| ウィジェット | 内容 |
|-------------|------|
| ファネル | §3.1 と同じ |
| 表 | `thanks_jobs_cta` / `calendar_booked` 比率 |
| 表 | `deviceCategory` × 予約率 |

### ページ3: 品質・ノイズ

| ウィジェット | 内容 |
|-------------|------|
| 比較 | `thanks_qualified=true` vs `false` |
| 表 | `sessionSource` × 登録数 |

**データソース**: GA4 `G-3J55ZMS7K1` のみで開始。後から GAS 予約ログ（スプシ）をブレンド可。

---

## 6. 真実の源泉（GA以外）

| ソース | 用途 | 照合 |
|--------|------|------|
| GA4 `calendar_booked` | 予約クリック成功 | 週次 |
| GAS / スプシ予約ログ | 確定予約・担当 | **③の正** |
| GAS LINE beacon (`_event=line_click`) | LINEクリック（tel必須） | **⑤の補完** |
| Slack 予約通知 | 運用確認 | 日次 |
| Google Ads / Meta | 広告CV | `lead_conversion` と件数比較 |

**ズレが出たら**: GTMプレビュー → 該当セッションの dataLayer 順序を確認。

---

## 7. 計測健全性チェック（月1）

- [ ] 直開き `thanks-v2` で `lead_conversion` が **出ない**
- [ ] LP送信 → 30分以内サンクスで `thanks_qualified: true`
- [ ] 予約成功で `calendar_booked` → `thanks_line_step_revealed` が連続
- [ ] LINEクリックで `thanks_line_click` + GAS beacon（telあり）
- [ ] 広告CV（Ads/Meta）≒ GA4 `generate_lead`（±20%）
- [ ] `lp_slug` が `(not set)` 10% 未満

```bash
# 本番HTMLのGTM/バージョン確認
curl -sL "https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/" | rg "thanks-page-context|thanks-v2-deferred|GTM-KV525PZ"
```

---

## 8. ボトルネック別アクション

| 症状 | 疑う場所 | 次の一手 |
|------|----------|----------|
| ②は多いが③が低い | サンクス→予約 | ヒーロー/CTA/カレンダーUX（いまの改修領域） |
| ③は多いが⑤が低い | 予約→LINE | 予約後ヒーロー・ドック・LINEコピー |
| ④はあるが⑤が低い | LINEボタン | マイクロコピー・ボタン位置 |
| ①→②が低い | LP→サンクス | リダイレクト・sessionStorage・キャッシュ |
| qualified率が低い | 計測 | `dk_lp_lead_v1` TTL / 旧thanks URL |

---

## 9. API / 自動レポート（任意）

環境変数を設定すると MCP / スクリプトから週次取得可能:

```bash
export GA_PROPERTY_ID=123456789
export GA_SERVICE_ACCOUNT_JSON=/path/to/service-account.json
```

プロパティIDは GA4 管理 → プロパティ設定 → **プロパティID**（`G-` ではなく数字）。

---

## 10. 関連ドキュメント

- `docs/GTM-thanks-v2-revival.md` — 広告CV復活
- `dk_lp/docs/GTM-thanks-setup.md` — dataLayer ↔ GTM 対応
- `docs/reference-kinoshita-marketing.md` §4.2, §11 — 利益の式・A/B候補
