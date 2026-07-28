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
  setColumnWidth(col, px) {
    // GAS は 0 以下の列位置で "Those columns are out of bounds." を投げる。
    // ダミー実装で握りつぶすと、列名変更による例外をテストで検知できない（2026-07-28 の再発防止）。
    if (!(col >= 1)) throw new Error("Those columns are out of bounds. col=" + col);
    return this;
  }
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
        zoho_deal_id: "", "your-tel": "11111111111",
        "your-last-name": "ああ", "your-first-name": ""
      })
    ],
    stageRows: [
      { id: "1001", Stage: "08_逆オファーOK", Modified_Time: "2026-07-25T14:30:00+09:00" }
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

  const iTarget = header.indexOf("逆オファーOK到達");
  const marked = body.filter((r) => r[iTarget] === "✓");
  check("逆オファーOK以上の行にチェックが付く", marked.length === 1, `${marked.length}件`);
  check("未連携・CRMに無い行はチェックなし",
        body.filter((r) => r[iTarget] === "").length === 2);
  check("ステージ名そのものは出さない",
        !body.flat().map(String).some((v) => v.includes("_逆オファー") || v.includes("未通電")));

  const hot = marked[0];
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
  check("サマリは逆オファーOK到達と率だけ",
        summary.grid[0].includes("逆オファーOK到達") && summary.grid[0].includes("逆オファーOK到達率(%)") &&
        !summary.grid[0].some((h) => String(h).includes("HOT")),
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
  check("7タブになる", names.length === 7, JSON.stringify(names));
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
  check("ステージ取得失敗時はチェックなし",
        body[0][evalIn(ctx, "AGENCY_SHARE_COLUMNS").indexOf("逆オファーOK到達")] === "");
  check("戻り値にZohoエラーが載る", /Zoho取得エラー/.test(result), result);
}

console.log("6b) 商談IDがある行はテスト判定で落とさない／電話番号なしの未連携行は落とす");
{
  const { share, result } = runSync({
    rows: (header) => [
      // 氏名も電話もテスト形式だが、Zohoに商談がある＝実在の候補者として扱う
      makeRow(header, {
        zoho_deal_id: "4001", "your-tel": "11111111111",
        "your-last-name": "ああ", "your-first-name": ""
      }),
      // thanksページのメール登録などで電話が無く、CRMにも無い行は落とす
      makeRow(header, { zoho_deal_id: "", "your-tel": "" }),
      // 未連携でも電話が正常なら CRM未連携 として残す
      makeRow(header, { zoho_deal_id: "", "your-tel": "08055556666" })
    ],
    stageRows: [{ id: "4001", Stage: "11_書類選考", Modified_Time: "2026-07-25T14:30:00+09:00" }]
  });
  const body = share.getSheetByName("候補者ステージ").grid.slice(1);
  const flags = body.map((r) => r[11]); // 11 = 逆オファーOK到達列
  check("2件残る（商談あり＋未連携で電話あり）", body.length === 2, `${body.length}件`);
  check("商談ありのテスト形式行が残る（11_書類選考→到達）", flags.includes("✓"), JSON.stringify(flags));
  check("電話番号なしの未連携行は落ちる", /電話番号なし 1件を除外/.test(result), result);
}

console.log("7) チャネル絞り込み（Google広告だけ共有）");
{
  const { share, result } = runSync({
    props: { AGENCY_SHARE_UTM_SOURCE: "google" },
    rows: (header) => [
      makeRow(header, {}), // utm_source=google
      makeRow(header, {    // Meta
        zoho_deal_id: "2001", "your-tel": "08055556666",
        _page: "https://denkilp.builders-job.com/denkikouji-v2/?utm_source=fb&utm_medium=paid&utm_campaign=120248499798320789"
      }),
      makeRow(header, {    // 自然流入（utm無し・クリックIDも無し）
        zoho_deal_id: "2002", "your-tel": "07033334444",
        _page: "https://denkilp.builders-job.com/denkikouji/"
      }),
      makeRow(header, {    // Google自動タグ設定（utm無し・gclidだけ）
        zoho_deal_id: "2003", "your-tel": "09088886666",
        _page: "https://denkilp.builders-job.com/denkikouji/?gclid=EAIaIQobC"
      })
    ],
    stageRows: [
      { id: "1001", Stage: "04_HOT (リバース)", Modified_Time: "2026-07-25T14:30:00+09:00" },
      { id: "2003", Stage: "01_新規リード", Modified_Time: "2026-07-25T14:30:00+09:00" }
    ]
  });
  const body = share.getSheetByName("候補者ステージ").grid.slice(1);
  const flat = body.flat().map(String).join("|");
  check("Google行だけ残る（2件）", body.length === 2, `${body.length}件: ${flat}`);
  check("Meta(fb)は除外", !flat.includes("fb"));
  check("自然流入は除外", !flat.includes("2002"));
  check("gclidのみのGoogle自動タグ行は含む", body.length === 2 && flat.includes("|"));
  check("除外件数がログに出る", /チャネル絞り込み\[google\]で 2件を除外/.test(result), result);
}

console.log("8) キャンペーン別・KW別の到達率タブ");
{
  const { share } = runSync({
    rows: (header) => [
      makeRow(header, { zoho_deal_id: "3001" }),
      makeRow(header, { zoho_deal_id: "3002", "your-tel": "08055556666" }),
      makeRow(header, { zoho_deal_id: "3003", "your-tel": "07033334444" }),
      makeRow(header, { zoho_deal_id: "3004", "your-tel": "09088886666" })
    ],
    stageRows: [
      { id: "3001", Stage: "08_逆オファーOK", Modified_Time: "2026-07-25T14:30:00+09:00" },
      { id: "3002", Stage: "21_内定", Modified_Time: "2026-07-25T14:30:00+09:00" },
      { id: "3003", Stage: "28_無効リード", Modified_Time: "2026-07-25T14:30:00+09:00" },
      { id: "3004", Stage: "01_新規リード", Modified_Time: "2026-07-25T14:30:00+09:00" }
    ]
  });

  const camp = share.getSheetByName("キャンペーン別到達率");
  const head = camp.grid[0];
  const all = camp.grid[1];
  const i8 = head.indexOf("逆オファーOK到達");
  check("キャンペーンタブの1行目は【全体】", all[0] === "【全体】", String(all[0]));
  check("候補者数4件", all[1] === 4, String(all[1]));
  check("逆オファーOK到達が2件（08と21）", all[i8] === 2, String(all[i8]));
  check("到達率が50%", all[i8 + 1] === 50, String(all[i8 + 1]));
  check("28_無効リードは到達に数えない", all[i8] === 2);
  check("ステージ名の列は無い", !head.some((h) => String(h).includes("_内定") || String(h).includes("HOT")),
        JSON.stringify(head));
  check("キャンペーン名の行がある", camp.grid[2] && camp.grid[2][0] === "014_denki_top",
        JSON.stringify(camp.grid[2] && camp.grid[2][0]));

  const kw = share.getSheetByName("KW別到達率");
  check("KWタブの見出しがキーワード", kw.grid[0][0] === "キーワード", String(kw.grid[0][0]));
  check("KW行が検索語で立つ", kw.grid[2] && kw.grid[2][0] === "電気工事士",
        JSON.stringify(kw.grid[2] && kw.grid[2][0]));
}

console.log("9) 日付型セルの _received_at と、同一候補者の重複送信");
{
  const { share, result } = runSync({
    rows: (header) => [
      // スプレッドシートが日付型で保持しているケース（本番で "Wed May 27" になっていた）
      makeRow(header, { zoho_deal_id: "5001", _received_at: new Date("2026-05-27T01:15:00Z") }),
      // 同じ候補者（同じ商談ID）の再送信。初回=6/1 を残す
      makeRow(header, { zoho_deal_id: "5002", "your-tel": "08055556666", _received_at: "2026-06-10 09:00:00" }),
      makeRow(header, { zoho_deal_id: "5002", "your-tel": "08055556666", _received_at: "2026-06-01 09:00:00" })
    ],
    stageRows: [{ id: "5002", Stage: "08_逆オファーOK", Modified_Time: "2026-07-25T14:30:00+09:00" }]
  });
  const body = share.getSheetByName("候補者ステージ").grid.slice(1);
  const days = body.map((r) => r[1]);
  const months = body.map((r) => r[2]);
  check("日付型セルが yyyy-MM-dd になる", days.includes("2026-05-27"), JSON.stringify(days));
  check("送信月が yyyy-MM になる", months.every((m) => /^\d{4}-\d{2}$/.test(m)), JSON.stringify(months));
  check("曜日文字列にならない", !days.some((d) => /[A-Za-z]/.test(String(d))), JSON.stringify(days));
  check("同一候補者は1行に統合", body.length === 2, `${body.length}件`);
  check("初回送信日が残る", days.includes("2026-06-01"), JSON.stringify(days));
  check("統合件数がログに出る", /重複 1件を統合/.test(result), result);
}

console.log("10) 月別推移と広告費からの単価");
{
  const props = {
    ZOHO_CLIENT_ID: "id", ZOHO_CLIENT_SECRET: "secret", ZOHO_REFRESH_TOKEN: "token",
    AGENCY_SHARE_SHEET_ID: "share-sheet", AGENCY_SHARE_SALT: "fixed-salt"
  };
  const source = new FakeSpreadsheet("1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc", ["form_submissions"]);
  const share = new FakeSpreadsheet("share-sheet", []);
  // 広告費を先に入れておく（人が入力するタブ）
  const cost = share.insertSheet("広告コスト入力");
  cost.getRange(1, 1, 3, 3).setValues([
    ["年月 (YYYY-MM)", "キャンペーン", "広告費(円)"],
    ["2026-07", "014_denki_top", 200000],
    ["2026-06", "014_denki_top", 100000]
  ]);
  const ctx = buildContext({ props, spreadsheets: { [source.getId()]: source, "share-sheet": share } });
  const header = evalIn(ctx, "PREFERRED_COLUMNS").slice();
  const sheet = source.getSheetByName("form_submissions");
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  [
    { id: "6001", tel: "09077778888", at: "2026-07-05 10:00:00" },
    { id: "6002", tel: "08055556666", at: "2026-07-06 10:00:00" },
    { id: "6003", tel: "07033334444", at: "2026-06-05 10:00:00" }
  ].forEach((r) => sheet.appendRow(makeRow(header, { zoho_deal_id: r.id, "your-tel": r.tel, _received_at: r.at })));
  ctx.zohoFetch = () => ({ code: 200, body: { data: [
    { id: "6001", Stage: "08_逆オファーOK", Modified_Time: "2026-07-25T14:30:00+09:00" },
    { id: "6003", Stage: "21_内定", Modified_Time: "2026-07-25T14:30:00+09:00" }
  ] } });

  ctx.syncAgencyShare();
  const m = share.getSheetByName("月別推移");
  const head = m.grid[0];
  check("月別推移タブができる", !!m && head[0] === "送信月", JSON.stringify(head));
  check("単価の列がある", head.includes("逆オファーOK到達単価(円)"), JSON.stringify(head));
  const rows = m.grid.slice(1);
  const jul = rows.find((r) => r[0] === "2026-07");
  const jun = rows.find((r) => r[0] === "2026-06");
  check("先頭は【全体】", rows[0][0] === "【全体】", String(rows[0][0]));
  check("新しい月が先", rows[1][0] === "2026-07", String(rows[1][0]));
  check("7月: 候補者2人・到達1人", jul[1] === 2 && jul[4] === 1, JSON.stringify(jul));
  check("7月の逆オファーOK単価 = 200000/1", jul[head.indexOf("逆オファーOK到達単価(円)")] === 200000, JSON.stringify(jul));
  check("7月の候補者単価 = 200000/2", jul[head.indexOf("候補者単価(円)")] === 100000, JSON.stringify(jul));
  check("6月の逆オファーOK単価 = 100000/1", jun[head.indexOf("逆オファーOK到達単価(円)")] === 100000, JSON.stringify(jun));
  check("広告コスト入力タブは消されない",
        share.getSheetByName("広告コスト入力").grid.length === 3,
        String(share.getSheetByName("広告コスト入力").grid.length));
  check("KWタブに単価は出さない",
        !share.getSheetByName("KW別到達率").grid[0].some((h) => String(h).includes("単価")));
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
