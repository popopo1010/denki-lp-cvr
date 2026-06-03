# thanks-v2 リリース前チェックリスト（2026-06-03 更新）

## 本番URL（要再確認）

| 項目 | URL | 期待 |
|------|-----|------|
| サンクス | https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/ | 200 |
| 求人JSON | …/assets/data/thanks-job-previews.json | 200 |
| 空き枠JSON | …/assets/data/booking-slots.json | 200・`staff_count: 4` |
| JS | `thanks-job-preview.js?v=3` / `thanks-booking-custom.js?v=16` | 200 |

## 登録フロー（現行）

1. **仮登録** … LP送信（`dk_lead_profile` に資格・都道府県・意欲）
2. **求人プレビュー** … 好条件サンプル3件・希望チップで再ソート（会社名非公開）
3. **詳しく聞く** … カレンダー推奨（スキップ可）
4. **LINE本登録** … 求人一覧・新着

## GAS

| プロパティ | 備考 |
|------------|------|
| `BOOKING_STAFF_JSON` | 4人・空きマージ |
| `SLACK_BOT_TOKEN` + `SLACK_LEAD_CHANNEL_ID` | Bot + スレッド返信 |
| `BOOKING_ALLOW_OVERLAP` | 未設定推奨（空き担当優先） |

## 手動E2E

- [ ] LP（郵便番号まで）→ サンクスで都道府県マッチ求人
- [ ] 希望チップで求人入れ替え
- [ ] 予約 → LINE強調 → Slackスレッド
- [ ] GTM Preview: `thanks_job_preview_view` 等

## CI

- Deploy: `main` push（minify → rsync）
- Sync booking: 5分ごと JSON

## 既知

- 求人プレビューは**好条件のイメージ**（実案件は本登録後）
- Deploy失敗時は本番HTMLが古い `?v=` のまま残る → Actions green を確認

## ロールバック

- `THANKS_BOOKING_MODE=timerex`（config）
- git revert + push
