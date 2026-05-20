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
  "your-email",
  "email_captured_at",
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

    // LINE追加クリックイベント・メール登録イベントは別ハンドラ（既存行を更新）
    if (params["_event"] === "line_click") {
      return handleLineClick(params);
    }
    if (params["_event"] === "email_capture") {
      return handleEmailCapture(params);
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

// thanksページのメール登録イベント。電話番号で最新行を検索し your-email / email_captured_at を更新。
// 該当行が無い場合（電話番号未一致）は新規行として append する。
function handleEmailCapture(params) {
  try {
    var email = params["your-email"];
    var tel = params["your-tel"];
    if (!email) return jsonOk({ matched: false, note: "no email" });

    var sheet = getSheet();
    var header = ensureHeader(sheet);
    var emailColIdx = header.indexOf("your-email");
    var capturedColIdx = header.indexOf("email_captured_at");
    if (emailColIdx === -1) {
      emailColIdx = header.length;
      header.push("your-email");
      sheet.getRange(1, emailColIdx + 1).setValue("your-email");
    }
    if (capturedColIdx === -1) {
      capturedColIdx = header.length;
      header.push("email_captured_at");
      sheet.getRange(1, capturedColIdx + 1).setValue("email_captured_at");
    }
    var nowJst = toJst(new Date());

    if (tel) {
      var telColIdx = header.indexOf("your-tel");
      var lastRow = sheet.getLastRow();
      if (telColIdx !== -1 && lastRow >= 2) {
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
          sheet.getRange(matchedRow, emailColIdx + 1).setValue(email);
          sheet.getRange(matchedRow, capturedColIdx + 1).setValue(nowJst);
          return jsonOk({ matched: true, row: matchedRow });
        }
      }
    }

    // 電話番号が無い or 一致行が無い場合は新規行として append
    params["_received_at"] = nowJst;
    params["email_captured_at"] = nowJst;
    if (params["_submitted_at"]) params["_submitted_at"] = toJst(params["_submitted_at"]);
    var row = [];
    for (var j = 0; j < header.length; j++) {
      row.push((header[j] in params) ? params[header[j]] : "");
    }
    sheet.appendRow(row);
    return jsonOk({ matched: false, appended: true });
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

function doGet(e) {
  // ?setup=legend で凡例シートを構築・更新
  if (e && e.parameter && e.parameter.setup === "legend") {
    var msg = setupColumnsLegend();
    return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput("LP form recorder is alive.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// 凡例シートの中身。カラム名 / 意味 / 備考 の3列
const COLUMNS_LEGEND = [
  ["カラム名", "意味", "備考"],
  ["_received_at", "GAS受信時刻", "サーバー側で記録した日本時間 (yyyy-MM-dd HH:mm:ss)"],
  ["_lp", "送信元LP識別子", "sekoukanri / denkikouji / sekoukanri-doboku / sekoukanri-kentiku / sekoukanri-denkisekou / *-meta / nenshu-shindan-* / thanks / nenshu-shindan-thanks など"],
  ["your-tel", "電話番号", "ハイフンなし11桁。先頭0はスプシで欠落表示することがある"],
  ["your-last-name", "姓", ""],
  ["your-first-name", "名", ""],
  ["your-birthday", "生年月日 (YYYY-MM-DD)", "year/month/day から GAS が自動生成"],
  ["your-birthday-year", "生年（西暦）", ""],
  ["your-birthday-month", "生月", ""],
  ["your-birthday-day", "生日", ""],
  ["your-zip", "郵便番号", "ハイフンなし7桁"],
  ["your-pref", "都道府県", "郵便番号APIから自動入力"],
  ["your-city", "市区町村", "郵便番号APIから自動入力"],
  ["your-license01", "保有資格", "例: 1級電気施工管理技士 / 第二種電気工事士 など"],
  ["your-experience", "実務経験", "例: 施工管理経験 / 現場監督経験 / 設計・積算経験 / 未経験"],
  ["your-willingness", "(未使用)", "現状どのボタンも紐づいておらず常に hidden 初期値「未回答」が入る。フォーム側で未来に使う場合に備えて列だけ残す"],
  ["your-feeling", "転職意欲", "FV(step-first)のラジオ回答: 近いうちに転職したい / 今は情報収集したい"],
  ["your-term", "(未使用)", "現状どのボタンも紐づいておらず常に空。将来用に列だけ残す"],
  ["your-email", "メールアドレス", "thanksページのメール登録フォームで取得。電話番号で既存行に紐付け"],
  ["email_captured_at", "メール登録時刻", "thanksページでメール送信した日本時間。空ならメール未登録"],
  ["line_clicked_at", "LINE追加クリック時刻", "thanksページでLINEボタンを押した(or 自動遷移直前)に記録。空ならLINE未登録"],
  ["_submitted_at", "クライアント送信時刻", "ブラウザがフォーム送信した日本時間"],
  ["_page", "送信時のURL", ""],
  ["_referrer", "流入元URL", "どこからLPに来たか"],
  ["_ip", "IPアドレス", "送信者IP (api.ipify.org経由)"],
  ["_user_agent", "UA文字列", "ブラウザ・デバイス情報"]
];

function setupColumnsLegend() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("columns_legend");
  if (!sheet) {
    sheet = ss.insertSheet("columns_legend");
  } else {
    sheet.clear();
  }
  sheet.getRange(1, 1, COLUMNS_LEGEND.length, 3).setValues(COLUMNS_LEGEND);
  sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#f0f0f0");
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 500);
  sheet.setFrozenRows(1);
  return "columns_legend updated: " + COLUMNS_LEGEND.length + " rows";
}
