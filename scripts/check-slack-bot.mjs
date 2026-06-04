#!/usr/bin/env node
/**
 * GAS の Slack Bot 診断（auth.test のみ・チャンネル投稿なし）
 *
 * WEBHOOK_SECRET を GAS に設定している場合:
 *   WEBHOOK_SECRET=xxx node scripts/check-slack-bot.mjs
 */
"use strict";

import https from "https";

const GAS_URL =
  process.env.BOOKING_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
const SECRET = process.env.WEBHOOK_SECRET || "";

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirects > 8) return reject(new Error("too many redirects"));
          return resolve(fetchUrl(res.headers.location, redirects + 1));
        }
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          resolve(body);
        });
      })
      .on("error", reject);
  });
}

async function main() {
  const u = new URL(GAS_URL);
  u.searchParams.set("action", "slack_health");
  if (SECRET) u.searchParams.set("key", SECRET);

  let body;
  try {
    body = await fetchUrl(u.toString());
  } catch (err) {
    console.error("✗ GAS に接続できません:", err.message);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    if (body.includes("slack_health") || body.length < 80) {
      console.error(
        "✗ action=slack_health が未デプロイの可能性があります。\n" +
          "  gas-recorder で clasp push → redeploy 後に再実行してください。"
      );
      console.error("  応答:", body.slice(0, 120));
      process.exit(2);
    }
    console.error("✗ JSON パース失敗:", body.slice(0, 200));
    process.exit(1);
  }

  if (!data.ok) {
    console.error("✗", data.error || data);
    if (String(data.error) === "unauthorized") {
      console.error("  → WEBHOOK_SECRET を環境変数に設定して再実行");
    }
    process.exit(1);
  }

  const h = data;
  console.log("checked_at:", h.checked_at);
  console.log("bot_enabled:", h.bot_enabled);
  console.log("bot_token_set:", h.bot_token_set);
  console.log("lead_channel_set:", h.lead_channel_set);
  console.log("mention_ca_set:", h.mention_ca_set);
  console.log("webhook_fallback_set:", h.webhook_fallback_set);

  if (!h.bot_enabled) {
    console.error(
      "\n✗ SLACK_BOT_TOKEN または SLACK_LEAD_CHANNEL_ID が未設定です（GAS スクリプトプロパティ）"
    );
    process.exit(1);
  }

  const auth = h.auth || {};
  if (auth.ok) {
    console.log("\n✓ auth.test OK");
    console.log("  team:", auth.team);
    console.log("  bot_id:", auth.bot_id || "(n/a)");
    printPostCheckHint();
    process.exit(0);
  }

  const errText = String(auth.error || auth.note || "");
  if (errText.indexOf("external_request") !== -1 || errText.indexOf("権限") !== -1) {
    console.log("\n△ auth.test は Web 経由では未実行（設定はあり）");
    console.log(
      "  → GAS エディタで testSlackBotHealth を yuki.shibayama で実行し、auth.ok を確認"
    );
    printPostCheckHint();
    process.exit(0);
  }

  console.error("\n✗ auth.test 失敗:", errText || auth);
  process.exit(1);
}

function printPostCheckHint() {
  console.log(
    "\n※ 投稿・スレッド返信は未検証。LPテスト送信 → サンクスで枠予約 → リードチャンネル目視。"
  );
}

main();
