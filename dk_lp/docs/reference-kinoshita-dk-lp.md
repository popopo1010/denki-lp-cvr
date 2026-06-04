# 木下流 × dk_lp 実装マッピング

`denkikouji/`・`sekokanri/` に既にある CVR 要素と、木下83手法・サンクス設計との対応。

> 理論: [`reference-kinoshita-marketing.md`](reference-kinoshita-marketing.md)  
> サンクス本番: `/Users/ikeobook15/施工管理LP/thanks-v2/`

---

## 既存クラスと木下手法

| クラス / 要素 | ファイル | 木下手法 # | 改善の方向 |
|---------------|----------|-----------|------------|
| `cvr-trust-bar` | `*/assets/css/cvr-boost.css` | 29, 79 | 許可・実績は要確認のみ |
| `cvr-social-proof` | 同上 | 29 | 根拠ある数値のみ |
| `cvr-micro-copy` | `denkikouji/index.html` 等 | 27–28 | 「30秒で完了」→**この先何が起きるか**を1行追加 |
| `cvr-step-reason` | 各ステップ | 25, 26 | 返報（入力すると何が得られるか）— 既に良好 |
| `cvr-tel-reassurance` | CSS | 13, 28 | 押し売りなし・営業電話の明示 |
| FAQ「転職しなくても」 | `denkikouji/index.html` | 13, 16 | 大分類不安 — **FV直上にも短く**検討 |
| `cvr-live-notification` | CSS/JS | 29 | 煽り過ぎ注意（#36） |

---

## 木下流でまだ薄い箇所（dk_lp）

| 項目 | 現状 | 推奨 |
|------|------|------|
| 広告＝FV一致 | 運用側 | UTM別ヘッダー文言 |
| 9段階・温度 | step-first あり | 「情報収集だけ」は第2ボタンで明示済み |
| 4段階・大分類 | ✅ `cvr-objection-pills`（2026-06-04） | — |
| 3秒FV | ✅ step-first で信頼帯非表示（CSS+JS） | — |
| マイクロコピー | ✅  outcome 型に更新 | A/B継続 |
| サンクス連携 | ✅ GAS+Zapier・`_tel`・予約枠プリロード（`main.js`） | thanks-v2 と電話で紐付け |
| 工種別口コミ | 要確認ダミーあり得る | 実データ3件（#29・新刊3人の声） |

---

## 更新ログ

| 日付 | 内容 |
|------|------|
| 2026-06-04 | 初版。dk_lp 実装スキャンに基づくギャップ表 |
| 2026-06-04 | CVR最適化実装（3ピル・FV信頼帯非表示・マイクロコピー・lp-form-step） |
| 2026-06-05 | LP→thanks ブリッジ（GAS・session・予約プリロード）を `app-v2.js` と統一 |
