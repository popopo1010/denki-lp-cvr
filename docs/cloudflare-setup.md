# Cloudflare を前段に置く手順（2026-09-04 起案）

主力LPの速度はコード側で床に着いた（`docs/qa-2026-09-04.md`）。残る本命は Xserver までの距離と往復
（TTFB・TLS・HTTP/1.1〜2）で、それを一番安く縮めるのが Cloudflare 無料プランの前段配置。
**段階ごとに戻せる**順で進める。各段階の「確認」を通るまで次へ進まない。

リポジトリ側の準備は入っている（Secret 未設定のあいだは何も動かない）:

| 何 | どこ | 動く条件 |
|---|---|---|
| デプロイ後に HTML/JSON をエッジからパージ | `deploy.yml` → `scripts/cloudflare-purge.sh` | Secret `CF_ZONE_ID` `CF_API_TOKEN` がある時だけ |
| STG検証で `server` / `cf-cache-status` / `content-encoding` を表示 | `deploy.yml` Verify staging | 常時 |
| ランナーから本番/STG のヘッダと HTTP 版を出す | `probe-status.yml`（手動実行可） | 常時 |

---

## 段階0: 測る（DNSは触らない・10分）

1. PageSpeed Insights で `https://denkilp.builders-job.com/denki-lp-cvr/denkikouji/` を開き、
   **「実際のユーザー環境」タブの TTFB** を控える（これが日本のユーザーの実測）。
2. WebPageTest（Tokyo, 4G）で同URLを1回。TTFB と「最初のバイトまでの内訳」（DNS/TLS/待ち）を控える。
3. `Probe site status` を手動実行し、`http/1.1` か `http/2` か、`content-encoding` が出ているかを控える。

判断: 実測 TTFB が **800ms 未満**なら、段階1の効果は HTTP/3 とアセットのエッジ配信ぶん（体感は小さめ）。
それでも段階1は副作用がほぼ無いので進めてよいが、段階2（HTML のエッジキャッシュ）は急がない。
**800ms 以上**なら本命。段階1→2 まで進める。

---

## 段階1: プロキシ化（キャッシュ方針は origin 尊重のまま）

得られるもの: 東京/大阪エッジでの TLS 終端・HTTP/3・brotli、`?v=` 付きアセット（immutable）のエッジ配信。
HTML は origin の `no-cache` をそのまま尊重するので**エッジには乗らない**（＝古いHTML事故は起きない）。

### 1-0. 切替前に Xserver 側を確認する（ここを飛ばすと切替の瞬間に全ページ 403 になり得る）

- Xserver サーバーパネル → **WAF設定 / 国外IPアクセス制限 / IPアクセス制限** を見る。Cloudflare 経由の
  origin への接続元は Cloudflare のエッジ IP（日本以外のこともある）になるため、サイト全体や
  `/denki-lp-cvr/` に国外IP制限が掛かっていると、切替直後から**広告の着地も PSI も Cloudflare 越しで 403** になる
  （手順書「サイトが403になったとき」の PSI 403 と同じ仕組み）。掛かっていたら切替前に OFF にし、
  必要なら Cloudflare 側の WAF（`/wp-login.php` を日本以外から遮断）へ移す。
- WordPress セキュリティ設定（ダッシュボード・XML-RPC・REST API の国外IP制限）は管理画面ログインにだけ効く。
  切替後にログインできなければここ。

### 1-1. Cloudflare 側

1. Cloudflare にサイト `builders-job.com` を追加（Free）。DNS レコードは自動インポートされる。
   **全レコードを見比べて**、Xserver 側のゾーンと1件ずつ一致していることを確認する（MX・TXT(SPF/DKIM)・
   サブドメイン。1件でも落ちるとメールや他サービスが止まる）。
2. プロキシ（オレンジ雲）を **`denkilp` のAレコードだけ ON** にする。他はグレー雲のまま。
3. SSL/TLS: **Full (strict)**（Xserver の Let's Encrypt 証明書をそのまま使う）。「Always Use HTTPS」ON。
4. Speed → Optimization: **Rocket Loader OFF / Auto Minify 全OFF / Email Address Obfuscation OFF**。
   理由: これらは HTML/JS を書き換える。GTM の遅延読み込み、`app.js` の defer 順、フォームの自己修復
   （DOM差し替え検知）が壊れる。Brotli ON、HTTP/3 ON、0-RTT ON、Early Hints ON は可。
   さらに Security の **Bot Fight Mode OFF**、**「I'm Under Attack」モード OFF**、Security Level は Medium 以下。
   これらは Google / Meta の広告審査クローラー（AdsBot・facebookexternalhit 等）を JS チャレンジで弾き、
   「LPに到達できない」＝広告不承認・品質スコア低下の原因になる。ドメイン・URL は変わらないので
   品質スコアやピクセルの学習は引き継がれるが、クローラーを止めた瞬間にそれが崩れる。
