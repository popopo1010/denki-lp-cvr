#!/usr/bin/env node
/**
 * gas-recorder/agency-share.js の検証（GASを模したスタブ上で実行）。
 *
 * 代理店共有シートの約束は「個人情報を1文字も出さない」なので、
 * 目視ではなくコードで検査する。GAS上では動かせないため、
 * SpreadsheetApp / PropertiesService / Utilities / Zoho API をスタブして
 * syncAgencyShare() を丸ごと1回まわし、出力セルを検査する。
 *
 * 実行: node scripts/check-agency-share.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAS_FILES = ["コード.js", "zoho.js", "agency-share.js"].map((f) =>
  path.join(ROOT, "gas-recorder", f)
);

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.log(`  NG  ${label}${detail ? " … " + detail : ""}`);
  }
}

/* ---------------------------------------------------------------- GAS スタブ */

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.grid = [];
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  clear() { this.grid = []; return this; }
  clearContents() { return this.clear(); }
  getLastRow() { return this.grid.length; }
  getLastColumn() { return this.grid.reduce((m, r) => Math.max(m, r.length), 0); }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
  appendRow(row) { this.grid.push(row.slice()); return this; }
  getRange(row, col, numRows = 1, numCols = 1) {
    const sheet = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const src = sheet.grid[row - 1 + r] || [];
          const line = [];
          for (let c = 0; c < numCols; c++) line.push(src[col - 1 + c] ?? "");
          out.push(line);
        }
        return out;
      },
      setValues(values) {
        values.forEach((line, r) => {
          const target = row - 1 + r;
          if (!sheet.grid[target]) sheet.grid[target] = [];
          line.forEach((v, c) => { sheet.grid[target][col - 1 + c] = v; });
        });
        return this;
      },
      setValue(v) { return this.setValues([[v]]); },
      setFontWeight() { return this; },
      setBackground() { return this; },
      setFontColor() { return this; },
      setNumberFormat() { return this; }
    };
  }
}

class FakeSpreadsheet {
  constructor(id, sheetNames = []) {
    this.id = id;
    this.sheets = sheetNames.map((n) => new FakeSheet(n));
  }
  getId() { return this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find((s) => s.name === name) || null; }
  insertSheet(name) {
    const s = new FakeSheet(name);
    this.sheets.push(s);
    return s;
  }
}

// const 宣言はグローバルオブジェクトに載らないため、式として取り出す
function evalIn(ctx, expr) {
  return vm.runInContext(expr, ctx);
}

function buildContext({ props, spreadsheets }) {
  const ctx = {
    console,
    Logger: { log() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => ({ ...props })
      })
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put() {}, remove() {} })
    },
    SpreadsheetApp: {
      openById: (id) => {
        if (!spreadsheets[id]) throw new Error("no such spreadsheet: " + id);
        return spreadsheets[id];
      },
      create: (name) => {
        const ss = new FakeSpreadsheet("created-" + Object.keys(spreadsheets).length, ["シート1"]);
        ss.title = name;
        spreadsheets[ss.getId()] = ss;
        return ss;
      }
    },
    UrlFetchApp: {
      fetch: () => { throw new Error("外部通信はスタブされていません"); }
    },
    Utilities: {
      getUuid: () => "test-salt-0000",
      Charset: { UTF_8: "utf8" },
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_algo, value) =>
        Array.from(crypto.createHash("sha256").update(value, "utf8").digest()).map((b) =>
          b > 127 ? b - 256 : b // GAS は符号付きバイトを返す
        ),
      formatDate: (date, _tz, _fmt) => {
        const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        const p = (n) => String(n).padStart(2, "0");
        return (
          `${jst.getUTCFullYear()}-${p(jst.getUTCMonth() + 1)}-${p(jst.getUTCDate())} ` +
          `${p(jst.getUTCHours())}:${p(jst.getUTCMinutes())}:${p(jst.getUTCSeconds())}`
        );
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const file of GAS_FILES) {
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: path.basename(file) });
  }
  return ctx;
}

