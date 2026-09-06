# 新ドメイン向け電気工事士LP（参考: denko-mirai.com/lp01）— 着手前メモ（2026-09-06）

依頼: 「新規ドメインで、https://denko-mirai.com/lp01（デンコウミライエージェントのFB広告LP）を参考に、いまのLPをアップデートしてほしい」

現在地: **①設計メモのみブランチに push 済み。HTML/CSS/JS は未着手。PR未作成・STG未反映・本番は旧版のまま。**

## 0. 止まっている理由（オーナーに必要なインプット）

| # | 足りないもの | 何が困るか | もらい方 |
|---|---|---|---|
| 1 | **参考LPの中身** | 作業環境のネットワークポリシーで `denko-mirai.com` / `denko.mirai-agent.jp` / archive.org / 各種ミラー / Octoparse（未認証）がすべて遮断され、1バイトも読めない。Slack・Notion・Drive・Gmail にも共有なし。見えないものを「参考に」すると、構成もコピーも想像で作ることになる | スマホでページ全体のスクショ（FV〜フッターまで数枚）を Slack に貼る、または PC で「ページのソースを保存」した HTML をリポジトリの `docs/assets/` か Slack に置く。**どのセクション／訴求を取り入れたいか**（例: FVの見せ方・求人条件の出し方・フォームの質問数）を一言添えてもらえると精度が上がる |
| 2 | **新ドメイン名とホスティング** | canonical / og:url / thanks への遷移先 / デプロイ先 / GTM・Meta のドメイン設定がすべてこれで決まる | ドメイン名（例: `example.com`）と、置き場所（a. 同じ Xserver アカウントの別ドメイン、b. 別サーバー、c. 旧ドメインのサブディレクトリではない）。Xserver なら新ドメインのドキュメントルートのパス |
| 3 | 送客媒体と計測 | FB(Meta) CPM 前提なら、Meta のドメイン認証・イベント設定を新ドメインでやり直す必要がある。GTM を同じコンテナで使うか | 「Meta のみ」「Google も」／GTM は既存 `GTM-KV525PZ` を使うか新コンテナか |
| 4 | thanks の扱い | 新ドメインに `thanks-v2` も置くか、旧ドメインの `thanks-v2` へ飛ばすか（後者は CV 計測がクロスドメインになる） | どちらか |

参考LPについて検索エンジンのスニペットから分かったのは「デンコウミライエージェント（本体サイト `denko.mirai-agent.jp`）の広告用LP」「電気系技術者向け・待遇/福利厚生・教育制度を訴求」程度で、ページ構成・フォーム・数字は不明。

## 1. 新ドメインで動かすときに外す必要がある旧ドメイン依存（棚卸し済み）

対象は主力 `denkikouji/index.html` + `steps-lazy.html` + `assets/js/app.js` のスタック。**旧ドメイン `denkilp.builders-job.com` が消えても／新ドメイン単体でも壊れないこと**を目標にする。

