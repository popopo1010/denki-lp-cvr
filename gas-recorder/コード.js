/**
 * LPフォーム送信 → Google Sheets 記録
 *
 * 仕様:
 *  - フォーム送信 (_event 無し): 新規行を append。タイムスタンプは日本時間 (Asia/Tokyo)。
 *  - LINE追加クリック (_event=line_click): 電話番号で既存行を検索して line_clicked_at を更新。
 *  - 面談予約確定 (_event=calendar_booked / book_slot / TimeRex Webhook): 電話/メールで行更新 + Slack通知。
 *  - 独自予約の空き枠 (doGet ?action=slots): Googleカレンダーから JSONP 返却。
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
  "your-term",
  "your-email",
  "email_captured_at",
  "line_clicked_at",
  "calendar_booked_at",
  "calendar_start",
  "calendar_end",
  "calendar_guest_name",
  "calendar_guest_email",
  "calendar_tool",
  "calendar_id",
  "calendar_event_id",
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

function getScriptProp(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

function webhookAuthorized(e) {
  var secret = getScriptProp("WEBHOOK_SECRET");
  if (!secret) return true;
  return e && e.parameter && e.parameter.key === secret;
}

function doPost(e) {
  try {
    if (!webhookAuthorized(e)) {
      return jsonError("unauthorized");
    }

    // TimeRex 等からの JSON Webhook
    if (e && e.postData && e.postData.contents) {
      var raw = e.postData.contents;
      if (raw.charAt(0) === "{") {
        return handleTimerexWebhook(JSON.parse(raw));
      }
    }

    var params = mergeRequestParams(e, {});

    // LINE追加クリックイベント・メール登録イベントは別ハンドラ（既存行を更新）
    if (params["_event"] === "line_click") {
      return handleLineClick(params);
    }
    if (params["_event"] === "email_capture") {
      return handleEmailCapture(params);
    }
    if (params["_event"] === "calendar_booked") {
      return handleCalendarBooked(params);
    }
    if (params["_event"] === "book_slot") {
      return handleBookSlot(params);
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

function postToSlack(text) {
  var url = getScriptProp("SLACK_WEBHOOK_URL");
  if (!url) return { ok: false, note: "no slack url" };
  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  });
  return { ok: res.getResponseCode() >= 200 && res.getResponseCode() < 300 };
}

function findLatestRowByTelOrEmail(sheet, header, tel, email) {
  var telColIdx = header.indexOf("your-tel");
  var emailColIdx = header.indexOf("your-email");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  if (tel && telColIdx !== -1) {
    var telKey = normalizeTel(tel);
    var telVals = sheet.getRange(2, telColIdx + 1, lastRow - 1, 1).getValues();
    for (var i = telVals.length - 1; i >= 0; i--) {
      if (normalizeTel(telVals[i][0]) === telKey) return i + 2;
    }
  }
  if (email && emailColIdx !== -1) {
    var emailKey = String(email).toLowerCase().trim();
    var emailVals = sheet.getRange(2, emailColIdx + 1, lastRow - 1, 1).getValues();
    for (var j = emailVals.length - 1; j >= 0; j--) {
      if (String(emailVals[j][0]).toLowerCase().trim() === emailKey) return j + 2;
    }
  }
  return -1;
}

function ensureColumn(sheet, header, colName) {
  var idx = header.indexOf(colName);
  if (idx !== -1) return idx;
  idx = header.length;
  header.push(colName);
  sheet.getRange(1, idx + 1).setValue(colName);
  return idx;
}

function updateRowColumns(sheet, header, rowNum, updates) {
  for (var key in updates) {
    if (!updates.hasOwnProperty(key) || updates[key] === "" || updates[key] == null) continue;
    var colIdx = ensureColumn(sheet, header, key);
    sheet.getRange(rowNum, colIdx + 1).setValue(updates[key]);
  }
}

// TimeRex Webhook / Zapier からの予約確定
function handleCalendarBooked(params) {
  try {
    var nowJst = toJst(new Date());
    params.calendar_booked_at = params.calendar_booked_at || nowJst;
    params.calendar_tool = params.calendar_tool || "TimeRex";

    var sheet = getSheet();
    var header = ensureHeader(sheet);
    var matchedRow = findLatestRowByTelOrEmail(
      sheet,
      header,
      params["your-tel"] || params["guest_phone"] || params["calendar_guest_phone"],
      params["your-email"] || params["guest_email"] || params["calendar_guest_email"]
    );

    var updates = {
      calendar_booked_at: params.calendar_booked_at,
      calendar_start: params.calendar_start || "",
      calendar_end: params.calendar_end || "",
      calendar_guest_name: params.calendar_guest_name || params["guest_name"] || "",
      calendar_guest_email: params.calendar_guest_email || params["guest_email"] || "",
      calendar_tool: params.calendar_tool,
      calendar_id: params.calendar_id || "",
      calendar_event_id: params.calendar_event_id || ""
    };

    if (matchedRow > 0) {
      updateRowColumns(sheet, header, matchedRow, updates);
    } else {
      params["_received_at"] = nowJst;
      params["your-tel"] = params["your-tel"] || params["guest_phone"] || "";
      params["your-email"] = params["your-email"] || params["guest_email"] || "";
      var row = [];
      for (var j = 0; j < header.length; j++) {
        var h = header[j];
        row.push((h in params) ? params[h] : ((h in updates) ? updates[h] : ""));
      }
      sheet.appendRow(row);
    }

    var slackText = buildCalendarSlackMessage(params);
    var slackResult = postToSlack(slackText);

    return jsonOk({
      matched: matchedRow > 0,
      row: matchedRow,
      slack: slackResult
    });
  } catch (err) {
    return jsonError(err);
  }
}

function buildCalendarSlackMessage(params) {
  var start = params.calendar_start || params["local_start_datetime"] || params["start"] || "";
  var end = params.calendar_end || params["local_end_datetime"] || params["end"] || "";
  var name = params.calendar_guest_name || params["guest_name"] || "";
  var tel = params["your-tel"] || params["guest_phone"] || params["your_tel"] || "";
  var lp = params["_lp"] || params["lp_id"] || "";

  var when = start || "（日時はTimeRex管理画面で要確認）";
  if (start && end) when = start + " 〜 " + end;

  var tool = params.calendar_tool || "TimeRex";
  var lines = [
    ":calendar: *面談予約*（" + tool + "）",
    "*日時:* " + when
  ];
  if (name) lines.push("*名前:* " + name);
  if (tel) lines.push("*電話:* " + tel);
  if (lp) lines.push("*LP:* " + lp);
  return lines.join("\n");
}

function flattenJson(obj, out, prefix) {
  if (obj == null) return;
  if (typeof obj !== "object") {
    if (prefix) out[prefix] = obj;
    return;
  }
  if (obj instanceof Array) {
    for (var i = 0; i < obj.length; i++) flattenJson(obj[i], out, prefix);
    return;
  }
  for (var k in obj) {
    if (!obj.hasOwnProperty(k)) continue;
    var v = obj[k];
    var key = prefix ? (prefix + "." + k) : k;
    if (v && typeof v === "object") flattenJson(v, out, key);
    else out[key] = v;
  }
}

function pickFromFlat(flat, keys) {
  for (var i = 0; i < keys.length; i++) {
    for (var path in flat) {
      if (!flat.hasOwnProperty(path)) continue;
      if (path === keys[i] || path.indexOf(keys[i]) !== -1) {
        var val = flat[path];
        if (val !== "" && val != null) return String(val);
      }
    }
  }
  return "";
}

function handleTimerexWebhook(json) {
  var flat = {};
  flattenJson(json, flat, "");
  var params = {
    _event: "calendar_booked",
    calendar_tool: "TimeRex",
    calendar_start: pickFromFlat(flat, ["local_start_datetime", "start_datetime", "start_at", "start_time", "starts_at", "datetime", "date"]),
    calendar_end: pickFromFlat(flat, ["local_end_datetime", "end_datetime", "end_at", "end_time", "ends_at", "end"]),
    calendar_guest_name: pickFromFlat(flat, ["guest_name", "lp_guest_name", "name", "guest.name"]),
    calendar_guest_email: pickFromFlat(flat, ["guest_email", "email", "guest.email"]),
    "your-tel": pickFromFlat(flat, ["your_tel", "guest_phone", "phone", "tel", "mobile", "your-tel"]),
    "guest_phone": pickFromFlat(flat, ["guest_phone", "phone", "tel", "mobile"]),
    "guest_email": pickFromFlat(flat, ["guest_email", "email"]),
    lp_id: pickFromFlat(flat, ["lp_id", "lp_source"])
  };
  return handleCalendarBooked(params);
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "slots") {
    return handleSlotsRequest(e);
  }
  if (e && e.parameter && e.parameter.action === "book") {
    return handleBookRequest(e);
  }
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
  ["your-willingness", "転職意欲", "FV(step-first)のラジオ回答: 近いうちに転職したい / 今は情報収集したい"],
  ["your-term", "(未使用)", "現状どのボタンも紐づいておらず常に空。将来用に列だけ残す"],
  ["your-email", "メールアドレス", "thanksページのメール登録フォームで取得。電話番号で既存行に紐付け"],
  ["email_captured_at", "メール登録時刻", "thanksページでメール送信した日本時間。空ならメール未登録"],
  ["line_clicked_at", "LINE追加クリック時刻", "thanksページでLINEボタンを押した(or 自動遷移直前)に記録。空ならLINE未登録"],
  ["calendar_booked_at", "面談予約確定時刻", "TimeRex Webhook または _event=calendar_booked で記録"],
  ["calendar_start", "面談開始日時", "TimeRex 予約の開始"],
  ["calendar_end", "面談終了日時", "TimeRex 予約の終了"],
  ["calendar_guest_name", "予約者名", "TimeRex ゲスト名"],
  ["calendar_guest_email", "予約者メール", "TimeRex ゲストメール"],
  ["calendar_tool", "予約ツール名", "TimeRex / 独自予約 など"],
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