5. Caching → Configuration: Caching Level は Standard、Browser Cache TTL は **Respect Existing Headers**。
6. Cache Rules に「**バイパス**」を1つ: ホスト `denkilp.builders-job.com` かつ
   パスが `/wp-admin*` `/wp-login.php` `/wp-json*` `/xmlrpc.php` `/denki-lp-cvr-stg/*` のいずれか、
   または Cookie に `wordpress_logged_in` を含む → Bypass cache。
   （STG は `X-Robots-Tag: noindex` を必ず origin から通すため、最初から外しておく）
7. レジストラ（Xserver ドメイン）でネームサーバーを Cloudflare に切り替える。切替前に **現在のネームサーバー名を控える**（戻し先）。

### 1-2. Xserver 側

- WordPress セキュリティ設定の「国外IPアクセス制限」「ログイン試行回数制限」は、Cloudflare 経由だと
  接続元がエッジの IP になる。管理画面ログインが弾かれたら一時的に無効化し、代わりに Cloudflare の
  WAF ルール（`/wp-login.php` を日本以外から遮断）へ移す。
- 独自SSL の自動更新（Let's Encrypt）が Cloudflare 経由でも通ることを、次回更新日に確認する。
  通らなければ Cloudflare Origin CA 証明書へ切り替える（Full(strict) のまま使える）。

### 1-3. 確認（すべて通るまで段階2へ行かない）

1. `Probe site status` を手動実行。本番・STG の `server: cloudflare`、`http/3`（または `http/2`）、
   `content-encoding: br` を確認。アセット行は `cf-cache-status: HIT`（2回目以降）、HTML 行は
   `DYNAMIC` または `BYPASS`（＝origin の no-cache を尊重している）であること。
2. 作業ブランチを `staging` へ push → STG のスマホ実機（LINE / Instagram アプリ内ブラウザ含む）で
   FV表示 → 選択 → クマ移動 → step06 まで → **`?dk_test=1` 無しでも STG は自動でテスト扱い**なので
   そのまま送信 → Slack に【テスト送信】が届く。
3. WordPress 管理画面にログインできる。`/privacypolicy` `/terms` が開く（`Probe site status` の PP 行）。
4. GTM Preview で `lead_conversion_test` が STG で流れる。
5. 24時間おいて PSI の「実際のユーザー環境」TTFB を再確認。

### 1-4. 戻し方

- Cloudflare ダッシュボードで `denkilp` の雲をグレーにする（数分で直結に戻る）。
- それでも駄目ならレジストラのネームサーバーを控えておいた Xserver のものに戻す（伝播に最長数時間）。

---

## 段階2: HTML もエッジに乗せる（本命の TTFB 短縮）

前提: 段階1の確認がすべて通っている。**deploy.yml のパージが動くことを STG で先に確かめる**。

1. GitHub Secrets に `CF_ZONE_ID`（Cloudflare の Overview 右下）と `CF_API_TOKEN` を登録。
   トークンは **Zone → Cache Purge → Purge、対象ゾーンは builders-job.com のみ**。他の権限は付けない。
2. 作業ブランチを `staging` へ push し、Actions ログに
   `Purge Cloudflare edge cache` ステップが出て `purged N / failed 0` になることを確認する
   （STG 配下は段階1でバイパスしているので、この時点でエッジに何も乗っていなくても purge 自体は成功する）。
3. Cache Rules に「**HTML をエッジにキャッシュ**」を追加: ホスト `denkilp.builders-job.com` かつ
   パス `/denki-lp-cvr/*` かつ `/denki-lp-cvr-stg/` を含まない →
   Eligible for cache、**Edge TTL: 10分（Override origin）**、**Browser TTL: Respect origin**。
   ブラウザ側は今までどおり `no-cache`（LINE アプリ内ブラウザが古いHTMLを掴む事故を防ぐ）。
