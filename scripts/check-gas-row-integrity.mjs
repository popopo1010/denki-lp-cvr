#!/usr/bin/env node
/**
 * 送信行の「行番号」が他人の行とすり替わらないことの番人（GASを模したスタブ上で実行）。
 *
 * gas-recorder/コード.js は、フォーム送信をシートに append したあと、その行へ
 * slack_thread_ts / zoho_deal_id / zoho_error などの状態列を書き戻す。
 * `appendRow()` の直後に `getLastRow()` を読むだけだと、**同時に届いた別の送信**が
 * 先に追記していた場合に他人の行番号を拾い、別人の行へ書き込む。
 * その結果:
 *   - 書き込まれた側は「Zoho連携済み」と誤認され、backfillZohoDeals() が永久に商談を作らない
 *   - 書けなかった側は未連携のまま残り、後から重複商談が立つ
 *   - Slackスレッドの面談予約返信も別人に紐づく
 * しかもエラーは一切残らない（このリポジトリが繰り返し踏んできた「無言で消える」型）。
 *
 * 実行: node scripts/check-gas-row-integrity.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_PATH = path.join(ROOT, "gas-recorder", "コード.js");
const src = fs.readFileSync(SRC_PATH, "utf8");

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.log(`  NG  ${label}${detail ? " … " + detail : ""}`); }
}

console.log("1) 危険な書き方が残っていないか（静的）");
{
  // appendRow(...) の直後（空行・コメントを挟んでも）に getLastRow() を読む形を禁じる。
  const racy = /\.appendRow\([^)]*\)\s*;(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)?\s*)*\n\s*(?:var|let|const)?\s*[A-Za-z_$][\w$]*\s*=\s*[A-Za-z_$][\w$]*\.getLastRow\(\)/;
  check("appendRow の直後に getLastRow() を読んでいない", !racy.test(src),
        "行番号が必要なら appendRowAndGetIndex() を使う");
  check("共通ヘルパー appendRowAndGetIndex がある", /function appendRowAndGetIndex\s*\(/.test(src));

  const body = (src.match(/function appendRowAndGetIndex[\s\S]*?\n}\n/) || [""])[0];
  check("ヘルパーが LockService でロックする", /LockService\.getScriptLock\(\)/.test(body));
  check("ヘルパーが tryLock で待つ", /tryLock\(/.test(body));
  check("ヘルパーが finally でロックを解放する", /finally[\s\S]*releaseLock\(\)/.test(body));
  check("ヘルパーが flush してから行番号を読む",
        /SpreadsheetApp\.flush\(\)[\s\S]*getLastRow\(\)/.test(body), body ? "" : "本体が見つからない");
}

console.log("2) 実際に動かして行番号が正しいか（GASスタブ）");
{
  const events = [];
  class FakeSheet {
    constructor() { this.rows = []; }
    appendRow(row) { this.rows.push(row); events.push("append"); }
    getLastRow() { return this.rows.length; }
  }
  const ctx = vm.createContext({
    console: { log: (m) => events.push("log:" + m) },
    Date, Object, String, Number, Math, JSON, RegExp, isNaN,
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { events.push("tryLock"); return true; },
        releaseLock: () => { events.push("release"); }
      })
    },
    SpreadsheetApp: { flush: () => events.push("flush") }
  });
  // ヘルパーだけを取り出して評価する（コード.js 全体は GAS 依存が多いため）
  const body = (src.match(/function appendRowAndGetIndex[\s\S]*?\n}\n/) || [""])[0];
  vm.runInContext(body, ctx);

  const sheet = new FakeSheet();
  sheet.appendRow(["既存1"]); sheet.appendRow(["既存2"]);
  events.length = 0;
  const idx = ctx.appendRowAndGetIndex(sheet, ["新規"]);
  check("追記した行の番号を返す", idx === 3, String(idx));
  check("ロックを取ってから追記する", events.indexOf("tryLock") < events.indexOf("append"), events.join(","));
  check("行番号を読む前に flush する", events.indexOf("flush") < events.length, events.join(","));
  check("必ずロックを解放する", events.includes("release"), events.join(","));

  // ロックが取れなくても「記録を優先して続行」する（リードを落とさない）
  const ctx2 = vm.createContext({
    console: { log: () => {} },
    Date, Object, String, Number, Math, JSON, RegExp, isNaN,
    LockService: { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => { throw new Error("held"); } }) },
    SpreadsheetApp: { flush: () => {} }
  });
  vm.runInContext(body, ctx2);
  const sheet2 = new FakeSheet();
  let out = null, threw = null;
  try { out = ctx2.appendRowAndGetIndex(sheet2, ["新規"]); } catch (e) { threw = e; }
  check("ロックを取れなくても追記して続行する（リードを落とさない）",
        threw === null && out === 1 && sheet2.rows.length === 1, String(threw || out));

  // LockService 自体が使えなくても落ちない
  const ctx3 = vm.createContext({
    console: { log: () => {} },
    Date, Object, String, Number, Math, JSON, RegExp, isNaN,
    SpreadsheetApp: { flush: () => {} }
  });
  vm.runInContext(body, ctx3);
  const sheet3 = new FakeSheet();
  let out3 = null, threw3 = null;
  try { out3 = ctx3.appendRowAndGetIndex(sheet3, ["新規"]); } catch (e) { threw3 = e; }
  check("LockService が無い環境でも追記できる", threw3 === null && out3 === 1, String(threw3 || out3));
}

console.log(failures === 0 ? "\ngas-row-integrity: すべてOK" : `\ngas-row-integrity: ${failures}件 失敗`);
process.exit(failures === 0 ? 0 : 1);
