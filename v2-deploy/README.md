# v2 ABテスト デプロイ用スニペット

このディレクトリには、改善版（v2）LPを **新URLで公開** するための WordPress / GTM 設定スニペットを集約。

## 構成方針

- **現行URL**（旧版）はファイル/設定ともに無変更で稼働継続
- **新URL**（`-v2` サフィックス）に改善版を展開してABテスト
- GitHub Pages 側では旧版 `cvr-boost.css` / `app.js` と並列で `cvr-boost-v2.css` / `app-v2.js` を提供
- `_lp` 識別: 改善版は末尾に `-v2` が付く（例: `sekoukanri-v2`, `denkikouji-meta-v2`）

---

## WP新ページ作成の手順

各LPごとに WordPress 管理画面で **既存ページを複製** → 新URL（`-v2` サフィックス付き）で公開。

| 現行ページURL | 新URL（複製先） |
|---|---|
| `/sekoukanri-kyujin-2/` | `/sekoukanri-kyujin-2-v2/` |
| `/sekoukanri-kentiku-kyujin/` 等 | `+ -v2` |
| `/sekoukanri-doboku-kyujin/` | `+ -v2` |
| `/sekoukanri-denkisekou-kyujin/` | `+ -v2` |
| `/denkikouji-kyujin-2/` | `/denkikouji-kyujin-2-v2/` |

※ 正確なslugは現状のWP管理画面で確認のうえ命名。

複製後、本文HTMLを **`v2-deploy/wp-html/<lp>.html`** のスニペットで置き換え（改善版コンテンツ：損失型FV見出し・3バッジ・新ヒーロー画像など含む）。

---

## GTMタグ追加

新URL用に「カスタムHTMLタグ」を追加（既存タグはそのまま）：

- **タグ名**: `CVR-Boost v2 — sekoukanri (改善版)` 等
- **トリガー**: ページURLが `/<新URL>/` を含む
- **HTML**: `v2-deploy/gtm/<lp>.html` の中身

例（`sekoukanri-v2`）:
```html
<link rel="stylesheet" href="https://popopo1010.github.io/denki-lp-cvr/assets/css/cvr-boost-v2.css">
<script>window.__LP_ID="sekoukanri-v2";</script>
<script src="https://popopo1010.github.io/denki-lp-cvr/assets/js/app-v2.js" defer></script>
```

`__LP_ID` を `-v2` 付きで明示することで、Zapier/GAS スプシ側で改善版の送信を即区別できる。

---

## 振り分け（広告側）

| 媒体 | 方式 |
|---|---|
| Google広告 | 既存キャンペーンを複製、リンク先を `-v2` URL に。予算を50/50で割り当て |
| Meta広告 | 既存広告セットを複製、リンク先を `-v2` URL に。予算を50/50で割り当て |

50/50で運用し、最低 **2週間 / 各URL 50件 CV** を目安に判定。

---

## 集計

スプシ `LP form recorder` の `_lp` 列で `-v2` 付きを抽出。

```
旧版: _lp = sekoukanri, sekoukanri-kentiku, ...
新版: _lp = sekoukanri-v2, sekoukanri-kentiku-v2, ...
```

A/B 各URLの「広告クリック数 → LP閲覧 → CV」をファネルで比較。

---

## ロールバック

新版で不具合が出た場合：

1. **広告**: 新URL向けキャンペーン/広告セットを停止 → 旧URLに送客集約
2. **GTM**: `CVR-Boost v2 — *` タグを「一時停止」
3. **WP**: 新URLページを非公開 or 削除

旧URLは完全に独立して動いているため、新URL停止だけで完了。
