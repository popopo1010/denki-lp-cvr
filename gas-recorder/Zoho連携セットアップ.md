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
  - 2026-05-20〜07-26 の303件は先に Zoho API で登録済み。この303行はまだ `zoho_lead_id` が空なので、
    初回の `backfillZohoLeads()` は「既存に紐付け」としてIDを書き戻すだけになる（新規作成はされない）。
- **Zoho側の項目を整えたあとの追いつき**：`resyncZohoLeadFields()` を実行すると、連携済みの行を
  今のマッピングで上書きし直す。1回あたり最大150行。見込み客ステータスは営業運用中のため送らない。

## 5. 項目の対応

| スプレッドシート | Zoho 見込み客 |
| --- | --- |
| your-last-name / your-first-name | 姓 / 名（＋求職者名 `field7` に姓名を連結） |
| your-tel | 電話番号（先頭0が落ちた10桁は 0 を補完） |
| your-pref / your-city / your-zip | 都道府県 / 市区町村 / 郵便番号（6桁は 0 を補完） |
| your-birthday-year | 生まれ年 `field`（※下記の理由で現状は未使用） |
| your-experience | 経験 `field1`（※同上） |
| your-willingness | 転職時期 `field4` |
| your-license01 | 電気保有資格 `field5`（複数保有なら**最上位の1つ**。単一選択項目のため） |
| _lp | 見込み客のデータ元（`LP - <LP名>` があればそれ、無ければ `Advertisement`） |
| — | 見込み客ステータス＝`精査前` 固定 |
| LP名・送信日時・生年月日・資格の原文・経験・転職意欲・検索語・utm・LINE登録 | 詳細情報(Description) にまとめて記録 |

**項目メタデータに自動追従する**：`zoho.js` は送信のたびに Leads の項目定義を読み（6時間キャッシュ）、
**実際に使える項目・実在する選択肢だけ**を詰める。したがって下の「Zoho画面でやると良いこと」を
実施すれば、**コードを一切変えずに**その項目が埋まり始める。

## 6. Zoho画面でやると良いこと（任意・コード変更不要）

APIからは項目のレイアウト復帰もピックリスト値の追加もできないため、ここだけはZoho画面での操作が必要。
やらなくても連携は動く（該当項目が空のままになるだけ）。

1. **生まれ年・経験をレイアウトに戻す**
   設定 → モジュールと項目 → 見込み客 → レイアウト で、未使用項目の **生まれ年** と **経験** を
   フォームにドラッグして保存。→ 以後の送信で自動的に入る。
   （現状この2項目は API 上 `type: "unused"` で、送っても保存されない）
2. **経験の選択肢に「未経験」「設計・積算経験」を追加**
   LPには この2つの回答があるが Zoho 側に選択肢が無く、現状は `その他` に寄せている。
3. **転職時期の選択肢に「近いうちに転職したい」を追加**
   LPの選択肢は「近いうちに転職したい／今は情報収集したい」の2つだけ。
   現状は前者を `3ヶ月以内`、後者を `情報収集のみ` に寄せている（前者は根拠のない暫定マッピング）。
4. **見込み客のデータ元に `LP - denkikouji` / `LP - denkikouji-v2` / `LP - sekoukanri` を追加**
   → LP単位で流入を切り分けられる。追加しなければ全件 `Advertisement` のまま。

1〜4のどれかを実施したら、Apps Script から **`resyncZohoLeadFields()`** を実行する。
既に登録済みの見込み客も新しいマッピングで埋め直される（最大150行ずつ）。
※ 項目メタデータは6時間キャッシュしているため、変更直後に反映したい場合は
`CacheService` の期限切れを待つか、Apps Script を再デプロイする。