/* ------------------------------------------------------------------ テストデータ */

const PII = {
  tel: "09077778888",
  last: "佐藤",
  first: "健一",
  email: "sato.kenichi@example.com",
  birthday: "1990-04-02",
  zip: "5900031",
  city: "堺市堺区"
};

function makeRow(header, overrides) {
  const base = {
    _received_at: "2026-07-20 10:15:00",
    _lp: "denkikouji",
    "your-tel": PII.tel,
    "your-last-name": PII.last,
    "your-first-name": PII.first,
    "your-birthday": PII.birthday,
    "your-zip": PII.zip,
    "your-pref": "大阪府",
    "your-city": PII.city,
    "your-license01": "第二種電気工事士",
    "your-email": PII.email,
    line_clicked_at: "2026-07-20 10:20:00",
    zoho_deal_id: "1001",
    _page: "https://denkilp.builders-job.com/denkikouji/?utm_source=google&utm_medium=cpc" +
           "&utm_campaign=014_denki_top&utm_term=%E9%9B%BB%E6%B0%97%E5%B7%A5%E4%BA%8B%E5%A3%AB" +
           "&utm_content=phrase_match&gclid=Cj0abc",
    _ip: "203.0.113.9",
    _user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
  };
  const params = { ...base, ...overrides };
  return header.map((h) => (h in params ? params[h] : ""));
}

function runSync({ rows, stageRows, props: extraProps = {} }) {
  const props = {
    ZOHO_CLIENT_ID: "id",
    ZOHO_CLIENT_SECRET: "secret",
    ZOHO_REFRESH_TOKEN: "token",
    AGENCY_SHARE_SHEET_ID: "share-sheet",
    AGENCY_SHARE_SALT: "fixed-salt",
    ...extraProps
  };
  const source = new FakeSpreadsheet("1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc", ["form_submissions"]);
  const share = new FakeSpreadsheet("share-sheet", []);
  const ctx = buildContext({
    props,
    spreadsheets: { [source.getId()]: source, "share-sheet": share }
  });

  const header = evalIn(ctx, "PREFERRED_COLUMNS").slice();
  const sheet = source.getSheetByName("form_submissions");
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  rows(header).forEach((r) => sheet.appendRow(r));

  const queried = [];
  ctx.zohoFetch = (pathname, options) => {
    queried.push(options?.payload?.select_query || "");
    return { code: 200, body: { data: stageRows } };
  };

  const result = ctx.syncAgencyShare();
  return { ctx, share, result, queried };
}

/* ---------------------------------------------------------------------- 検証 */

