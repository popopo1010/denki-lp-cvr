# Zoho CRM 連携セットアップ（LP送信 → 見込み客の自動作成）

LPフォーム送信を Zoho CRM の **見込み客(Leads)** に自動登録する。
コードは `gas-recorder/zoho.js`。`ZOHO_*` のスクリプトプロパティが未設定のあいだは
**連携は丸ごと無効**（スプレッドシート記録・Slack通知は従来どおり動く）ので、
先にデプロイしてから設定して問題ない。

## 1. Zoho 側で Self Client を作る（10分）

1. https://api-console.zoho.jp/ を開く（アカウントが `.com` なら https://api-console.zoho.com/）
2. **Self Client** → CREATE → CLIENT ID / CLIENT SECRET を控える
3. 同じ画面の **Generate Code** タブで発行する
   - Scope: `ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.READ,ZohoCRM.org.READ`
   - Time Duration: 10 minutes
   - Scope Description: 任意（例: LP lead sync）
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

- **新規送信**：`doPost` がスプシに追記した直後に見込み客を作成し、`zoho_lead_id` / `zoho_synced_at` を同じ行に書き戻す。
  失敗しても送信自体は成功扱いにし、理由を `zoho_error` に残して Slack のエラーチャンネルにも投げる。
- **テスト送信は除外**：`1111111111` のように同じ数字ばかりの電話番号、氏名が「ああ」等のプレースホルダーの行は送らない（`zoho_error` に `skipped: test_submission` と残る）。
- **取りこぼしの再送**：エディタから `backfillZohoLeads()` を実行すると、`zoho_lead_id` が空の行をまとめて登録する。
  **登録前に電話番号でZoho側を検索する**ので、何度実行しても重複しない。1回あたり最大80行（GASの6分制限対策）なので、残っていれば繰り返し実行する。

## 5. 項目の対応

| スプレッドシート | Zoho 見込み客 |
| --- | --- |
| your-last-name / your-first-name | 姓 / 名（＋求職者名 `field7` に姓名を連結） |
| your-tel | 電話番号（先頭0が落ちた10桁は 0 を補完） |
| your-pref / your-city / your-zip | 都道府県 / 市区町村 / 郵便番号（6桁は 0 を補完） |
| your-willingness | 転職時期 `field4`（今は情報収集したい→情報収集のみ／近いうちに転職したい→**3ヶ月以内**） |
| your-license01 | 電気保有資格 `field5`（複数保有なら**最上位の1つ**。単一選択項目のため） |
| — | 見込み客のデータ元＝`Advertisement` / ステータス＝`精査前` 固定 |
| LP名・送信日時・生年月日・資格の原文・経験・転職意欲・検索語・utm・LINE登録 | 詳細情報(Description) にまとめて記録 |

### 既知の制約（要判断）

- **生まれ年 `field` と 経験 `field1` はZohoのレイアウトから外れている**（API上 `type: "unused"`）。
  値を送っても Zoho 側に保存されないため、現状は Description に文字で残している。
  項目として使いたい場合は Zoho の「設定 → モジュールと項目 → 見込み客 → レイアウト」で
  この2項目をレイアウトに戻したうえで、`zoho.js` の `buildZohoLead()` に
  `lead.field = 生まれ年` / `lead.field1 = 経験` を足す。
- 「経験」を戻す場合、LPの選択肢 **未経験 / 設計・積算経験** はZohoのピックリストに無いので
  `その他` に寄せるか、ピックリストへ値を追加するかを決める必要がある。
- 「転職時期」の **近いうちに転職したい → 3ヶ月以内** は、Zoho側に対応する選択肢が無いための暫定マッピング。
  `近いうちに転職したい` をピックリストに追加すれば原文のまま入れられる。
- 見込み客のデータ元は既存ピックリストに LP 用の値が無いため `Advertisement` に固定している。
  `LP - denkikouji` のような値を追加すれば流入元をZoho上で切り分けられる。
