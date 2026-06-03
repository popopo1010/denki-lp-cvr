# BOOKING_STAFF_JSON 設定手順（柴山・林・福山・山田）

予約の空きマージと担当割当に使います。**GASの画面操作だけ**で完結します。

---

## 前提

- GASは **`yuki.shibayama@xchange-inc.com`** で動いています
- 各担当の Googleカレンダーを、このアカウントに **「予定の変更権限」以上で共有** してください

---

## 手順（15分）

### Step 1 — カレンダーを共有（各担当）

各担当者に依頼:

1. Googleカレンダー → 設定 → 対象カレンダー → **共有**
2. `yuki.shibayama@xchange-inc.com` を追加
3. 権限: **予定の変更権限**（または「変更および共有の管理権限」）

### Step 2 — GASエディタを開く

https://script.google.com/home/projects/1PLdit_rSh-OaParVho8E-DhBFZz4lqSa7ZF6EFsLBzncs5uERinNFUl2/edit

### Step 3 — 見えるカレンダー一覧を出す

1. 上の関数プルダウンで **`listAccessibleBookingCalendars`** を選択
2. **実行** → 初回はカレンダー権限を許可
3. **実行ログ**（表示 → ログ）に `calendars` 配列が出る
4. `calendar_name` と `calendar_id` をメモ（林・福山・山田に対応する行を探す）

`calendar_id` の例:

- `xxxx@xchange-inc.com`（メール形式）
- `xxxxxxxx@group.calendar.google.com`（グループカレンダー）

### Step 4 — スクリプトプロパティを登録

1. 左メニュー **プロジェクトの設定**（歯車）
2. **スクリプトプロパティ** → **プロパティを追加**
3. 次を設定:

| プロパティ | 値 |
|------------|-----|
| 名前 | `BOOKING_STAFF_JSON` |
| 値 | 下のJSONを **1行** で貼る（改行なし） |

**テンプレ（`calendar_id` を Step 3 の値に差し替え）:**

```json
[{"id":"shibayama","name":"柴山","calendar_id":"yuki.shibayama@xchange-inc.com"},{"id":"hayashi","name":"林","calendar_id":"ここに林のID"},{"id":"fukuyama","name":"福山","calendar_id":"ここに福山のID"},{"id":"yamada","name":"山田","calendar_id":"ここに山田のID"}]
```

Slackメンションも使う場合は `slack_user_id` を追加（後述）。

4. **保存**

### Step 5 — 動作確認

1. 関数 **`getBookingStaffInfo`** を実行 → ログに `staff` が4人分出るか確認
2. 関数 **`warmBookingSlotsCache`** を実行（空き枠キャッシュ更新）
3. サンクス `thanks-v2` で枠が表示されるか確認
4. テスト予約は **`testBookSlot`**（本番カレンダーに1件入るので注意）

---

## 1人だけ先に足す場合

林だけ追加する例:

```json
[{"id":"shibayama","name":"柴山","calendar_id":"yuki.shibayama@xchange-inc.com"},{"id":"hayashi","name":"林","calendar_id":"林のcalendar_id"}]
```

無効な `calendar_id` の担当は **自動スキップ** されます。

---

## Slackメンション（任意・予約スレッド返信用）

各担当の Slack User ID（`U01234...`）を調べ、JSONに追加:

```json
{"id":"hayashi","name":"林","calendar_id":"...","slack_user_id":"U0123456789"}
```

`SLACK_BOT_TOKEN` / `SLACK_LEAD_CHANNEL_ID` / `SLACK_MENTION_CA` も別途必要（`gas-recorder/独自予約セットアップ.md` §Slack）。

---

## うまくいかないとき

| 症状 | 対処 |
|------|------|
| ログに林のカレンダーが出ない | 共有が `yuki.shibayama@...` になっているか確認 |
| `getBookingStaffInfo` で4人にならない | `calendar_id` の typo・全角文字を確認 |
| 枠が増えない | `warmBookingSlotsCache` 実行 → 5分後に再確認 |
| 予約が1人に偏る | 正常（RR）。`BOOKING_ALLOW_OVERLAP=true` なら全員常に候補 |

---

## こちらで代行できること

林・福山・山田の **`calendar_id`（Step 3 のログの該当行）** をチャットで送ってもらえれば、貼り付け用の完成JSONを返します。
