# Zoho CRM 連携セットアップ（LP送信 → 商談の自動作成）

LPフォーム送信を Zoho CRM の **商談(Deals)／パイプライン「求職者対応」** に自動登録する。
コードは `gas-recorder/zoho.js`。`ZOHO_*` のスクリプトプロパティが未設定のあいだは
**連携は丸ごと無効**（スプレッドシート記録・Slack通知は従来どおり動く）ので、
先にデプロイしてから設定して問題ない。

> **すでに見込み客(Leads)用のスコープでトークンを発行済みの場合は、作り直しが必要**。
> 商談を作る権限が無いため `OAUTH_SCOPE_MISMATCH` で失敗する。手順1をやり直して
> `ZOHO_REFRESH_TOKEN` を差し替えること（Client ID / Secret は使い回してよい）。

## 1. Zoho 側で Self Client を作る（10分）

1. https://api-console.zoho.jp/ を開く（アカウントが `.com` なら https://api-console.zoho.com/）
2. **Self Client** → CREATE → CLIENT ID / CLIENT SECRET を控える
3. 同じ画面の **Generate Code** タブで発行する
   - Scope: `ZohoCRM.modules.deals.CREATE,ZohoCRM.modules.deals.READ,ZohoCRM.modules.deals.UPDATE,ZohoCRM.settings.fields.READ,ZohoCRM.coql.READ,ZohoCRM.org.READ`
   - Time Duration: 10 minutes
   - Scope Description: 任意（例: LP deal sync）

   > `coql.READ` は電話番号での重複チェック、`settings.fields.READ` は選択肢の自動追従、
   > `deals.UPDATE` は `resyncZohoDealFields()` に必要。どれか欠けるとその機能だけ失敗する。
4. 表示された **grant code** を、10分以内に次のコマンドでリフレッシュトークンに交換する

```bash
curl -X POST "https://accounts.zoho.jp/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=＜CLIENT ID＞" \
  -d "client_secret=＜CLIENT SECRET＞" \
  -d "code=＜grant code＞"
```

返ってきた JSON の `refresh_token`（`1000.xxxx...`）を控える。**これは無期限**なので二度と発行し直さなくてよい。

> **データセンターに注意**：URLのドメインは Zoho にログインしたときのアドレスに合わせる。
> `crm.zoho.jp` なら `accounts.zoho.jp` / `www.zohoapis.jp`、
> `crm.zoho.com` なら `accounts.zoho.com` / `www.zohoapis.com`。
> ここを間違えると `invalid_code` になる。

## 2. Apps Script にプロパティを設定

Apps Script エディタ → ⚙️ プロジェクトの設定 → スクリプト プロパティ

| プロパティ | 値 | 必須 |
| --- | --- | --- |
| `ZOHO_CLIENT_ID` | Self Client の Client ID | ○ |
| `ZOHO_CLIENT_SECRET` | Self Client の Client Secret | ○ |
| `ZOHO_REFRESH_TOKEN` | 手順1で取得した refresh_token | ○ |
| `ZOHO_ACCOUNTS_HOST` | 既定 `https://accounts.zoho.jp`。`.com` 環境なら変更 | |
| `ZOHO_API_HOST` | 既定 `https://www.zohoapis.jp`。`.com` 環境なら変更 | |

## 3. 疎通確認

エディタで `testZohoConnection` を実行 → `ok: ＜組織名＞` が返ればOK。
`invalid_client` / `invalid_code` が出たらデータセンター（`.jp` / `.com`）の取り違えを疑う。

## 4. 動作

連携先は **商談(Deals)／パイプライン「求職者対応」／ステージ「01_新規リード」**。
営業チームの運用が Deals で回っているため、見込み客(Leads)ではなく商談として作る。

- **新規送信**：`doPost` がスプシに追記した直後に商談を作成し、`zoho_deal_id` / `zoho_synced_at` を同じ行に書き戻す。
  失敗しても送信自体は成功扱いにし、理由を `zoho_error` に残して Slack のエラーチャンネルにも投げる。
- **重複しない**：作成前に**電話番号でZoho側を検索**し、既に商談があればIDを紐付けるだけで新規作成しない。
  営業が手で作った商談とぶつからない。
- **LINE登録・メール登録の後追い反映**：`_event=line_click` / `email_capture` が後から届いたら、
  紐づく商談の LP情報・メールアドレスを更新する（`updateZohoDealFromRow`）。
  **ステージ等の営業運用項目は送らない**。商談が未連携の行では何もしない。
- **テスト送信は除外**：次のいずれかに当てはまる行は送らない（`zoho_error` に `skipped: test_submission` と残る）。
  - 同じ数字ばかりの電話番号（`1111111111` / `09000000000` など、使われている数字が3種類未満）
  - **一方向に6桁以上つながる連番**（`09012345678` など）。
    ※ `09012123159` のような往復パターンは実在の番号なので除外しない
  - 氏名がプレースホルダー（`ああ` / `山田太郎` / `名前なし` / `匿名` / `テスト` など）
