# 新ドメイン向け電気工事士LP `denkikouji-nd/`（参考: denko-mirai.com/lp01）— 2026-09-06

依頼: 「新規ドメインで、https://denko-mirai.com/lp01（デンコウミライエージェントのFB広告LP）を参考に、いまのLPをアップデートしてほしい」

現在地: **①作業ブランチ `claude/new-domain-lp-update-kvb1tw` に push 済み → STG 反映（`staging` ブランチ）→ PR 未作成 → main 未マージ → 本番はまだ旧版のまま。**
本番 `denkikouji/` は触っていない（新ディレクトリ `denkikouji-nd/` を追加）。**新ドメイン名は未指定**のため、canonical / og:url / デプロイ先は現行ドメイン配下（`/denki-lp-cvr/denkikouji-nd/`）のまま。ドメインが決まったら §4 の残作業を行う。

## 1. 参考LPの採取結果（denko-mirai.com/lp01 = テンプレ `0037`）

作業環境のネットワークポリシーで最初は遮断されていたが、オーナーが `denko-mirai.com` を許可 → 本体HTML/JS/画像は取得できた（`api.mirai-agent.jp` / `static.mirai-agent.jp` は遮断のままなので、選択肢の API 応答だけスタブして描画）。Chromium は TLS で切られるため、取得した HTML/JS/画像をローカルにミラーして描画した。スクショは `docs/assets/ref-denko-mirai-lp01/`。

| 位置 | 参考LPの中身 |
|---|---|
| ヘッダー | ロゴ｜「ご利用者様数 年間230,000人 ※2025年1月〜12月実績」バッジ｜厚生労働大臣許可番号（白背景） |
| FV | 写真ヒーロー「電気工事士専門 人気の非公開求人をご紹介！」＋3チップ（年休120日の高収入求人／急募中の好条件企業／かんたん30秒で完了） |
| FV直下 | 求人カード3枚（【未経験歓迎】電気工事スタッフ／【若手活躍中】電気工事士／【経験者優遇】電気工事士：タグ3つ・写真・年収レンジ・説明文）。**その上にモーダル**「電気工事士で転職なら！」＋「工事関連の経験はありますか？ いいえ／はい」の2択（背景は暗転） |
| STEP1〜7 | STEP ラベル＋トラック線＋クマがトラック上を進む進捗。①ご経験（6択・アイコン）②お持ちの資格（6択・イラスト）③いつ頃の求人（1/3/6/12ヶ月以内・いつでも。「急募多数」リボン）④ご希望の働き方（「年間休日120日以上／月収50万円以上の求人」見出し＋雇用形態4択・「オススメ」リボン）⑤郵便番号（「公開されません」鍵付き・「わからない場合はコチラ」で都道府県/市区町村 select）＋**「保有求人の一例」横スクロール8枚**⑥「対象住所付近の最新求人数：N件」＋お名前＋生まれ年（クマ吹き出し「給与情報などがより正確にわかります」）⑦「ご入力いただいた情報に当てはまる求人数：N件」＋携帯電話＋**オレンジ2行CTA「利用規約に同意の上／求人を探しにいく！」**（無効時は薄色）＋クマ吹き出し「◯◯様のお住まいの都道府県ではさらに多くの求人を保有しています」 |
| フッター | 黄色帯「YYYY/M/D 最新求人更新」／利用規約・会社概要・個人情報保護方針／© |
| 実装 | Next.js（Vercel）。選択肢・求人件数・住所は `api.mirai-agent.jp` から取得。画像は `/static/images/sp/entry/tp/0037/…` |

## 2. `denkikouji-nd/` に取り入れたもの／見送ったもの

ベースは本番 `denkikouji/`（フォームの質問・データ項目・GAS/Zoho 連携は不変。`__LP_ID="denkikouji-nd"` で Slack/シート/Zoho の LP 列に出る）。差分は `assets/css/cvr-boost-denkikouji-nd.css`（denkikouji の CSS の後に読む上書き）と HTML の構造だけ。

