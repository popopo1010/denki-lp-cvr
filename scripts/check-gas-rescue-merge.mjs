#!/usr/bin/env node
/**
 * thanks到達ピンと送信本体の「順番の入れ替わり」で、同じ人の行・通知・商談が二重にならないことの番人
 *（GASを模したスタブ上で gas-recorder/コード.js と zoho.js を実際に動かす）。
 *
 * 2026-10-01 実録: 本体の sendBeacon がブラウザ側で遅れ、GAS の起動待ちも乗って、
 * ピン側の「8秒待って再検索」に本体が間に合わなかった。結果:
 *   - @channel が2回（「送信消失の疑い」→ 直後に「新規リード」）
 *   - シートに同じ人の行が2つ（救済行＝名前と電話だけ／本体行＝全項目）
 *   - 24時間後に backfillZohoDeals() を回すと救済行から名前と電話だけの重複商談が立つ
 * 対策（この番人が守る3点）:
 *   1. ピンは短い間隔で複数回見に行く（THANKS_PING_WAIT_ROUNDS × THANKS_PING_WAIT_STEP_MS）
 *   2. 本体が後から届いたら新しい行を足さず救済行へ合流する（findRecentRescueRow / mergeIntoRescueRow）。
 *      Slack は警報スレッドに返信＋親の警報文を「本体到着済み」に書き換え、@channel を鳴らし直さない
 *   3. backfillZohoDeals() は未合流の救済行に同じ番号の本体行が前後24時間内にあれば商談を作らない
 *
 * 実行: node scripts/check-gas-rescue-merge.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const codeSrc = read("gas-recorder/コード.js");
const zohoSrc = read("gas-recorder/zoho.js");

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.log(`  NG  ${label}${detail ? " … " + detail : ""}`); }
}

// ───────────────────────── GAS スタブ ─────────────────────────
function jstString(d) {
  const t = new Date(d.getTime() + 9 * 3600000);
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.rows[this.r - 1 + i] || [];
      const line = [];
      for (let j = 0; j < this.nc; j++) line.push(row[this.c - 1 + j] === undefined ? "" : row[this.c - 1 + j]);
      out.push(line);
    }
    return out;
  }
  getDisplayValues() { return this.getValues().map((l) => l.map((v) => (v == null ? "" : String(v)))); }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  setValues(vals) {
    for (let i = 0; i < vals.length; i++) {
      while (this.sheet.rows.length < this.r + i) this.sheet.rows.push([]);
      const row = this.sheet.rows[this.r - 1 + i];
      for (let j = 0; j < vals[i].length; j++) row[this.c - 1 + j] = vals[i][j];
    }
    this.sheet.events.push(`setValues@${this.r}`);
  }
  setValue(v) { this.setValues([[v]]); }
  setNumberFormat() { return this; }
}
class FakeSheet {
  constructor() { this.rows = []; this.events = []; }
  getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  appendRow(row) { this.rows.push(row.slice()); this.events.push("appendRow"); }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  header() { return this.rows[0] || []; }
  col(name) { return this.header().indexOf(name); }
  cell(rowNum, name) { const i = this.col(name); return i === -1 ? undefined : (this.rows[rowNum - 1] || [])[i]; }
}

function makeContext(sheet, opts = {}) {
  const slackCalls = [];
  const sleeps = [];
  const ctx = {
    console: { log: () => {}, error: () => {} },
    Date, Object, String, Number, Math, JSON, RegExp, Array, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }),
      flush: () => {}
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      sleep: (ms) => sleeps.push(ms),
      formatDate: (d) => jstString(d)
    },
    ContentService: {
      createTextOutput: (text) => ({ _text: text, setMimeType() { return this; } }),
      MimeType: { JSON: "json", TEXT: "text" }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => ({ SLACK_BOT_TOKEN: "xoxb-test", SLACK_LEAD_CHANNEL_ID: "C_LEAD", ...(opts.props || {}) })
      })
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        const payload = o && o.payload ? JSON.parse(o.payload) : {};
        slackCalls.push({ url, payload });
        const n = slackCalls.length;
        let body = { ok: true, ts: `1700000000.${String(n).padStart(6, "0")}`, channel: payload.channel || "C_LEAD" };
        return { getContentText: () => JSON.stringify(body), getResponseCode: () => 200 };
      }
    },
    // booking-custom.js の mergeRequestParams と同じ振る舞い（URLエンコード本文 → params）
    mergeRequestParams: (e, params) => {
      params = params || {};
      if (e && e.parameter) for (const k in e.parameter) if (k !== "action" && k !== "callback") params[k] = e.parameter[k];
      if (e && e.postData && e.postData.contents) {
        String(e.postData.contents).split("&").forEach((pair) => {
          const i = pair.indexOf("="); if (i === -1) return;
          const key = decodeURIComponent(pair.slice(0, i).replace(/\+/g, " "));
          const val = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
          if (key && params[key] === undefined) params[key] = val;
        });
      }
      return params;
    },
    handleBookSlot: () => { throw new Error("not in test"); },
    handleTimerexWebhook: () => { throw new Error("not in test"); }
  };
  vm.createContext(ctx);
  vm.runInContext(codeSrc, ctx, { filename: "コード.js" });
  vm.runInContext(zohoSrc, ctx, { filename: "zoho.js" });
  return { ctx, slackCalls, sleeps };
}

function post(ctx, params) {
  const body = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const res = ctx.doPost({ parameter: {}, postData: { contents: body } });
  return JSON.parse(res._text);
}

const TEL = "08049711404";
const PING = { _event: "thanks_reached", "your-tel": TEL, _name: "牧野 良太", _lp: "denkikouji-v2", _page: "https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/" };
const BODY = {
  "your-tel": TEL, "your-last-name": "牧野", "your-first-name": "良太", "your-pref": "大阪府",
  "your-birthday-year": "1986", "your-license01": "その他の資格", "your-experience": "未経験",
  "your-willingness": "今は情報収集したい", _lp: "denkikouji-v2",
  _page: "https://denkilp.builders-job.com/denki-lp-cvr/denkikouji-v2/?utm_source=google", _ip: "60.83.210.236"
};
const channelPosts = (calls) => calls.filter((c) => c.url.endsWith("chat.postMessage") && !c.payload.thread_ts);
const threadPosts = (calls) => calls.filter((c) => c.url.endsWith("chat.postMessage") && c.payload.thread_ts);
const updates = (calls) => calls.filter((c) => c.url.endsWith("chat.update"));

console.log("1) 静的: 配線が残っているか");
{
  const doPostBody = (codeSrc.match(/function doPost\(e\)[\s\S]*?\n}\n/) || [""])[0];
  check("doPost が追記の前に救済行を探す（findRecentRescueRow → appendRowAndGetIndex の順）",
    doPostBody.indexOf("findRecentRescueRow(") !== -1 &&
    doPostBody.indexOf("findRecentRescueRow(") < doPostBody.indexOf("appendRowAndGetIndex("));
  check("合流時は notifySlackRescueMerged（新規@channelではない）",
    /mergeIntoRescueRow\(/.test(doPostBody) && /notifySlackRescueMerged\(/.test(doPostBody));
  const ping = (codeSrc.match(/function handleThanksReached\(params\)[\s\S]*?\n}\n/) || [""])[0];
  check("ピンは THANKS_PING_WAIT_ROUNDS 回まで待つ（8秒1回に戻さない）",
    /THANKS_PING_WAIT_ROUNDS/.test(ping) && /Utilities\.sleep\(THANKS_PING_WAIT_STEP_MS\)/.test(ping) &&
    !/Utilities\.sleep\(8000\)/.test(ping));
  const rounds = +(codeSrc.match(/var THANKS_PING_WAIT_ROUNDS\s*=\s*(\d+)/) || [])[1];
  const step = +(codeSrc.match(/var THANKS_PING_WAIT_STEP_MS\s*=\s*(\d+)/) || [])[1];
  check(`合計待ち時間が 20秒以上・60秒以下（いま ${rounds}×${step}ms）`,
    rounds * step >= 20000 && rounds * step <= 60000);
  const merged = (codeSrc.match(/function notifySlackRescueMerged[\s\S]*?\n}\n/) || [""])[0];
  check("スレッド返信から <!channel> を取り除く（鳴らし直さない）", /replace\(\/<!channel>/.test(merged));
  check("親の警報文を chat.update で書き換える", /updateSlackChatMessage\(/.test(merged) && /chat\.update/.test(codeSrc));
  const backfill = (zohoSrc.match(/function backfillZohoDeals[\s\S]*?\n}\n/) || [""])[0];
  check("backfillZohoDeals が未合流の救済行を superseded として飛ばす",
    /zohoFindBodyRowForRescue\(/.test(backfill) && /superseded_by_row/.test(backfill));
  check("PREFERRED_COLUMNS と凡例に _recovered_merged_at がある",
    /"_recovered_merged_at",/.test(codeSrc) && /\["_recovered_merged_at",/.test(codeSrc));
}

console.log("2) 実走: ピンが先・本体が後（2026-10-01 の実録どおり）");
{
  const sheet = new FakeSheet();
  const { ctx, slackCalls, sleeps } = makeContext(sheet);
  const pingRes = post(ctx, PING);
  check("ピンは本体が無いので救済行を立てる", pingRes.recovered === true && sheet.getLastRow() === 2, JSON.stringify(pingRes));
  check("立てる前に複数回待つ", sleeps.length === ctx.THANKS_PING_WAIT_ROUNDS && sleeps.every((s) => s === ctx.THANKS_PING_WAIT_STEP_MS), sleeps.join(","));
  check("救済の警報は @channel 付き", channelPosts(slackCalls).length === 1 && /<!channel>/.test(channelPosts(slackCalls)[0].payload.text) && /送信消失の疑い/.test(channelPosts(slackCalls)[0].payload.text));
  const rescueTs = sheet.cell(2, "slack_thread_ts");
  check("救済行に _recovered=thanks_ping と警報の ts が入る", sheet.cell(2, "_recovered") === "thanks_ping" && !!rescueTs);
  const reached = sheet.cell(2, "thanks_reached_at");

  const bodyRes = post(ctx, BODY);
  check("本体は新しい行を足さず救済行に合流する", bodyRes.merged_into_rescue === true && bodyRes.row === 2 && sheet.getLastRow() === 2, JSON.stringify(bodyRes) + " rows=" + sheet.getLastRow());
  check("合流後の行に本体の全項目が入る", sheet.cell(2, "your-pref") === "大阪府" && sheet.cell(2, "your-license01") === "その他の資格" && sheet.cell(2, "utm_source") === "google");
  check("救済の痕跡は残す（_recovered=thanks_ping_merged・合流時刻・到達時刻）",
    sheet.cell(2, "_recovered") === "thanks_ping_merged" && !!sheet.cell(2, "_recovered_merged_at") && sheet.cell(2, "thanks_reached_at") === reached);
  check("Slackスレッドは警報のものを引き継ぐ（面談予約の返信先が揃う）", sheet.cell(2, "slack_thread_ts") === rescueTs);
  check("@channel は2回鳴らない", channelPosts(slackCalls).length === 1, String(channelPosts(slackCalls).length));
  const reply = threadPosts(slackCalls);
  check("本体の全項目を警報スレッドに返信する（<!channel> なし）",
    reply.length === 1 && reply[0].payload.thread_ts === rescueTs && !/<!channel>/.test(reply[0].payload.text) && /大阪府/.test(reply[0].payload.text) && /誤警報/.test(reply[0].payload.text));
  const upd = updates(slackCalls);
  check("親の警報文を「本体到着済み」に書き換える", upd.length === 1 && upd[0].payload.ts === rescueTs && /本体が届きました/.test(upd[0].payload.text) && !/<!channel>/.test(upd[0].payload.text));
  check("Zoho は無効設定なので skipped: disabled（例外なし）", bodyRes.zoho_deal && bodyRes.zoho_deal.skipped === "disabled");

  // 合流後にもう一度ピンが来ても（再読み込み等）行は増えない
  const again = post(ctx, PING);
  check("合流後のピンは既存行に照合するだけ", again.matched === true && sheet.getLastRow() === 2);
}

console.log("3) 実走: 本体が先・ピンが後（通常）");
{
  const sheet = new FakeSheet();
  const { ctx, slackCalls, sleeps } = makeContext(sheet);
  const bodyRes = post(ctx, BODY);
  check("本体は通常どおり追記＋@channel", bodyRes.merged_into_rescue === false && sheet.getLastRow() === 2 && channelPosts(slackCalls).length === 1);
  const pingRes = post(ctx, PING);
  check("ピンは待たずに照合して到達時刻だけ書く", pingRes.matched === true && sleeps.length === 0 && !!sheet.cell(2, "thanks_reached_at") && sheet.getLastRow() === 2);
  check("通知は1回のまま", slackCalls.length === 1);
}

console.log("4) 実走: 古い救済行（24時間超）には合流しない＝別の機会の再登録");
{
  const sheet = new FakeSheet();
  const { ctx } = makeContext(sheet);
  post(ctx, PING);
  const atCol = sheet.col("_received_at");
  sheet.rows[1][atCol] = jstString(new Date(Date.now() - 30 * 3600000));
  const bodyRes = post(ctx, BODY);
  check("30時間前の救済行には合流せず新しい行を足す", bodyRes.merged_into_rescue === false && sheet.getLastRow() === 3);
}

console.log("5) 実走: 警報の Slack 投稿が失敗していた救済行に本体が合流したら通常通知で補う");
{
  const sheet = new FakeSheet();
  const { ctx, slackCalls } = makeContext(sheet);
  post(ctx, PING);
  const tsCol = sheet.col("slack_thread_ts");
  sheet.rows[1][tsCol] = "";
  slackCalls.length = 0;
  const bodyRes = post(ctx, BODY);
  check("合流はする", bodyRes.merged_into_rescue === true && sheet.getLastRow() === 2);
  check("スレッドが無いので新規リード通知を1回出して ts を保存する",
    channelPosts(slackCalls).length === 1 && updates(slackCalls).length === 0 && !!sheet.cell(2, "slack_thread_ts"));
}

console.log("6) backfillZohoDeals の重複商談ガード（zohoFindBodyRowForRescue）");
{
  const sheet = new FakeSheet();
  const { ctx } = makeContext(sheet);
  const header = ["_received_at", "_recovered", "your-tel", "your-last-name"];
  const now = Date.now();
  const values = [
    [jstString(new Date(now - 60000)), "thanks_ping", "8049711404", "牧野"],      // 行2: 救済（先頭0欠落の数値保存を模す）
    [jstString(new Date(now)), "", "08049711404", "牧野"],                        // 行3: 本体
    [jstString(new Date(now - 3 * 86400000)), "thanks_ping", "09011112222", "別人"], // 行4: 本体が無い本物の救済
    [jstString(new Date(now)), "", "09011112222", "別人"],                        // 行5: 3日後の再登録（別件）
    [jstString(new Date(now)), "", "07033334444", "通常"]                         // 行6: 通常行
  ];
  check("救済行に24時間内の本体行があれば本体の行番号", ctx.zohoFindBodyRowForRescue(values, header, 0) === 3, String(ctx.zohoFindBodyRowForRescue(values, header, 0)));
  check("本体行そのものは対象外（0）", ctx.zohoFindBodyRowForRescue(values, header, 1) === 0);
  check("3日離れた同番号は別件なので救済行の商談は作る（0）", ctx.zohoFindBodyRowForRescue(values, header, 2) === 0);
  check("通常行は対象外（0）", ctx.zohoFindBodyRowForRescue(values, header, 4) === 0);
  check("合流済み（thanks_ping_merged）は救済扱いしない（0）",
    ctx.zohoFindBodyRowForRescue([[jstString(new Date(now)), "thanks_ping_merged", "08049711404", "牧野"], values[1]], header, 0) === 0);
}

console.log(failures ? `\nNG: ${failures} 件` : "\nすべて通過");
process.exit(failures ? 1 : 0);
