# thanks-v2 残論点・進捗（2026-06-02）

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

## 今回対応（コード）

| # | 項目 | ファイル |
|---|------|----------|
| A | M.K（半信半疑）を2番目に固定 | HTML + `thanks-testimonials.js` |
| B | 資格に近い口コミを上に並べ替え | `data-license` + `_license` 保存 |
| C | 予約前の心理的ハードル低減コピー | `t-cal__sub` |
| D | 本番デプロイ検証にアバターURL追加 | `deploy.yml` |

## 運用・要人手（コード外）

| # | 項目 | やること |
|---|------|----------|
| O1 | GAS 枠キャッシュ | `clasp push` + 再デプロイ + `BOOKING_STAFF_JSON`（林・福山・山田の calendar_id） |
| O2 | `sync-booking-slots` workflow | GitHub Actions が green か確認 |
| O3 | 実体験談への差し替え | 許諾取得後、文言・写真を実データに |
| O4 | 計測・A/B | GTMで口コミ展開率・予約完了率。順序・文言の検証 |
| O5 | 旧 `thanks/` | シェアブロック削除・看護系誤字があれば修正（v2本番化後） |

## 将来の改善（優先低〜中）

| # | 項目 | 期待効果 |
|---|------|----------|
| F1 | 予約完了後だけ口コミ表示 | カレンダーLCP優先（要UX判断） |
| F2 | 実写プロフィール（許諾あり） | 信頼↑・コンプラ管理必須 |
| F3 | 口コミ動画30秒 | 滞在↑・制作コスト↑ |
| F4 | Meta向け4問クイズLP | 別ページ `meta-lp-v2` 想定 |

## 本番チェックリスト

- [ ] https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/ が 200
- [ ] `booking-slots.json` が 200・TTFB短い
- [ ] `assets/img/testimonials/avatar-kt.svg` が 200
- [ ] 口コミ「詳しい経緯を読む」で全文表示
- [ ] 資格選択後サンクスで該当口コミが上に来る（`_license`）
- [ ] 予約完了後に LINE ブロック表示
