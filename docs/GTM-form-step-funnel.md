# GTM / GA4: LPのステップ別ファネル（form_step）設定手順（2026-09-19）

目的: 「どのステップで離脱しているか」を GA4 で見られるようにする。
LP の JS は各ステップ到達時に `dataLayer.push({event:"form_step", step_name:"step04"})` を
すでに送っている（`assets/js/app.js` `trackStep` / `app-v2.js` / `dk_lp/assets/js/app.js`）。
足りないのは **GTM 側で GA4 に流すタグ** と **GA4 側の受け皿（カスタムディメンション＋ファネル探索）** の2つ。

`step_name` の値: **`step-first`**（FV表示）→ `step01` → `step03` → `step04` → `step05` → `step06`（step02 は存在しない）。
**`step-first` も発火する**（`showPage` が初回表示でも `trackStep` を呼ぶ。2026-09-22 に app.js / app-v2.js 両方を実ブラウザで確認）。
これは**ファネルの分母として使える**——FVを見た人のうち何%が資格選択へ進んだかが分かる。
Clarity実測ではFV早期離脱が17%で既知の最大の離脱点なので、ここを外すと一番大きい崖を見落とす。
送信完了は既存の `lead_form_submit`（マイクロCV）／ `lead_conversion` → GA4 `generate_lead`（主CV）を使う。

## 1. GTM（5分・インポート）

1. GTM `GTM-KV525PZ` → 管理 → **コンテナをインポート**
2. ファイル: `v2-deploy/gtm/form-step-funnel.container.json`
3. ワークスペース: 新規（例 `form_step funnel`）／ **統合**（上書きしない）
4. 追加されるもの（既存に同名があれば重複するので、片方を削除）:

| 種別 | 名前 | 内容 |
|---|---|---|
| 変数 | `DLV - step_name` | データレイヤー変数 `step_name` |
| トリガー | `CE - form_step` | カスタムイベント `form_step`（完全一致） |
| タグ | `GA4 - form_step` | GA4 イベント `form_step`／測定ID `G-3J55ZMS7K1`／パラメータ `step_name`, `lp_path`(Page Path) |

5. **プレビューで確認**: `https://denkilp.builders-job.com/denki-lp-cvr/denkikouji/?dk_test=1` を開き、
   FV → 資格 → 希望 → 都道府県 → 氏名 → 電話 と進めて、Tag Assistant で `form_step` が
   `step-first / step01 / step03 / step04 / step05 / step06` の順に**6回** fire すること（1ステップ1回。戻る→進むは再送しない）。
   GA4 の DebugView でも同じ順で `form_step` が並ぶこと。
6. 公開。

## 2. GA4（10分・画面操作）

### 2-1. カスタムディメンション（必須。無いと探索で step_name を使えない）

GA4 → 管理 → データの表示 → **カスタム定義** → カスタムディメンションを作成

| 項目 | 値 |
|---|---|
| ディメンション名 | `step_name` |
| 範囲 | イベント |
| イベントパラメータ | `step_name` |

同じ要領で `lp_path`（イベント）も登録しておくと LP 別に切れる（`ページパス` でも代用可）。
**登録した時点から**しか集計に乗らない（過去分は遡らない）。

### 2-2. ファネル探索

GA4 → 探索 → **目標到達プロセスデータ探索** → 新規

| ステップ | 条件 |
|---|---|
| 1 FV表示 | イベント `form_step` かつ `step_name` = `step-first` |
| 2 資格 | `form_step` かつ `step_name` = `step01` |
| 3 実務経験 | `form_step` かつ `step_name` = `step03` |
| 4 都道府県 | `form_step` かつ `step_name` = `step04` |
| 5 氏名・生まれ年 | `form_step` かつ `step_name` = `step05` |
| 6 電話 | `form_step` かつ `step_name` = `step06` |
| 7 送信 | イベント `lead_form_submit`（無ければ `generate_lead`） |

- 「目標到達プロセスをオープンにする」= **OFF**（順序どおり）
- 内訳: `ページパス`（または `lp_path`）で LP ごとの離脱率を比較
- セグメント: 必要なら `is_test` ≠ `true` で本番テストを除外（`lead_form_submit` にだけ付いている）

読み方: 各ステップの「放棄率」がそのステップでの離脱。**step-first→step01 の落ちがFV離脱**（既知の最大点）、
step05→step06 の落ちが氏名入力、step06→送信の落ちが電話番号。
**外した「個人情報は厳重に管理されています」を戻すかどうかは、ここで step05/06 の放棄率が他ステップより明確に高いときだけ判断する**（CLAUDE.md 2026-09-19 決定）。

## 2-3. 計測そのものの番人

`scripts/e2e-lp-flow-local.mjs` の `runStepEvents` が、実ブラウザで全フォームLPを歩いて
**「1ステップにつき1回・実在する step_name・到達したのに未計測が無い」**ことを毎回CIで確かめる。
静的チェック（`check-form-invariants` 5c）は「push するのは app.js / app-v2.js だけ」＝二重push防止しか見ないので、
発火そのものはこちらが担保する。push が1つ欠けると GA4 に**実在しない崖**が出て、ありもしない離脱を追うことになる。

## 3. Clarity（すでに動いている）

同じ到達をカスタムタグ `lp_step` に付けている（2026-08-23〜）。Clarity 側は Dashboard → Filters → Custom tags → `lp_step` で
値ごとのセッション数が出る。録画で「どこで指が止まるか」を見るのはこちら、数字の推移は GA4 のファネルで見る。

## 4. 触っていないもの

- LP の JS は変更なし（`form_step` の push は実装済み）。
- 既存の `lead_conversion` / Google広告 / Meta のタグは触らない（`docs/GTM-thanks-v2-revival.md`）。
