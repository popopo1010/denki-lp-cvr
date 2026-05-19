/**
 * LPフォーム送信 → Google Sheets 記録
 *
 * 使い方（手動コピペ）:
 *  1. GAS editor を XCHANGE アカウントで開く
 *  2. Code.gs の中身を全削除 → 下記をコピペ
 *  3. Cmd+S 保存
 *  4. 「デプロイを管理」→ 既存デプロイの ✎ → バージョン: 新バージョン → デプロイ
 *     URL は変わらないので app.js 側はそのまま
 *
 * 使い方（clasp）:
 *  - gas-recorder/ ディレクトリで `clasp push` → `clasp redeploy <deploymentId>`
 *
 * 仕様:
 *  - app.js から application/x-www-form-urlencoded で POST される
 *  - タイムスタンプは日本時間 (Asia/Tokyo) で "yyyy-MM-dd HH:mm:ss"
 *  - 生年月日は year/month/day から "1990-10-10" 形式の "your-birthday" 列に集約
 *  - シートが空または列が足りなければ PREFERRED_COLUMNS でヘッダー初期化
 *  - 既存ヘッダーは保持しつつ、PREFERRED_COLUMNS にあって未存在の列は追加
 *  - 想定外の新規列も自動で末尾に追加
 */

const SHEET_ID = "1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc";
const SHEET_NAME = "form_submissions";
const TZ = "Asia/Tokyo";
const TS_FORMAT = "yyyy-MM-dd HH:mm:ss";

// 列の表示順。your-birthday は year/month/day から自動生成された YYYY-MM-DD
const PREFERRED_COLUMNS = [
  "_received_at",
  "_lp",
  "your-tel",
  "your-last-name",
  "your-first-name",
  "your-birthday",
  "your-birthday-year",
  "your-birthday-month",
  "your-birthday-day",
  "your-zip",
  "your-pref",
  "your-city",
  "your-license01",
  "your-experience",
  "your-willingness",
  "your-feeling",
  "your-term",
  "_submitted_at",
  "_page",
  "_referrer",
  "_ip",
  "_user_agent"
];

function toJst(value) {
  if (!value) return "";
  var d = (value instanceof Date) ? value : new Date(value);
  if (isNaN(d.getTime())) return value;
  return Utilities.formatDate(d, TZ, TS_FORMAT);
}

function pad2(s) {
  var str = String(s == null ? "" : s);
  return str.length < 2 ? ("0" + str).slice(-2) : str;
}

function doPost(e) {
  try {
    var params = {};
    if (e && e.parameter) {
      for (var k in e.parameter) { params[k] = e.parameter[k]; }
    }
    // タイムスタンプを日本時間に変換
    params["_received_at"] = toJst(new Date());
    if (params["_submitted_at"]) params["_submitted_at"] = toJst(params["_submitted_at"]);

    // 生年月日を YYYY-MM-DD 形式で集約
    var by = params["your-birthday-year"];
    var bm = params["your-birthday-month"];
    var bd = params["your-birthday-day"];
    if (by && bm && bd) {
      params["your-birthday"] = String(by) + "-" + pad2(bm) + "-" + pad2(bd);
    }

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    var lastCol = sheet.getLastColumn();
    var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    var isEmpty = header.length === 0 || header.every(function(h){ return h === "" || h == null; });
    if (isEmpty) {
      header = PREFERRED_COLUMNS.slice();
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    } else {
      var missing = [];
      for (var i = 0; i < PREFERRED_COLUMNS.length; i++) {
        if (header.indexOf(PREFERRED_COLUMNS[i]) === -1) missing.push(PREFERRED_COLUMNS[i]);
      }
      if (missing.length > 0) {
        header = header.concat(missing);
        sheet.getRange(1, 1, 1, header.length).setValues([header]);
      }
    }

    var newKeys = [];
    for (var pk in params) {
      if (params.hasOwnProperty(pk) && header.indexOf(pk) === -1) newKeys.push(pk);
    }
    if (newKeys.length > 0) {
      header = header.concat(newKeys);
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }

    if (header.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, note: "no data" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var row = [];
    for (var j = 0; j < header.length; j++) {
      row.push((header[j] in params) ? params[header[j]] : "");
    }
    sheet.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput("LP form recorder is alive.")
    .setMimeType(ContentService.MimeType.TEXT);
}
