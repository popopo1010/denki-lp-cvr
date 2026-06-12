# LP リポジトリ統合マップ（2026-06-12）

## 結論：このリポジトリだけ触ればよい

| 旧パス | 状態 | 正本 |
|---|---|---|
| `/Users/ikeobook15/施工管理LP`（KB: `raw/sekokan-lp`） | **現役・唯一の git リポ** | ここ |
| `/Users/ikeobook15/dk_lp`（KB: `raw/dk-lp`） | **統合済み・アーカイブ** | 上記 + 配下 `dk_lp/` サブフォルダ |
| `/Users/ikeobook15/施工管理LP_sekokan`（KB: `raw/sekokan-lp2`） | **アーカイブ** | `/denki-lp-cvr/sekoukanri/` へ 301 済み |

GitHub: https://github.com/popopo1010/denki-lp-cvr

---

## ディレクトリの意味（1 リポ内）

```
施工管理LP/
├── denkikouji/          … 本番 LP（電気工事）→ /denki-lp-cvr/denkikouji/
├── sekoukanri/          … 本番 LP（施工管理）→ /denki-lp-cvr/sekoukanri/
├── sekoukanri-*/        … 工種別 LP
├── meta-lp/             … Meta 広告用短 LP
├── thanks-v2/           … サンクス（CV+LINE）
├── assets/js/app.js     … 本番 JS（denkikouji 等が参照）
├── dk_lp/               … ブリッジ JS の参照実装 + 設計ドキュメント（本番 HTML ではない）
├── WPLP/ 自前LP/       … 3 パターン LP テンプレ
├── deploy/              … 旧 URL → 静的 LP の 301 マップ
└── scripts/             … deploy / 検証 / E2E
```

### `dk_lp/` サブフォルダについて

- **別リポではない**。`check-lp-bridge-release.mjs` が GAS/Slack ブリッジの必須トークンを検証する参照用。
- 本番の HTML/JS はリポジトリ**ルート**の `denkikouji/` + `assets/js/app.js`。
- 旧 standalone `/Users/ikeobook15/dk_lp` にあった差分は 2026-06-12 に `dk_lp/` へ取り込み済み。

---

## 旧 URL の扱い

`deploy/wp-legacy-url-map.json` で 301:

| 旧 | 新 |
|---|---|
| `/denkikouji-kyujin-2/` | `/denki-lp-cvr/denkikouji/` |
| `/sekokan/` | `/denki-lp-cvr/sekoukanri/` |
| `/thanks/` | `/denki-lp-cvr/thanks-v2/` |

→ `sekokan-lp2` リポの `/sekokan/` 直デプロイは不要。GitHub Actions は停止済み。

---

## 作業ルール

1. **編集・commit・deploy は `denki-lp-cvr` のみ**
2. 本番反映手順は `本番反映手順書.md` / wiki `LP本番反映手順`
3. 旧フォルダ `/Users/ikeobook15/dk_lp` は削除してよい（中身は取り込み済み）
