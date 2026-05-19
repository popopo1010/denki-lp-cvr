/**
 * LPフォーム送信 → Google Sheets 記録
 *
 * 仕様:
 *  - フォーム送信 (_event 無し): 新規行を append。タイムスタンプは日本時間 (Asia/Tokyo)。
 *  - LINE追加クリック (_event=line_click): 電話番号で既存行を検索して line_clicked_at を更新。
 *  - 生年月日は year/month/day から "1990-10-10" 形式の your-birthday 列に集約。
 *  - シートが空または列が足りなければ PREFERRED_COLUMNS でヘッダー初期化。
 *  - 既存ヘッダーは保持しつつ、PREFERRED_COLUMNS にあって未存在の列は追加。
 *
 * 更新方法 (clasp):
 *  cd gas-recorder
 *  # gas-recorder/コード.js を編集
 *  clasp push -f
 *  clasp redeploy AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw
 */

const SHEET_ID = "1JwwkLThWTMMmi9p1CMGK8gAz-I5f9cmueGFFpplZwGc";
const SHEET_NAME = "form_submissions";
const TZ = "Asia/Tokyo";
const TS_FORMAT = "yyyy-MM-dd HH:mm:ss";

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
  "line_clicked_at",
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

// スプシは "09077778888" を数値 9077778888 として保存することがあるため
// 先頭の 0 を取り除いて比較用に正規化する
function normalizeTel(s) {
  return String(s == null ? "" : s).replace(/[^0-9]/g, '').replace(/^0+/, '');
}

function jsonOk(payload) {
  payload = payload || {};
  payload.ok = true;
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(err) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

// 既存ヘッダーを保持しつつ PREFERRED_COLUMNS の不足列を追加。
function ensureHeader(sheet) {
  var lastCol = sheet.getLastColumn();
  var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var isEmpty = header.length === 0 || header.every(function(h){ return h === "" || h == null; });
  if (isEmpty) {
    header = PREFERRED_COLUMNS.slice();
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    return header;
  }
  var missing = [];
  for (var i = 0; i < PREFERRED_COLUMNS.length; i++) {
    if (header.indexOf(PREFERRED_COLUMNS[i]) === -1) missing.push(PREFERRED_COLUMNS[i]);
  }
  if (missing.length > 0) {
    header = header.concat(missing);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return header;
}

function doPost(e) {
  try {
    var params = {};
    if (e && e.parameter) {
      for (var k in e.parameter) { params[k] = e.parameter[k]; }
    }

    // LINE追加クリックイベントは別ハンドラ（既存行を更新）
    if (params["_event"] === "line_click") {
      return handleLineClick(params);
    }

    // 通常のフォーム送信処理
    params["_received_at"] = toJst(new Date());
    if (params["_submitted_at"]) params["_submitted_at"] = toJst(params["_submitted_at"]);

    var by = params["your-birthday-year"];
    var bm = params["your-birthday-month"];
    var bd = params["your-birthday-day"];
    if (by && bm && bd) {
      params["your-birthday"] = String(by) + "-" + pad2(bm) + "-" + pad2(bd);
    }

    var sheet = getSheet();
    var header = ensureHeader(sheet);

    // params にあって header に無い想定外列も末尾追加
    var newKeys = [];
    for (var pk in params) {
      if (params.hasOwnProperty(pk) && header.indexOf(pk) === -1 && pk !== "_event") {
        newKeys.push(pk);
      }
    }
    if (newKeys.length > 0) {
      header = header.concat(newKeys);
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }

    if (header.length === 0) return jsonOk({ note: "no data" });

    var row = [];
    for (var j = 0; j < header.length; j++) {
      row.push((header[j] in params) ? params[header[j]] : "");
    }
    sheet.appendRow(row);

    return jsonOk();
  } catch (err) {
    return jsonError(err);
  }
}

// LINEボタン押下 (or 自動遷移直前) のイベント。電話番号で最新行を検索し line_clicked_at を JST で更新。
function handleLineClick(params) {
  try {
    var tel = params["your-tel"];
    if (!tel) return jsonOk({ matched: false, note: "no tel" });

    var sheet = getSheet();
    var header = ensureHeader(sheet);

    var telColIdx = header.indexOf("your-tel");
    var lineColIdx = header.indexOf("line_clicked_at");
    if (telColIdx === -1) return jsonOk({ matched: false, note: "no tel col" });
    if (lineColIdx === -1) {
      lineColIdx = header.length;
      header.push("line_clicked_at");
      sheet.getRange(1, lineColIdx + 1).setValue("line_clicked_at");
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonOk({ matched: false, note: "empty" });

    // 電話番号で最新行から後ろ向きに検索（先頭0の差異を正規化）
    var telVals = sheet.getRange(2, telColIdx + 1, lastRow - 1, 1).getValues();
    var telKey = normalizeTel(tel);
    var matchedRow = -1;
    for (var i = telVals.length - 1; i >= 0; i--) {
      if (normalizeTel(telVals[i][0]) === telKey) {
        matchedRow = i + 2;
        break;
      }
    }

    if (matchedRow > 0) {
      sheet.getRange(matchedRow, lineColIdx + 1).setValue(toJst(new Date()));
      return jsonOk({ matched: true, row: matchedRow });
    }
    return jsonOk({ matched: false, note: "no row" });
  } catch (err) {
    return jsonError(err);
  }
}

function doGet() {
  return ContentService.createTextOutput("LP form recorder is alive.")
    .setMimeType(ContentService.MimeType.TEXT);
}
