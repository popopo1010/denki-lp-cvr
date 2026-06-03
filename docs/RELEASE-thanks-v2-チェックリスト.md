# thanks-v2 リリース前チェックリスト（2026-06-03）

## 本番URL（自動確認済み 2026-06-03）

| 項目 | URL | 期待 |
|------|-----|------|
| サンクス | https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/ | 200 |
| 空き枠JSON | …/assets/data/booking-slots.json | 200・`slots` 配列あり |
| 予約JS | …/assets/js/thanks-booking-bootstrap.js | 200 |
| 口コミSVG | …/assets/img/testimonials/avatar-kt.svg | 200 |

## GAS（スクリプトプロパティ）

| プロパティ | 状態 |
|------------|------|
| `BOOKING_STAFF_JSON` | 4人分 `calendar_id`（林・福山・山田含む） |
| `SLACK_BOT_TOKEN` | `xoxb-...` 設定済み |
| `SLACK_LEAD_CHANNEL_ID` | `C...` 設定済み |
| `SLACK_MENTION_CA` | 任意（未設定＝メンションなし） |
| `BOOKING_ALLOW_OVERLAP` | 未設定 or `false`（空き担当優先） |

**反映:** `cd gas-recorder && clasp push && clasp redeploy AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw`

**Slack Bot:** 通知チャンネルで `/invite @lead_apo`

## 手動E2E（リリース前に1回）

- [ ] テスト電話で LP 送信 → Slack「新規リード」・スプシ `slack_thread_ts` あり
- [ ] 同じ電話でサンクス → 3日分の枠表示 → 予約完了
- [ ] Slack 同スレッドに「面談の予約がされました」（メンションなし可）
- [ ] 担当カレンダーに予定作成
- [ ] 予約後 LINE ブロック表示・GTM `dataLayer` イベント
- [ ] 口コミ「詳しい経緯を読む」・資格マッチ並べ替え（`_license`）

## CI / 運用

| Workflow | 用途 |
|----------|------|
| Deploy to Xserver | `main` push → 全ファイル rsync + minify |
| Sync booking slots | 5分ごと `booking-slots.json` のみ scp |

## 既知の制限

- 旧リード（`slack_thread_ts` 空）はスレッド返信不可 → Webhook フォールバック（任意）
- 予約と LP の電話番号不一致 → 行突合・スレッド返信失敗
- 静的枠は最大5日分（表示は3日ずつ）。GAS キャッシュ 3分 + JSON 5分同期

## ロールバック

- 予約: `thanks-booking-config.js` で `THANKS_BOOKING_MODE = "timerex"`
- デプロイ: 直前コミットを `main` に revert push
