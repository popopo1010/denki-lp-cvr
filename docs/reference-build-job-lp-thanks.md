# リファレンス: ビルドジョブ（Build Job）LP / Thanks

競合・参考実装として保管。自社（電気工事バンク / `denki-lp-cvr`）との差分整理用。  
調査日: 2026-06-02

> `dk_lp` リポジトリにも同一ファイルあり: `../dk_lp/docs/reference-build-job-lp-thanks.md`  
> **木下マーケ**: [`reference-kinoshita-marketing.md`](reference-kinoshita-marketing.md)

---

## 公式・運営

| 項目 | 内容 |
|------|------|
| サービス名 | ビルドジョブ（Build Job） |
| 運営 | 株式会社MyVision |
| 本サイト | https://build-job.jp/ |
| 訴求例 | 施工管理・設計特化、平均年収UP 124万円、Google口コミ ★4.8、内定率77% 等 |

---

## LP（Meta・施工管理・未経験向け）

### URL（例）

```
https://form.build-job.jp/promotions/delivery/cbfd6581-c729-4706-906f-c29cac793ef7
  ?utm_source=facebook
  &utm_medium=display
  &utm_campaign=施工管理_20260430_-33未経験者静止画_...
```

- `lp_delivery_config_id` = 上記 UUID（配信設定）
- UTM / `utm_content` / `fbclid` まで付与

### 構成メモ

1. **FV**: 静止画＋数字（年収UP平均124万、Google ★4.8）
2. **2択**: 「転職したい」／「情報が知りたい」
3. **多段フォーム**: 生年は **年ボタン1タップ**（プルダウンではない）
4. **進捗**: 3ドット（●○○）
5. **注記**: 正社員希望のみ・派遣のみは不可
6. **最終**: 名前・生年月日・メール・電話 → 同意して送信

### 自社との対応

| ビルドジョブ | 自社 |
|-------------|------|
| `form.build-job.jp` 専用フォーム | `denkilp.builders-job.com/denki-lp-cvr/` |
| Meta短尺＋生年ボタン | `meta-lp/` / `*-v2/` |
| 施工管理・未経験訴求 | `sekoukanri` / `denkikouji` 系 |

---

## Thanks（2系統ある）

ビルドジョブの「thanks」は **用途が2つ** に分かれる。混同注意。

### A. 登録直後 — 追加ヒアリング（第2フォーム）

**URL 例**

```
https://form.build-job.jp/thanks/64145f16-4a88-4d9b-a0ef-93e686c40627
  ?lp_id=06454bc6-04df-4dcc-a1c2-c33589d0fe85
  &lp_delivery_config_id=cbfd6581-c729-4706-906f-c29cac793ef7
  &registration_id=ad84eb72-6793-4831-8c64-e879564f7dd4
  &birth_year=1973
```

**タイトル**: 無料転職相談の申込みが完了いたしました。

**コピー**

- 基本情報のご登録ありがとうございました
- より良いアドバイスのため、**追加情報をご登録ください**

**ステップ（約5段・ボタンUI）**

1. ご経験（施工管理／設計／工事作業／設備管理／いずれもない）
2. 職種詳細（建築施工管理、電気工事施工管理…）
3. 保有資格（各種施工管理・建築士…／資格なし）
4. 転職希望時期（1ヶ月以内〜いい求人があればいつでも）
5. 退職意向（離職中〜辞める気は無い）
6. 住所（郵便番号・都道府県・市区町村）

**ないもの**: カレンダー、LINE、電話までの期限明示、口コミ

**URLパラメータの意味**

- `registration_id` … CRM紐付け
- `birth_year` … LPから引き継ぎ
- `lp_id` / `lp_delivery_config_id` … 配信・LP識別

---

### B. 面談予約後 — ご予約完了 + 任意アンケート

**画面イメージ（スクショ参照）**

1. お礼（基本情報登録ありがとう）
2. **ご予約完了**（チェックアイコン）
3. **日時確定ボックス**（例: 2026年6月2日(火) 21:30〜22:30）
4. **任意**「事前アンケートへの回答のお願い」
   - 当日ハイクオリティ求人紹介のため
   - **登録メールにも送信済み** と明記
   - 青ボタン「事前アンケートに回答」（別URL）

**事前アンケートURL（正しい形の想定）**

```
https://form.build-job.jp/thanks/{thanks_page_id}/forms/preliminary-questionnaire
  ?career_support_id={uuid}
  &brand=build_job
```

**壊れている例（参照しない）**

```
.../thanks/undefined/forms/preliminary-questionnaire?...
→ 404（thanks_page_id 未設定）
```

---

## 自社 thanks-v2 との位置づけ

| 観点 | ビルドジョブ | 自社 `thanks-v2` |
|------|-------------|------------------|
| 主目的 | A=属性追加 / B=予約確定の安心 | 予約（カレンダー）+ LINE |
| 予約UI | 別フロー（画面未確認） | 独自3日枠 + GAS |
| 予約完了表示 | Bで大きく日時表示 | 枠内 `t-booking-done` のみ |
| 第2CV | 任意・事前アンケート | LINE友だち追加 |
| 紹介シェア | なし | 削除済み（不要） |

**リポジトリ上の自社サンクス**

- 新: `thanks-v2/index.html`
- 本番想定: `https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/`
- 旧WP: `https://denkilp.builders-job.com/thanks/`（参照用・使わない）

---

## 借りるときの優先度（メモ）

### LP

- [ ] FVの **集計数字1行**（口コミ★ / 平均年収UP）
- [ ] 生年 **ボタン1タップ** ステップ
- [ ] 正社員のみ等の **1行フィルター**
- [ ] 進捗ドット

### Thanks

- [ ] 予約成功後の **「ご予約完了」+ 日時ボックス**（B系統）
- [ ] 予約済みならカレンダー非表示
- [ ] **任意** 事前アンケート3問（別モーダル or リンク）— Aの短縮版
- [ ] `registration_id` 相当のURL/GAS紐付け

### 借りない

- thanks で長い必須フォームだけ続ける（電話・LINE・予約が後回し）
- `thanks/undefined` 系のURL設計
- 紹介・Xシェアブロック

---

## 自社関連ドキュメント

- GTM: `../dk_lp/docs/GTM-thanks-setup.md`
- 独自予約: `gas-recorder/独自予約セットアップ.md`
- 本番手順: `本番反映手順書.md`（v2 URL一覧）

---

## 更新ログ

| 日付 | 内容 |
|------|------|
| 2026-06-02 | 初版。LP・thanks A/B・事前アンケートURL・自社差分を整理 |
