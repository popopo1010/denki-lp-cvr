/**
 * LPフォーム送信 → Google Sheets 記録
 *
 * 使い方:
 *  1. https://script.google.com/ で新規プロジェクト作成（XCHANGEアカウント）
 *  2. このファイルの中身を貼り付け
 *  3. SHEET_ID を記録先スプレッドシートのIDに書き換え
 *  4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      - 実行ユーザー: 自分
 *      - アクセスできるユーザー: 全員
 *  5. 発行された ウェブアプリURL を assets/js/app.js の GAS_URL に貼る
 *
 * 仕組み:
 *  - app.js から application/x-www-form-urlencoded で POST される
 *  - シートが空・列が足りなければ PREFERRED_COLUMNS でヘッダー初期化
 *  - 既存ヘッダーは保持しつつ、PREFERRED_COLUMNS にあって未存在の列は追加
 *  - 想定外の新規列が来ても自動で末尾に追加
 *  - タイムスタンプは日本時間（Asia/Tokyo）の "yyyy-MM-dd HH:mm:ss"
 */

const SHEET_ID = "1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc";
const SHEET_NAME = "form_submissions";
const TZ = "Asia/Tokyo";
const TS_FORMAT = "yyyy-MM-dd HH:mm:ss";

// LPフォームの全項目を初期ヘッダーとしてセット
const PREFERRED_COLUMNS = [
  "_received_at",     // GAS受信時刻（JST）
  "_lp",              // どのLPか（sekoukanri / denkikouji / *-meta / nenshu-shindan-* など）
  "your-tel",         // 電話番号
  "your-last-name",   // 姓
  "your-first-name",  // 名
  "your-birthday-year",
  "your-birthday-month",
  "your-birthday-day",
  "your-zip",         // 郵便番号
  "your-pref",        // 都道府県
  "your-city",        // 市区町村
  "your-license01",   // 保有資格
  "your-experience",  // 経験年数
  "your-willingness", // 転職意欲
  "your-feeling",     // step01の気持ち
  "your-term",        // 利用規約同意
  "_submitted_at",    // クライアント送信時刻（JST）
  "_page",            // 送信時のURL
  "_referrer",        // 流入元URL
  "_ip",              // IPアドレス
  "_user_agent",      // ブラウザ情報
];

function toJst(value) {
  if (!value) return "";
  var d = (value instanceof Date) ? value : new Date(value);
  if (isNaN(d.getTime())) return value;
  return Utilities.formatDate(d, TZ, TS_FORMAT);
}

function doPost(e) {
  try {
    var params = {};
    if (e && e.parameter) {
      for (var k in e.parameter) { params[k] = e.parameter[k]; }
    }
    // タイムスタンプは日本時間に変換
    params["_received_at"] = toJst(new Date());
    if (params["_submitted_at"]) {
      params["_submitted_at"] = toJst(params["_submitted_at"]);
    }

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // 既存ヘッダー取得
    var lastCol = sheet.getLastColumn();
    var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    // 空セルしかなければ完全初期化
    var isEmpty = header.length === 0 || header.every(function(h){ return h === "" || h == null; });
    if (isEmpty) {
      header = PREFERRED_COLUMNS.slice();
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    } else {
      // PREFERRED_COLUMNS にあって未存在の列を末尾追加（既存ヘッダー順序は保持）
      var missing = [];
      for (var i = 0; i < PREFERRED_COLUMNS.length; i++) {
        if (header.indexOf(PREFERRED_COLUMNS[i]) === -1) missing.push(PREFERRED_COLUMNS[i]);
      }
      if (missing.length > 0) {
        header = header.concat(missing);
        sheet.getRange(1, 1, 1, header.length).setValues([header]);
      }
    }

    // params に含まれて header に無いキー（想定外項目）も末尾追加
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
