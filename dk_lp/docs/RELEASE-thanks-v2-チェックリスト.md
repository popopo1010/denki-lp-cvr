# thanks-v2 リリース前チェックリスト（2026-06-04）

## 北極星

**LINE友だち追加** — 理想フロー: **案件イメージ → 面談予約（10分）→ LINEで求人詳細（見るだけOK）**

## 本番反映後の自動確認（Deploy Verify）

| 項目 | 期待 |
|------|------|
| `/thanks-v2/` | 200 |
| `thanks-page-context.js?v=8` | あり |
| `thanks-page.css?v=18` | あり |
| `thanks-booking-bootstrap.js?v=13` | あり |
| `thanks-booking-custom.js?v=20` | あり |
| `thanks-job-preview.js?v=7` | あり |
| `thanks-testimonials.js?v=4` | あり |
| `thanks-mobile-ux.js?v=3` | あり |
| `#t-future` | 未来想起セクションあり |
| `thanks-testimonial-stories.json` | 8ストーリー（kt〜tn） |
| `data-story-id` × 8 | 転職ストーリー展開 |
| 「本登録」「プレビュー」 | **なし** |
| `booking-slots.json` | `staff_count: 4`、未来枠あり |

## 訴求フロー（現行）

1. **登録完了** — 未来 vs 現状の分岐（`t-future`）+ 2ステップ案内
2. **非公開求人（イメージ）** 3件 — 都道府県は登録値のみ
3. **希望チップ** — 案件切替 → **面談予約**（LINEは予約後に解放）
4. **LINEで求人詳細** — 社名・条件全文（見るだけOK · 30秒）
5. **転職ストーリー** — タップで約400字（起承転結・ニーズタグ）

## 静的チェック（push前・ローカル）

```bash
bash scripts/release-pre-check.sh          # 一括（推奨）
# または個別:
node scripts/check-thanks-v2-release.mjs
node scripts/check-lp-bridge-release.mjs   # LP→GAS・session・ミラー一致
node scripts/sync-thanks-v2-mirrors.mjs   # WPLP / 自前LP 同期
node scripts/sync-booking-slots.js        # 枠JSON更新
bash scripts/verify-production-release.sh # 本番HTTP（push後も可）
node scripts/check-slack-bot.mjs          # Slack Bot 設定（投稿なし）
```

### LP → サンクス → 予約（ブリッジ）

| 項目 | 確認方法 |
|------|----------|
| フォーム → GAS+Zapier | `check-lp-bridge-release.mjs` |
| `_tel` / `dk_lead_profile` | LP送信後 sessionStorage |
| 予約 → スプシ行更新 | 同一電話で `calendar_*` |
| 予約 → Slackスレッド | `check-slack-bot.mjs` + 目視 |
| WPLP/自前LP = canonical | `check-lp-bridge-release.mjs` mirror |

## E2E（Playwright・本番URL）

```bash
npx playwright install chromium
npm install playwright@1.49.1 --no-save
node scripts/e2e-thanks-v2-release.mjs
```

ローカルサーバー確認:

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/thanks-v2/?_tel=09012345678&_name=テスト
```

## 手動E2E（リリース前）

### 電気 `denkikouji-v2`
- [ ] サンクス「電気工事バンク」・未来セクション表示
- [ ] 勤務地＝登録都道府県のみ
- [ ] 予約前はLINEロック → 予約後にLINE解放
- [ ] 転職ストーリー8件展開
- [ ] 予約枠表示（エラーなし）
- [ ] 実機LP送信 → Slackスレッド

### 施工管理 `sekoukanri-kentiku-v2`
- [ ] 「施工管理キャリア」ヘッダー
- [ ] 建築向け案件

### GAS / Slack
- [ ] `BOOKING_STAFF_JSON` 4人
- [ ] LPテスト送信 → 予約 → Slack「面談の予約がされました」

## CI

- `main` push → Deploy（minify → rsync）
- Sync booking: 5分ごと

## ロールバック

- `THANKS_BOOKING_MODE=timerex`（config）
- git revert + push