console.log("1) 通常同期：個人情報が1セルも出ないこと");
{
  const { ctx, share, result } = runSync({
    rows: (header) => [
      makeRow(header, {}),
      makeRow(header, { zoho_deal_id: "", "your-tel": "08055556666", _received_at: "2026-07-21 09:00:00" }),
      makeRow(header, { zoho_deal_id: "9999", "your-tel": "07033334444", _received_at: "2026-07-22 09:00:00" }),
      // テスト送信（同じ数字ばかり＋プレースホルダー氏名）は除外されるはず
      makeRow(header, {
        zoho_deal_id: "1002", "your-tel": "11111111111",
        "your-last-name": "ああ", "your-first-name": ""
      })
    ],
    stageRows: [
      { id: "1001", Stage: "04_HOT", Modified_Time: "2026-07-25T14:30:00+09:00" }
    ]
  });

  const detail = share.getSheetByName("候補者ステージ");
  const header = detail.grid[0];
  const body = detail.grid.slice(1);

  check("ヘッダーが許可リストと一致", JSON.stringify(header) === JSON.stringify(evalIn(ctx, "AGENCY_SHARE_COLUMNS")),
        JSON.stringify(header));
  check("テスト送信が除外されて3件", body.length === 3, `${body.length}件`);

  const flat = body.flat().map(String).join("");
  for (const [label, value] of Object.entries(PII)) {
    check(`${label} が出力に含まれない`, !flat.includes(value));
  }
  check("氏名（姓+名）が出力に含まれない", !flat.includes(PII.last + PII.first));
  check("gclid は既定で共有しない", !flat.includes("Cj0abc"));

  const byStage = Object.fromEntries(body.map((r) => [r[header.indexOf("ステージ")], r]));
  check("Zohoの現ステージが反映される", "04_HOT" in byStage, JSON.stringify(Object.keys(byStage)));
  check("未連携行は CRM未連携", "CRM未連携" in byStage);
  check("Zohoに存在しないIDは 不明", "不明" in byStage);
  check("ステージ更新日が日付だけ",
        byStage["04_HOT"][header.indexOf("ステージ更新日")] === "2026-07-25",
        String(byStage["04_HOT"][header.indexOf("ステージ更新日")]));

  const hot = byStage["04_HOT"];
  check("送信日が入る", hot[header.indexOf("送信日")] === "2026-07-20");
  check("送信月が入る", hot[header.indexOf("送信月")] === "2026-07");
  check("utm_source が入る", hot[header.indexOf("utm_source")] === "google");
  check("utm_campaign が入る", hot[header.indexOf("utm_campaign")] === "014_denki_top");
  check("マーケチャネルにKWが入る",
        String(hot[header.indexOf("マーケチャネル")]).includes("KW: 電気工事士"),
        String(hot[header.indexOf("マーケチャネル")]));
  check("LINE登録が 済/未 のみ", body.every((r) => ["済", "未"].includes(r[header.indexOf("LINE登録")])));
  check("lead_id が12桁の16進", /^[0-9a-f]{12}$/.test(String(hot[header.indexOf("lead_id")])),
        String(hot[header.indexOf("lead_id")]));
  check("lead_id から電話番号が復元できない", !flat.includes(PII.tel));

  const summary = share.getSheetByName("チャネル別サマリ");
  check("サマリのヘッダーにステージ列が生える",
        summary.grid[0].includes("04_HOT") && summary.grid[0].includes("送信数"),
        JSON.stringify(summary.grid[0]));
  check("凡例シートが作られる", !!share.getSheetByName("凡例"));
  check("戻り値に件数が入る", /共有シート更新: 3件/.test(result), result);
}

console.log("1b) 事前に用意した空スプレッドシートのタブを流用する");
{
  const props = {
    ZOHO_CLIENT_ID: "id", ZOHO_CLIENT_SECRET: "secret", ZOHO_REFRESH_TOKEN: "token",
    AGENCY_SHARE_SHEET_ID: "share-sheet", AGENCY_SHARE_SALT: "fixed-salt"
  };
  const source = new FakeSpreadsheet("1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc", ["form_submissions"]);
  // 手で作った（または事前に用意した）1タブだけのスプレッドシート
  const share = new FakeSpreadsheet("share-sheet", ["シート1"]);
  const ctx = buildContext({ props, spreadsheets: { [source.getId()]: source, "share-sheet": share } });
  const header = evalIn(ctx, "PREFERRED_COLUMNS").slice();
  const sheet = source.getSheetByName("form_submissions");
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.appendRow(makeRow(header, {}));
  ctx.zohoFetch = () => ({ code: 200, body: { data: [{ id: "1001", Stage: "01_新規リード", Modified_Time: "2026-07-25T14:30:00+09:00" }] } });

  ctx.syncAgencyShare();
  const names = share.getSheets().map((s) => s.getName());
  check("空タブ「シート1」が残らない", !names.includes("シート1"), JSON.stringify(names));
  check("3タブになる", names.length === 3, JSON.stringify(names));
  check("明細が書かれている", share.getSheetByName("候補者ステージ").grid.length === 2);
}