| 参考LPの要素 | 対応 | 備考 |
|---|---|---|
| 白ヘッダー（ブランド｜利用者数バッジ｜許可番号） | **採用** | 数字は確認済みの「34,513人」。参考の「年間230,000人」等は転記しない |
| ヒーロー下の3チップ | **採用**（ハローワーク非掲載の求人／完全無料・転職しなくてもOK／かんたん30秒で完了） | すべて既存の確認済み訴求。「年休120日」「急募」は当社実績が未確認なので使わない |
| 質問＋2択を白カード（モーダル相当）に | **採用**（`.nd-card`。背景暗転はしない） | オーバーレイ型は 5クラスのスクロール事故と相性が悪いのでインラインのまま |
| FV直下に求人カードが覗く | **採用**（FV のフルハイトをやめ、`lp-jobs` を CTA 直下 14px に） | 主力 `denkikouji/` は「初期画面はFVだけ」の方針。**この LP だけ**参考どおり覗かせる。データは既存の `lp-job-cards-denki.json`（`is_sample:true` の仮求人・要確認項目のまま） |
| 求人カードの意匠（青枠・タグ・年収主役） | **採用**（CSSのみ。`lp-job-cards.js` は不変） | 写真・説明文はデータに無いので出さない |
| STEP進捗のトラック線 | **採用**（ドットを線でつなぐ） | クマがトラック上を進む演出は見送り（クマは「次のCTAへ移動」が当社ルール） |
| 選択肢のイラストカード | 既存のまま | denkikouji は既に 54px アイコン・2列で参考と同等 |
| 郵便番号ステップの「保有求人の一例」横スクロール | **採用**（step04 都道府県で `lp-jobs` を横スクロール表示。`body:has(#step04.is-step-active)`） | 他のステップでは従来どおり非表示 |
| 「対象住所付近の最新求人数：N件」 | **見送り** | 都道府県別の実数が無い（未確認の数字は出さない） |
| 「急募多数」「オススメ」リボン | **見送り** | 根拠が無い |
| オレンジ2行CTA「利用規約に同意の上／…」 | **採用**（`::before` で1行目を足し、無効時はグレーのまま） | 文言は既存「あなたに合う求人を見る」 |
| 「◯◯様の…さらに多くの求人」吹き出し | **見送り** | 根拠が無い。既存の安心文（完全無料・職場に知られない）を維持 |
| 7ステップ化（時期・働き方の追加） | **見送り** | 質問を増やすとデータ項目と Zoho 連携が変わる。現行5ステップ（意欲→資格→経験→都道府県→氏名/生年→携帯）のまま |
| 黄色帯「最新求人更新 日付」 | **見送り** | 更新日の実体が無い |

ローカル確認（iPhone 13 相当）: `docs/assets/denkikouji-nd/`（fv / step01 / step04 / step06）。`e2e-lp-flow-local.mjs --lp /denkikouji-nd/` **19/19**、静的チェック全通過（form-invariants 133/133、asset-versions 整合、theme-lp.css ドリフトなし）。

## 3. 旧ドメイン依存の解消（新ドメインに置いても壊れないように）

| 依存 | `denkikouji/`（現状） | `denkikouji-nd/` |
|---|---|---|
| WPテーマ配信の画像19件（FV PC版・2択アイコン・資格アイコン・step03アイコン・クマ） | 旧ドメインの `wp-content/themes/…` | `assets/img/` に同梱（`自前LP/assets/img` から複製）。`../assets/img/…` 参照 |
| `/privacypolicy` | root-relative | `../privacypolicy/`（リポジトリ同梱） |
| `/terms` | root-relative（WP側ページ・リポジトリに無い） | **旧ドメインの絶対URL** `https://denkilp.builders-job.com/terms`。静的な利用規約ページを用意できたら差し替える（残課題） |
| thanks の遷移先 `app.js` の `THANKS_V2_PATH`（root-relative） | `/denki-lp-cvr/thanks-v2/` 固定 | `app.js` に `window.__THANKS_PATH` 上書きを追加し、`../thanks-v2/` を指定（同じ木の `thanks-v2/` へ相対で飛ぶ）。未設定のLPは従来どおり。**app.js は全ミラー同期＋ `?v20260906a` に全LP bump**（deploy.yml の期待値も更新） |
| canonical / og:url | 旧ドメイン固定（`sync-lp-canonical-urls.mjs`） | 当面は `/denki-lp-cvr/denkikouji-nd/`。新ドメイン決定後に §4 |
| og:image | WPテーマの `ogp.jpg` | `assets/img/first_banner0103.jpg`（絶対URLは当面旧ドメイン） |

## 4. 新ドメインが決まったらやること（残作業）

1. **ドメイン名と置き場所**（同じ Xserver の別ドメインか／別サーバーか／ドキュメントルート）をもらう。
2. `deploy.yml`: 新ドメイン向けの転送先 Secret と rsync ステップ追加（`.htaccess` は同梱されるのでそのまま効く）。同じ木を丸ごと置くなら `thanks-v2/` `privacypolicy/` `assets/` も一緒に届く。
3. `sync-lp-canonical-urls.mjs`: `denkikouji-nd` の canonical / og:url を新ドメインにする（ディレクトリ別 ORIGIN か SKIP 登録）。og:image の絶対URLも同様。
4. 利用規約: 静的 `terms/index.html` を用意するか、旧ドメインリンクのままにするかを決める。
5. GTM `GTM-KV525PZ` はそのまま動く。**Meta のドメイン認証・イベント設定を新ドメインでやり直す**。STG判定はパス文字列（`/denki-lp-cvr-stg/`）なので、新ドメインで本番テストするときは `?dk_test=1` を付ける。
6. GAS/Zoho は `_lp=denkikouji-nd` で分岐。追加設定なし（`_page` に新ドメインのURLが記録される）。

## 5. 確認方法（マージ前）

- STG: `https://denkilp.builders-job.com/denki-lp-cvr-stg/denkikouji-nd/` をスマホ実機（LINE/Instagram アプリ内ブラウザ含む）で、FV → 2択 → step01 → … → step06 → 送信（STGからの送信は無条件テスト扱い）まで。**クマが次のCTAへ移動すること**、step04 で求人例が横スクロールで出ること、step06 のCTAがオレンジ2行になること。
- 同じ STG で主力 `denkikouji/` `sekoukanri/` も一度通す（app.js の版が上がっているため）。挙動は変えていない（`__THANKS_PATH` 未設定時は従来パス）。
