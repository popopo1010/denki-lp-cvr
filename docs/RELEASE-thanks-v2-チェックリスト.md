# thanks-v2 リリース前チェックリスト（2026-06-03 最終）

## 本番反映済み（自動確認）

| 項目 | 期待 | 確認方法 |
|------|------|----------|
| `/thanks-v2/` | 200 | CI Verify / curl |
| `thanks-job-preview.js?v=6` | あり | HTML grep |
| `thanks-page-context.js?v=4` | あり（`defer`・DOMContentLoaded） | HTML grep |
| `thanks-page.css?v=14` | あり | HTML grep |
| `thanks-mobile-ux.js?v=1` | あり | HTML grep |
| `booking-slots.json` | `staff_count: 4`、122枠 | JSON |
| 画面に「プレビュー」 | **なし** | 「非公開求人（イメージ）」表記 |
| 求人カード勤務地 | **登録都道府県のみ** | LP送信後・都道府県入力時 |

## 職種LP × サンクス

| LP（本番パス） | 遷移先 | 求人イメージ | ブランド |
|----------------|--------|--------------|----------|
| `denkikouji-v2/` | `thanks-v2/` | 電気工事士・施工管理・主任 | 電気工事バンク |
| `sekoukanri-v2/` | 同上 | 建築・土木・管・電気施工管理 | 施工管理キャリア |
| `sekoukanri-kentiku-v2/` | 同上 | 建築中心 | 施工管理キャリア |
| `sekoukanri-doboku-v2/` | 同上 | 土木中心 | 施工管理キャリア |
| `sekoukanri-denkisekou-v2/` | 同上 | 電気施工管理中心 | 施工管理キャリア |
| `nenshu-shindan-v2/*` | `nenshu-shindan-v2/thanks/` | 専用（LINE） | 年収診断 |
| `nenshu-shindan/*` | `nenshu-shindan/thanks/` | 専用 | 年収診断 |

計測: `?lp=` / `_lp` / `dk_lp_lead_v1` で職種分離。

## 訴求フロー（現行）

1. 仮登録完了 → **非公開求人（イメージ）** 3件（都道府県は登録値のみ表示）
2. 希望チップで案件入れ替え → **10分相談**（推奨）
3. **LINE本登録** → 非公開全文・企業からの声がけ

## 手動E2E（リリース前に実施）

### 自動E2E（Playwright）
```bash
npx playwright install chromium
npm install playwright@1.49.1 --no-save
node scripts/e2e-thanks-v2-release.mjs
```

### 電気 `denkikouji-v2`
- [x] サンクス「電気工事バンク」・非公開求人イメージ（自動）
- [x] 勤務地＝登録都道府県のみ（自動）
- [x] 希望チップ・スティッキーCTA（自動）
- [x] 予約枠表示（自動）
- [ ] 実機LP送信 → Slackスレッド（手動）

### 施工管理 `sekoukanri-kentiku-v2`（代表）
- [x] 建築向け案件・都道府県表示（自動・v=4 ブランド修正後）
- [ ] 「施工管理キャリア」ヘッダー（v=4 デプロイ後に自動再確認）
- [ ] 実機LINE（手動）

### 年収診断 `nenshu-shindan-v2/sekoukanri`
- [x] `nenshu-shindan-v2/thanks/` へ遷移（自動）

### GAS（変更なし・再確認）
- [ ] `BOOKING_STAFF_JSON` 4人
- [ ] `SLACK_BOT_TOKEN` + `SLACK_LEAD_CHANNEL_ID`
- [ ] `BOOKING_ALLOW_OVERLAP` 未設定推奨

## CI

- `main` push → Deploy（minify → rsync）
- Verify: thanks-v2 コピー・`v=6`・booking 4人
- Sync booking: 5分ごと

## ロールバック

- `THANKS_BOOKING_MODE=timerex`（config）
- git revert + push

## 直近コミット（参考）

- `c5dd118` 勤務地＝登録都道府県のみ
- `7ba84a5` プレビュー表記廃止・非公開求人イメージ
- `035477f` スマホUI（フロー・スティッキーCTA）
- `3e47985` 職種別求人プレビュー・ブランド切替