console.log("2) lead_id は同じ候補者で不変・別候補者で別値");
{
  const run = () => runSync({
    rows: (header) => [
      makeRow(header, {}),
      makeRow(header, { zoho_deal_id: "1003", "your-tel": "08099998888" })
    ],
    stageRows: []
  });
  const a = run().share.getSheetByName("候補者ステージ").grid.slice(1).map((r) => r[0]);
  const b = run().share.getSheetByName("候補者ステージ").grid.slice(1).map((r) => r[0]);
  check("同じデータなら同じ lead_id", JSON.stringify(a) === JSON.stringify(b));
  check("別候補者は別 lead_id", new Set(a).size === a.length);
}

console.log("3) 個人情報が混ざったら書き込みを中止する（安全網）");
{
  let threw = "";
  try {
    runSync({
      // utm_campaign に電話番号が入っている異常データ
      rows: (header) => [
        makeRow(header, {
          _page: "https://denkilp.builders-job.com/denkikouji/?utm_source=google&utm_campaign=" + PII.tel
        })
      ],
      stageRows: [{ id: "1001", Stage: "01_新規リード", Modified_Time: "2026-07-25T14:30:00+09:00" }]
    });
  } catch (err) {
    threw = String(err);
  }
  check("PII混入で例外を投げる", threw.includes("個人情報"), threw || "(例外なし)");
}

console.log("4) 数字だけのPIIは部分一致で誤検知しない（MetaのキャンペーンID対策）");
{
  let error = "";
  let rowsOut = [];
  try {
    const { share } = runSync({
      rows: (header) => [
        makeRow(header, {
          "your-zip": "0248499", // 下のキャンペーンIDに部分文字列として含まれる
          _page: "https://denkilp.builders-job.com/denkikouji/?utm_source=ig&utm_medium=paid" +
                 "&utm_campaign=120248499798320789"
        })
      ],
      stageRows: [{ id: "1001", Stage: "02_未通電", Modified_Time: "2026-07-25T14:30:00+09:00" }]
    });
    rowsOut = share.getSheetByName("候補者ステージ").grid.slice(1);
  } catch (err) {
    error = String(err);
  }
  check("郵便番号を含むキャンペーンIDでも中止しない", !error, error);
  check("キャンペーンIDはそのまま出る",
        rowsOut.length === 1 && String(rowsOut[0]).includes("120248499798320789"));
}

console.log("5) Zoho取得が失敗しても落ちず、理由を戻り値に残す");
{
  const props = {
    ZOHO_CLIENT_ID: "id", ZOHO_CLIENT_SECRET: "secret", ZOHO_REFRESH_TOKEN: "token",
    AGENCY_SHARE_SHEET_ID: "share-sheet", AGENCY_SHARE_SALT: "fixed-salt"
  };
  const source = new FakeSpreadsheet("1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc", ["form_submissions"]);
  const share = new FakeSpreadsheet("share-sheet", []);
  const ctx = buildContext({ props, spreadsheets: { [source.getId()]: source, "share-sheet": share } });
  const header = evalIn(ctx, "PREFERRED_COLUMNS").slice();
  const sheet = source.getSheetByName("form_submissions");
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.appendRow(makeRow(header, {}));
  ctx.zohoFetch = () => ({ code: 401, body: {} });

  const result = ctx.syncAgencyShare();
  const body = share.getSheetByName("候補者ステージ").grid.slice(1);
  check("行は書き出される", body.length === 1);
  check("ステージは 不明 になる", body[0][evalIn(ctx, "AGENCY_SHARE_COLUMNS").indexOf("ステージ")] === "不明");
  check("戻り値にZohoエラーが載る", /Zoho取得エラー/.test(result), result);
}

console.log("6) 未設定時は何もせず案内を返す");
{
  const ctx = buildContext({
    props: {},
    spreadsheets: { "1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc": new FakeSpreadsheet("x", ["form_submissions"]) }
  });
  check("AGENCY_SHARE_SHEET_ID 未設定なら案内を返す",
        /setupAgencyShare/.test(ctx.syncAgencyShare()));
}

console.log(failures === 0 ? "\nagency-share: すべてOK" : `\nagency-share: ${failures}件 失敗`);
process.exit(failures === 0 ? 0 : 1);