4. Page Rules（無料3本）に `denkilp.builders-job.com/denki-lp-cvr/*` → **Cache Level: Ignore Query String**。
   広告の `?utm_*` `?dk_test=1` ごとに別キャッシュにならないようにする。LP は query を JS が
   `location.search` から読むだけで HTML の中身は変わらないので安全。
5. `main` へマージ（本番デプロイ）→ Actions の `Purge Cloudflare edge cache` が `failed 0`、
   `Verify deployment` の `?v=` 検証が1回目で通ること。

### 確認

- `Probe site status` で本番 HTML 行が `cf-cache-status: HIT`（2回目以降）。
- デプロイ直後に本番 HTML を開き、新しい `?v=` になっている（パージが効いている）。
- PSI（ラボ・実測）の TTFB が下がっている。

### 戻し方

- 段階2の Cache Rule を無効化すれば、HTML は即 origin 尊重（no-cache）に戻る。パージ不要。

---

## 広告媒体（Meta / Google）の観点で守ること

ドメイン・URL・HTML の中身は変わらないので、品質スコア（Google）・ドメイン認証とピクセルの学習（Meta）・
検索評価はそのまま引き継がれる。崩れるのは次の3つだけなので、ここだけ守る。

| 守ること | 理由 | どこで |
|---|---|---|
| **審査クローラーを弾かない**（Bot Fight Mode OFF / Under Attack OFF / Security Level Medium 以下 / WAF に「Verified Bots を許可」） | Google の AdsBot・Meta の facebookexternalhit がチャレンジで止まると「リンク先が機能していない」＝広告不承認・配信停止・品質スコア低下 | 段階1 の 1-1 |
| **DNS の TXT を1件も落とさない**（Meta ドメイン認証・Google サイト確認・Search Console・SPF/DKIM/DMARC） | 落ちると Meta のドメイン認証が外れて配信設定が触れなくなる、メールが届かなくなる | 段階1 の DNS 突合 |
| **`?utm_*` `?gclid` `?fbclid` `?dk_test=1` 付きでも同じ HTML が返る**（段階2 の Ignore Query String はそのために入れる。LP は query を JS で読むだけ） | 媒体の計測パラメータで別キャッシュ・別内容にならない。`dk_test=1` の本番テスト判定も JS 側なので影響なし | 段階2 |

さらに、媒体が見る「ランディングページの速度」は実ユーザーの計測（CrUX）なので、TTFB が下がれば
Google 広告の「ランディングページの利便性」には良い方向にしか働かない。STG（`-stg/`）は noindex を維持し、
**広告のリンク先には絶対に使わない**（既存ルールどおり）。

## やらないこと・注意

- **Xserver は残る**。Cloudflare 無料プランは前段の中継とキャッシュで、ファイルの置き場ではない。LP本体・WordPress・rsync デプロイは今までどおり Xserver。外せるのは段階3で LP を静的ホストへ移し、かつ WordPress をやめる/移す場合だけ。
- **ドメイン・URL は1文字も変えない**。広告の品質スコア（Google）・ドメイン認証とピクセル学習（Meta）・検索評価は URL 単位で蓄積されており、変えるとゼロから。Cloudflare 方式は経路だけが変わるので蓄積は残る。

- **ドメイン変更**（広告URL・計測・Cookie が全部動く）。
- **Rocket Loader / Auto Minify / Email Obfuscation を ON**（上記のとおり JS 順序とフォームを壊す）。
- **STG をエッジキャッシュ**（noindex を通す必要・実機確認は常に最新を見たい）。
- `booking-slots.json` は origin が `no-cache` で5分同期がある。段階2の Cache Rule は `*.html` だけに
  効くよう、パス条件を `/denki-lp-cvr/*` にしたうえで Browser TTL を origin 尊重にしている。
  もし JSON が HIT になっていたら、パス条件に `not ends with .json` を足す。
- パージが失敗すると旧 HTML が最長10分残る。`deploy.yml` は warning を出して止めない
  （デプロイ自体は済んでいるため）。`Verify deployment` の `?v=` 検証（最大90秒リトライ）で気づける。
- 段階3（Cloudflare Pages に LP を移す）は、段階2の後で origin がまだボトルネックの場合だけ検討する。