| 依存 | 現状 | 新ドメインでの対処 |
|---|---|---|
| canonical / `og:url` | 旧ドメイン固定。`scripts/sync-lp-canonical-urls.mjs` が `ORIGIN` 定数で毎デプロイ上書きする | 新LPディレクトリを `SKIP_DIR_RE` に足すか、`ORIGIN` をディレクトリ別に持てるようにする（そうしないとデプロイのたび旧ドメインに戻る） |
| `og:image` | 旧ドメインの WP テーマ `assets/ogp/ogp.jpg`（リポジトリ内に無い） | 画像を `assets/img/` に持ち込み、新ドメインの絶対URLで指す |
| FV画像PC版・2択アイコン・資格アイコン・step03 アイコン・クマ `follower_icon.svg` | **19ファイルが旧ドメインの WP テーマから配信**（`wp-content/themes/original-thema/assets/img/…`）。同名ファイルは `自前LP/assets/img/` に全部ある | `assets/img/` へコピーして `../assets/img/…` の相対参照に切替（`check-local-refs.mjs` が参照切れを見張る） |
| `/privacypolicy` `/terms` の root-relative リンク（index 2箇所 + steps-lazy 1箇所ずつ） | `privacypolicy/` はリポジトリにあるが、**`/terms` は WP 側のページでリポジトリに無い** → 新ドメインでは 404 | 利用規約ページを静的に用意する（`terms/index.html` 新規）か、旧ドメインの絶対URLへ。step06 の同意文リンクは CVR 直結なので 404 は不可 |
| `../service/denkikouji/` | 相対。`service/` はデプロイ対象 | そのままで可 |
| `app.js` の `THANKS_V2_PATH = "/denki-lp-cvr/thanks-v2/"` | **root-relative**。新ドメインが `/denki-lp-cvr/` 配下でなければ送信後に 404 | `thanks-v2` を新ドメインにも置くなら、`location.pathname` から `<LP dir>/../thanks-v2/` を組み立てる相対解決に変える（`nenshu-shindan-v2` は既に相対解決している。同じ書き方）。旧ドメインの thanks へ飛ばすなら絶対URL＋クロスドメイン計測の設定 |
| `app.js` / GAS の STG 判定 `"/denki-lp-cvr-stg/"` | パス文字列依存（`app.js` 1255行・`gas-recorder/コード.js` 712行・`zoho.js` 283行） | 新ドメインの STG をどう作るかに合わせて判定を追加（STG が無いなら本番テストは `?dk_test=1` 運用で足りる） |
| GTM `GTM-KV525PZ` | 全211箇所同一 | タグ自体は新ドメインでも動く。GTM 側でホスト名条件のトリガー／CV があれば追加。**Meta のドメイン認証・イベント優先度は新ドメインで別途必要** |
| GAS / Zapier / Slack / Zoho | `_page`=送信時URL、`_lp`=`window.__LP_ID` で分岐。ホスト名は見ていない | 新LPに固有の `__LP_ID`（例 `denkikouji-nd`）を与えれば、シート／Slack／Zoho の LP 列にそのまま出る。GAS の変更は不要 |
| デプロイ（`deploy.yml`） | rsync 先は `XSERVER_DEPLOY_PATH` の1本（main=本番 / staging=STG） | 同じ Xserver なら Secret `XSERVER_DEPLOY_PATH_<新ドメイン>` を足して転送ステップを1つ増やす。別サーバーなら別ワークフロー。`.htaccess`（HTML no-cache / JS·CSS immutable / gzip）はディレクトリごと同梱されるので新ドメインでも効く |
| `deploy/wp-legacy-url-map.json` の 301 | 旧 WP URL → 静的LP | 新ドメインには不要 |
| `theme-lp.css` / `cvr-boost-denkikouji.css` / `app.js` / `lp-job-cards.js` | すべて相対参照・旧ドメイン依存ゼロ（`?v=` 管理） | そのまま共有できる。**CSS/JS を新LP専用に変えるなら別ファイルにして主力LPを巻き込まない** |
| 自動チェック | `check-form-invariants.mjs` は `your-tel` を持つページを自動で対象化、`check-local-refs` / `check-asset-versions` / `check-banned-copy` / `check-kuma-anchor` も自動 | 新ディレクトリを足すだけで番人が付く。`sync-lp-canonical-urls` だけ上記の例外登録が要る |

## 2. 進め方（インプットが揃ったら）

1. **ドメイン非依存版を先に作る**（参考LPの中身に依存しない）: `denkikouji/` を複製して新ディレクトリ（仮 `denkikouji-nd/`・`__LP_ID` 別）を作り、§1 の依存を全部外す。旧ドメインの STG（`git push -f origin <branch>:staging`）でスマホ実機（LINE/Instagram アプリ内ブラウザ含む）を通す。ここまでで「新ドメインに置けば動くLP」ができる。
2. **参考LPの構成を反映する**: もらったスクショ／HTMLからセクション構成・訴求・フォーム設計を書き起こし、`LP作成リファレンス.md` §2.7 のファンダメンタルズチェックで当社ルール（禁止コピー「営業」「電話」予告／数字は要確認扱い／クマ移動・スクロール5クラス）に照らしてから HTML に落とす。数字・実績・社名は参考LPのものを**転記しない**（要確認項目）。
3. **新ドメインの配信経路**: `deploy.yml` の転送先追加、canonical の例外、Meta ドメイン認証／GTM 設定。デプロイ後の Verify に新ドメインURLを足す。
4. STG 実機 → PR → main（本番デプロイは main マージでのみ起動。明示の許可なくマージしない）。

## 3. やらないと決めたこと

- 参考LPが見えない状態で「それっぽい」LPを作ること（想像で作ると、参考にした意味がなく、オーナー確認の往復が増える）。
- 新ドメイン名が決まる前に canonical / thanks 先 / デプロイ先を仮置きすること（仮置きは `sync-lp-canonical-urls` に上書きされるか、本番に仮URLが出る）。
