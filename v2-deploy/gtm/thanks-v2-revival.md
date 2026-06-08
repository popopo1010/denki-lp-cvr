# GTM 復活手順 — thanks-v2 コンバージョン計測

コンテナ: **GTM-KV525PZ**  
サンクス URL（本番）: `https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/`  
コード側: `assets/js/thanks-gtm.js` → `thanks-v2-deferred.js` が dataLayer を push（2026-06 即時 GTM 読込に変更）

---

## 現状の問題（なぜ CV が 0 か）

| 項目 | 旧設定 | 現状 |
|------|--------|------|
| CV トリガー URL | `denkilp.builders-job.com/thanks/` | ユーザーは `.../denki-lp-cvr/thanks-v2/` に到達 |
| イベント | ページ URL のみ | コードは `lead_conversion` を push 済み |
| GTM 読込 | thanks-v2 で最大 6 秒遅延 | **コード修正済み：即時読込** |

---

## 推奨：カスタムイベント `lead_conversion` で計測（15分）

直アクセス thanks-v2 は `thanks_qualified: false` のため CV しない。フォーム送信後 30 分以内のみ CV。

### 1. 変数（ユーザー定義）

| 名前 | タイプ | データレイヤ変数名 |
|------|--------|-------------------|
| DLV - lp_slug | データレイヤ変数 | `lp_slug` |
| DLV - thanks_qualified | データレイヤ変数 | `thanks_qualified` |
| DLV - conversion_source | データレイヤ変数 | `conversion_source` |

### 2. トリガー

**CE - lead_conversion**

- タイプ: カスタムイベント
- イベント名: `lead_conversion`（完全一致）
- （任意）条件: `thanks_qualified` equals `true`

**CE - thanks_page_view（分析用・CV には使わない）**

- イベント名: `thanks_page_view`

### 3. タグ — Google 広告

| 項目 | 値 |
|------|-----|
| タグタイプ | Google 広告コンバージョン連携 |
| Conversion ID | `AW-773755530` |
| Conversion Label（全体） | `p4KaCPq4z5EBEIql-vAC`（Thanks遷移） |
| Conversion Label（電気工事専用） | `nL_rCJKviMQDEIql-vAC`（Thanks遷移_電気工事） |
| トリガー | `CE - lead_conversion` |

※ 既存の **Page URL contains `/thanks/`** トリガーの awct タグは **一時停止**。

### 4. タグ — GA4

| 項目 | 値 |
|------|-----|
| タグタイプ | Google Analytics: GA4 イベント |
| 測定 ID | `G-3J55ZMS7K1` |
| イベント名 | `generate_lead` |
| イベントパラメータ | `lp_slug` = `{{DLV - lp_slug}}` |
| トリガー | `CE - lead_conversion` |

### 5. タグ — Meta Pixel

| 項目 | 値 |
|------|-----|
| タグタイプ | カスタム HTML |
| HTML | `fbq('trackSingle','3920621791536996','CompleteRegistration');` |
| トリガー | `CE - lead_conversion` |

※ 既存の `/thanks/` URL トリガー CompleteRegistration タグは **一時停止**。

### 6. 公開前チェック（GTM プレビュー）

1. LP: `https://denkilp.builders-job.com/denki-lp-cvr/denkikouji/?dk_test=1`
2. テスト送信（09012345678 / テスト太郎 → Zapier 送信されない）
3. thanks-v2 遷移後、Tag Assistant で確認:

| dataLayer event | 期待 |
|-----------------|------|
| `lead_form_submit` | LP で fire |
| `thanks_page_view` | thanks-v2 で fire |
| `lead_conversion` | thanks-v2 で fire（qualified のみ） |
| Google Ads コンバージョンタグ | `lead_conversion` で fire |

4. 直開き `.../thanks-v2/` → `lead_conversion` **出ない**こと

### 7. 公開

GTM **送信** → Google 広告「コンバージョン」でタグステータス確認（数時間かかる場合あり）

---

## 最小変更（URL トリガーだけ直す）

イベント設定が難しい場合、既存トリガーの URL 条件だけ変更:

```
旧: Page URL contains https://denkilp.builders-job.com/thanks/
新: Page URL contains /denki-lp-cvr/thanks-v2
```

⚠️ 直アクセス thanks-v2 も CV してしまう。可能なら上記 `lead_conversion` 方式を推奨。

---

## 停止推奨リスト（旧 thanks 用）

GTM 内で URL `/thanks/` 条件のタグ:

- Google Ads コンバージョン（旧 URL トリガー）
- GA4 `thanks_pageview`（URL トリガー）
- Meta `CompleteRegistration`（URL トリガー）

---

## コード ↔ GTM 対応表

| dataLayer | タイミング | GTM で使う |
|-----------|-----------|------------|
| `lead_form_submit` | LP 送信 | マイクロ CV / GA4 form_submit |
| `thanks_page_view` | thanks-v2 表示 | 分析のみ |
| `thanks_pageview` | 同上（互換） | 旧 GA4 タグ名互換 |
| `lead_conversion` | qualified 時 1 回 | **Google Ads / Meta 主 CV** |
| `calendar_booked` | 予約完了 | マイクロ CV |
| `thanks_line_click` | LINE クリック | 最終 CV |

詳細: `docs/GTM-thanks-setup.md`