- **トークン失効時の自動リトライ**：キャッシュ中のアクセストークンが無効化されていた場合、
  401を受けたら一度だけ取り直して再試行する。
- **取りこぼしの再送**：エディタから `backfillZohoDeals()` を実行すると、`zoho_deal_id` が空の行をまとめて処理する。
  1回あたり最大80行（GASの6分制限対策）なので、残っていれば繰り返し実行する。
  - 2026-05-20〜07-27 のLP送信は既に商談化済み（既存288件＋2026-07-27に手動投入16件）。
    初回の `backfillZohoDeals()` はほぼ全行が「既存に紐付け」になり、新規作成はされない。
- **Zoho側の選択肢を足したあとの追いつき**：`resyncZohoDealFields()` を実行すると、連携済みの行を
  今のマッピングで上書きし直す。1回あたり最大150行。**ステージ・商談名・パイプラインは送らない**（営業の運用を壊さないため）。

## 5. 項目の対応

| スプレッドシート | Zoho 商談 |
| --- | --- |
| 姓＋名 | 商談名（`姓名/資格` 形式。既存の命名に合わせる）＋ 求職者名 `name_EU` |
| your-tel | 電話番号 `m_phone_number`（先頭0が落ちた10桁は 0 を補完） |
| your-license01 | 保有資格 `shikaku`（**複数選択**。原文は `shikaku_sonota` にも保存） |
| your-pref / your-city / your-zip | 都道府県 `area` / 市区町村 `shikuchoson` / 郵便番号 `No_yubin` |
| your-birthday | 生年月日 `date_seinengappi` |
| your-email | メールアドレス `email_main` |
| _received_at | 求職者登録日 `date_EuRegsiter` |
| utm一式（無ければ`_page`のURLから復元） | マーケティングチャネル `marketing_channel` … 下記参照 |
| LP名・送信日時・経験・転職意欲・検索語・utm・LINE登録 | LP情報 `lp_info` にまとめて記録 |
| — | パイプライン＝`求職者対応` / ステージ＝`01_新規リード` 固定 |

### マーケティングチャネルの中身

「どこから来て、どのKW/クリエイティブで刺さったか」が1行で読める形にしている。

```
google/cpc｜014_denki_top_of_page｜KW: 電気 工事 士 年収 (phrase_match)
ig/paid｜120248499798320789｜CR: denkovlog
denkikouji｜自然流入
```

- 検索広告（google / yahoo / medium=cpc）は **KW**、SNS広告は **クリエイティブ** を出す
- 個別列（utm_source 等）が空でも **`_page` のURLから読み直す**。
  utm_* の個別列は2026-07に追加したもので、それ以前の行は列が空・URLにだけ情報があるため
- 実データ343行で検証：検索KW 180件 / クリエイティブ 145件 / 自然流入 18件

**Metaの広告セットIDはLPのURLに入ってこない**（`utm_id` はキャンペーンIDと同値）。
広告セット単位で見たい場合は、広告側のリンクURLに `{{adset.id}}` を持つパラメータを足す必要がある。

### 保有資格のマッピング

| LPの選択肢 | Zohoの選択肢 |
| --- | --- |
| 第一種電気工事士 | 第1種電気工事士 |
| 第二種電気工事士 | 第2種電気工事士 |
| 電気施工管理 1級 | 1級電気工事施工管理技士 |
| 電気施工管理 2級 | 2級電気工事施工管理技士 |
| 電気主任技術者 | 第3種電気主任技術者 |
| その他の資格 | その他 |
| （未選択） | 資格無し |

### ハマりどころ（触るとき必読）

- **Stage は表示名と内部値がズレている**。`01_新規リード` の内部値は `求職者の見極め` だが、
  **APIには表示名 `01_新規リード` を渡す**と通る。内部値を渡すと `MAPPING_MISMATCH` で弾かれる。
- **Pipeline と Stage の組み合わせ**が合わないと `MAPPING_MISMATCH`。
  求職者対応パイプラインのステージは Standard レイアウト側に定義されている。
- 項目メタデータは実行時に読んで（6時間キャッシュ）、**実在する選択肢だけ**を送る。
  Zoho画面で選択肢を追加すれば、コードを変えずに使われ始める。

## 6. Zoho画面でやると良いこと（任意・コード変更不要）

- **都道府県 `area` に無い表記**（海外表記や空欄）はそのまま送られず空になる。必要なら選択肢を追加する。
- **保有資格に無い資格**が増えたら `shikaku` に選択肢を追加し、`zoho.js` の `ZOHO_SHIKAKU_MAP` にも対応表を足す。

実施後に **`resyncZohoDealFields()`** を実行すると、既存の商談も新しいマッピングで埋め直される。
※ 項目メタデータは6時間キャッシュのため、変更直後に反映したい場合は時間を置くか再デプロイする。
