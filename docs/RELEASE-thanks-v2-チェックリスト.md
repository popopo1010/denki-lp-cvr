# thanks-v2 リリース前チェックリスト（2026-06-03）

## 職種LP × サンクス

| LP | 遷移先 | プレビュー | ブランド |
|----|--------|------------|----------|
| `denkikouji-v2` | `thanks-v2` | 電気系資格グループ | 電気工事バンク |
| `sekoukanri-*-v2` | `thanks-v2` | 建築・土木・管・電気施工管理 | 施工管理キャリア |
| `nenshu-shindan-v2/*` | `nenshu-shindan-v2/thanks/` | 専用フロー（LINE） | 年収診断 |
| `nenshu-shindan/*` | `nenshu-shindan/thanks/` | 同上 | 年収診断 |

`?lp=` / `_lp` で GTM・表示文脈を分離。

## 本番URL

| 項目 | URL |
|------|-----|
| サンクス | https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/ |
| 求人JSON | …/assets/data/thanks-job-previews.json |
| JS | `thanks-page-context.js?v=1` / `thanks-job-preview.js?v=4` |

## 手動E2E

- [ ] 建築LP → サンクスで建築向けプレビュー3件・ヘッダー「施工管理キャリア」
- [ ] 電気工事LP → 電気向けプレビュー・「電気工事バンク」
- [ ] 年収診断v2 → 専用サンクス（thanks-v2 に行かない）
- [ ] 予約 → LINE / Slack

## CI

- Deploy: `main` push
- minify: `thanks-page-context.js` 含む
