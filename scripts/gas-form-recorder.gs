/**
 * LPフォーム送信 → Google Sheets 記録
 *
 * 使い方:
 *  1. https://script.google.com/ で新規プロジェクト作成
 *  2. このファイルの中身を貼り付け
 *  3. SHEET_ID を記録先スプレッドシートのIDに書き換え
 *     （スプレッドシートURL https://docs.google.com/spreadsheets/d/【ここがID】/edit ）
 *  4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      - 実行ユーザー: 自分（このアカウント）
 *      - アクセスできるユーザー: 全員
 *  5. 発行された ウェブアプリURL を assets/js/app.js の GAS_URL に貼る
 *
 * 仕組み:
 *  - app.js から application/x-www-form-urlencoded で POST される
 *  - ヘッダー行が無ければ自動作成
 *  - 新規列が増えたら自動でヘッダー行を拡張
 *  - 行は append で追記（タイムスタンプ昇順で並ぶ）
 */

const SHEET_ID = "1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc";
const SHEET_NAME = "form_submissions";

// 列の表示順（無いものは最後に自動追加される）
const PREFERRED_COLUMNS = [
  "_received_at",
  "_lp",
  "your-tel",
  "your-last-name",
  "your-first-name",
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
  "_user_agent",
];

function doPost(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    params["_received_at"] = new Date().toISOString();

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, PREFERRED_COLUMNS.length).setValues([PREFERRED_COLUMNS]);
    }

    let header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    if (header.length === 0 || (header.length === 1 && header[0] === "")) {
      header = PREFERRED_COLUMNS.slice();
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }

    const incomingKeys = Object.keys(params);
    const newKeys = incomingKeys.filter(k => header.indexOf(k) === -1);
    if (newKeys.length > 0) {
      header = header.concat(newKeys);
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }

    const row = header.map(k => (k in params ? params[k] : ""));
    if (row.length === 0) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, note: "no data" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput("LP form recorder is alive.")
    .setMimeType(ContentService.MimeType.TEXT);
}
