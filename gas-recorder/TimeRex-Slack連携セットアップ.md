# TimeRex → Slack（日時だけ選ばせる・最小セットアップ）

**ゴール:** ユーザーは日時だけ選ぶ → 予約確定と同時に **Slack に日時が届く**。スプシ更新はおまけ（自動で入る）。

## 最小3ステップ

### ① TimeRex

1. カレンダー作成（例: 電話相談 15分）
2. **名前・メールは削除できない**（TimeRex公式仕様・完了通知メール用）  
   → サンクス側で `guest_name` / `guest_email` を **事前入力** 済みにする（再入力不要・確認だけ）
3. **会社名・コメント・電話** など追加設問は削除してOK
4. **URLパラメータ（hidden）** `your_tel` を登録するとスプシ突合しやすい（任意）

5. **Webhook** を ON → イベント「予約確定」  
   URL: `https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec`

6. カレンダーURLは `assets/js/thanks-booking-config.js` に設定済みか確認

### ② GAS + Slack

1. Slack → Incoming Webhook URL を発行
2. GAS → スクリプトプロパティ `SLACK_WEBHOOK_URL` に貼る
3. `cd gas-recorder && clasp push -f && clasp redeploy AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw`

### ③ テスト

1. LP送信 → サンクスでカレンダー表示
2. 日時を選ぶ → 名前・メールが入った確認画面で「完了」
3. Slack に例のような通知が届けば完了

```
:calendar: 面談予約（TimeRex）
日時: 2026-05-25 14:00 〜 14:30
名前: 山田 太郎    ← hidden で渡した場合のみ
電話: 09012345678  ← 同上
```

---

## サンクスページ（LP側・済）

- TimeRex **埋め込みウィジェット**（`#timerex_calendar` + `embed.js`）
- LPの名前・電話は `guest_name` / `guest_email` で **事前入力**（`thanks-booking.js` が `data-url` に付与）
- カレンダーURL: `https://timerex.net/s/yuki.shibayama_34d4/1d1870bd`
- 名前・メールは TimeRex 仕様で残るが **事前入力済み**（LPの電話・名前 + 仮メール）

---

## Zapierで代用する場合

TimeRex「予約確定」→ Webhooks POST → 同じ GAS URL、body に:

- `_event` = `calendar_booked`
- `calendar_start` / `calendar_end` = 日時

でも Slack まで届きます。

---

## うまくいかないとき

| 症状 | 対処 |
|------|------|
| Slackに来ない | `SLACK_WEBHOOK_URL` と redeploy |
| 日時が「要確認」 | TimeRex Webhook のテスト送信を GAS で受信確認。Zapierなら `calendar_start` を明示マッピング |
| 名前・メールを消せない | TimeRex仕様。事前入力で「確認だけ」運用 |

---

CI デプロイ: `CLASPRC_JSON` シークレット設定済みなら、`gas-recorder/` 変更の main push で自動 push + redeploy（`.github/workflows/gas-deploy.yml`）。

シークレット登録時の注意: ターミナルからコピーすると zsh の改行なし記号 `%` が末尾に混入することがあるが、ワークフロー側で自動除去される（2026-06-11対応）。
