/**
 * LPフォーム送信 → Google Sheets 記録
 *
 * 仕様:
 *  - フォーム送信 (_event 無し): 新規行を append。タイムスタンプは日本時間 (Asia/Tokyo)。
 *  - LINE追加クリック (_event=line_click): 電話番号で既存行を検索して line_clicked_at を更新。
 *  - 面談予約確定 (_event=calendar_booked / book_slot / TimeRex Webhook): 電話/メールで行更新 + Slack通知。
 *  - 独自予約の空き枠 (doGet ?action=slots): Googleカレンダーから JSONP 返却。
 *  - 生年月日は year/month/day から "1990-10-10" 形式の your-birthday 列に集約。
 *  - _page のクエリ文字列から utm_* / gclid 等の広告・計測パラメーターを個別列に自動展開
 *    (TRACKING_PARAM_COLUMNS)。LP側の変更は不要。
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

// _page（送信時URL）のクエリ文字列から個別列に展開する広告・計測パラメーター。
// この配列が唯一の定義元。PREFERRED_COLUMNS には _referrer の直後に自動挿入される。
// 追加・削除したら COLUMNS_LEGEND（?setup=legend の凡例）にも説明を反映すること。
const TRACKING_PARAM_COLUMNS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "gad_source",
  "gad_campaignid",
  "yclid",
  "fbclid",
  "msclkid"
];

const PREFERRED_COLUMNS = [
  "_received_at",
  "_lp",
  "_test",
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
  "calendar_staff_id",
  "calendar_staff_name",
  "slack_thread_ts",
  "slack_channel_id",
  "slack_error",
  "thanks_reached_at",
  "_recovered",
  "_recovered_merged_at",
  "calendar_event_id",
  "zoho_deal_id",
  "zoho_synced_at",
  "zoho_error",
  "_submitted_at",
  "_page",
  "_referrer",
  ...TRACKING_PARAM_COLUMNS,
  "_ip",
  "_user_agent"
];

function decodeParam(s) {
  try {
    return decodeURIComponent(String(s).replace(/\+/g, " "));
  } catch (e) {
    return String(s);
  }
}

// URL のクエリ文字列を { key: value } に分解する（先勝ちで重複キーは無視）。
function parseQueryParams(url) {
  var out = {};
  if (!url) return out;
  var q = String(url);
  var hashIdx = q.indexOf("#");
  if (hashIdx !== -1) q = q.substring(0, hashIdx);
  var qIdx = q.indexOf("?");
  if (qIdx === -1) return out;
  q = q.substring(qIdx + 1);
  var pairs = q.split("&");
  for (var i = 0; i < pairs.length; i++) {
    if (!pairs[i]) continue;
    var eqIdx = pairs[i].indexOf("=");
    var key = eqIdx === -1 ? pairs[i] : pairs[i].substring(0, eqIdx);
    var val = eqIdx === -1 ? "" : pairs[i].substring(eqIdx + 1);
    key = decodeParam(key);
    val = decodeParam(val);
    if (key && !(key in out)) out[key] = val;
  }
  return out;
}

// _page の URL から TRACKING_PARAM_COLUMNS を抜き出し、未設定の列だけ params に展開する。
function applyTrackingParams(params) {
  var url = params["_page"] || params["_referrer"];
  if (!url) return;
  var q = parseQueryParams(url);
  for (var i = 0; i < TRACKING_PARAM_COLUMNS.length; i++) {
    var col = TRACKING_PARAM_COLUMNS[i];
    if (params[col] != null && params[col] !== "") continue;
    if (q[col] != null && q[col] !== "") params[col] = q[col];
  }
}

/**
 * 既存の全行の _page（無ければ _referrer）を遡って広告・計測パラメーターを個別列へ埋める。
 * 空セルのみ埋め、既存の値は上書きしない（安全・冪等）。何度実行してもよい。
 * 実行方法: GAS エディタで関数 backfillTrackingParams を選択して実行、または
 *           Webアプリで …/exec?action=backfill_params&key=<WEBHOOK_SECRET> を開く。
 * 戻り値: 処理概要の文字列（行数・埋めたセル数）。
 */
function backfillTrackingParams() {
  var sheet = getSheet();
  var header = ensureHeader(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "no data rows";

  var pageIdx = header.indexOf("_page");
  var referrerIdx = header.indexOf("_referrer");
  if (pageIdx === -1 && referrerIdx === -1) return "no _page/_referrer column";

  // 対象列を確保（未存在なら作成）してインデックスを控える
  var colIdx = {};
  for (var t = 0; t < TRACKING_PARAM_COLUMNS.length; t++) {
    colIdx[TRACKING_PARAM_COLUMNS[t]] = ensureColumn(sheet, header, TRACKING_PARAM_COLUMNS[t]);
  }
  var lastCol = header.length;

  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var filled = 0;
  var rowsTouched = 0;
  for (var r = 0; r < values.length; r++) {
    var url = "";
    if (pageIdx !== -1 && values[r][pageIdx]) url = values[r][pageIdx];
    else if (referrerIdx !== -1 && values[r][referrerIdx]) url = values[r][referrerIdx];
    if (!url) continue;
    var q = parseQueryParams(String(url));
    var touched = false;
    for (var k = 0; k < TRACKING_PARAM_COLUMNS.length; k++) {
      var col = TRACKING_PARAM_COLUMNS[k];
      var ci = colIdx[col];
      var cur = values[r][ci];
      if (cur !== "" && cur != null) continue; // 既存値は保持
      if (q[col] != null && q[col] !== "") {
        values[r][ci] = q[col];
        filled++;
        touched = true;
      }
    }
    if (touched) rowsTouched++;
  }

  sheet.getRange(2, 1, values.length, lastCol).setValues(values);
  var msg = "backfill done: data_rows=" + values.length +
            " rows_updated=" + rowsTouched + " cells_filled=" + filled;
  Logger.log(msg);
  return msg;
}

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

var _scriptProps = null;
function getScriptProp(key) {
  if (!_scriptProps) {
    _scriptProps = PropertiesService.getScriptProperties().getProperties();
  }
  return _scriptProps[key] || "";
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
    if (params["_event"] === "thanks_reached") {
      return handleThanksReached(params);
    }

    // 通常のフォーム送信処理
    params["_received_at"] = toJst(new Date());
    if (params["_submitted_at"]) params["_submitted_at"] = toJst(params["_submitted_at"]);

    // _page のクエリ文字列から広告・計測パラメーターを個別列に展開
    applyTrackingParams(params);

    // テスト送信の判定（2026-08-30）。テストも**シートには必ず残す**（黙って捨てると
    // 「届いていない」誤認を生む）。_test はLP側判定の同送値。LP側が古い場合に備えて
    // サーバー側でも STGのURL・明らかなテストパターンを見て補完する。
    // テストの扱い: シート=残す / Slack=【テスト送信】表記・@channelなし /
    // Zoho=商談を作らない（zohoIsTestSubmission が _test と _page を見る）。
    var testReason = detectTestSubmission(params);
    if (testReason) params["_test"] = testReason;

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

    // thanks到達ピンが本体より先に着いて救済行（_recovered=thanks_ping）が立っていたら、
    // 新しい行を足さずにその行へ合流する（2026-10-01 誤警報の後始末）。
    // 合流しないと「同じ人の行が2つ・@channelが2回・backfillで名前と電話だけの重複商談」になる。
    // 「救済行を探す→追記/合流」はロック内で一体に行う。ピン側（handleThanksReached）も
    // 「最終確認→救済行の追記」を同じロック内で行うので、探索と追記の隙間に相手が割り込んで
    // 同じ人の行が2つになる競合（2026-10-04 に閉じた最後の隙間）は起きない。
    var rescue = null;
    var newRow = withScriptLock(function (locked) {
      rescue = findRecentRescueRow(sheet, header, params["your-tel"]);
      if (rescue) {
        mergeIntoRescueRow(sheet, header, rescue, params);
        return rescue.row;
      }
      return appendRowAndGetIndex(sheet, sheetSafeRow(row), { locked: locked });
    });
    var slackLead = rescue ? notifySlackRescueMerged(params, rescue) : notifySlackNewLead(params);
    if (slackLead.ok && slackLead.ts) {
      updateRowColumns(sheet, header, newRow, {
        slack_thread_ts: String(slackLead.ts),
        slack_channel_id: slackLead.channel || getScriptProp("SLACK_LEAD_CHANNEL_ID")
      });
    } else {
      // Slack通知の失敗を必ず痕跡に残す（2026-08-30）。以前は ok:false でも黙って
      // 続行していたため、通知が落ちた日に検知する手段がなかった。
      var slackErr = slackLead.error || slackLead.note || "notify failed";
      updateRowColumns(sheet, header, newRow, { slack_error: String(slackErr) });
      reportErrorToSlack("slack_lead_notify (row " + newRow + ")", slackErr);
    }

    // Zoho CRM 商談の自動作成。失敗してもスプシ記録とSlack通知は止めない。
    var zohoDeal = syncDealToZoho(params);
    if (zohoDeal.ok) {
      updateRowColumns(sheet, header, newRow, {
        zoho_deal_id: zohoDeal.id,
        zoho_synced_at: toJst(new Date()),
        // 項目を直して作り直した場合は痕跡を残す（無言で値が変わると後で追えない）
        zoho_error: zohoDeal.repaired ? ("repaired: " + zohoDeal.repaired) : ""
      });
    } else if (zohoDeal.error) {
      updateRowColumns(sheet, header, newRow, { zoho_error: zohoDeal.error });
      reportErrorToSlack("zoho_deal_create", zohoDeal.error);
    } else if (zohoDeal.skipped && zohoDeal.skipped !== "disabled") {
      updateRowColumns(sheet, header, newRow, { zoho_error: "skipped: " + zohoDeal.skipped });
    }

    // 合流できずに残った救済行（合流機能より前の行・24時間の窓を外れた行）を、送信のついでに片付ける。
    // 二重行のまま放置すると backfill で重複商談・代理店共有で候補者数の水増しになる。
    var sweep = null;
    try {
      sweep = sweepOrphanRescueRows(sheet, header);
    } catch (sweepErr) {
      console.log("sweepOrphanRescueRows: " + sweepErr);
    }

    // 除外IPの自動更新（1日1回・その日最初の送信のついで）。トリガーをコードで作ると
    // script.scriptapp スコープの再認可が要り、未認可の間は送信の記録ごと止まるため使わない。
    try {
      if (typeof maybeRefreshExcludeIpsDaily === "function") maybeRefreshExcludeIpsDaily();
    } catch (exErr) {
      console.log("maybeRefreshExcludeIpsDaily: " + exErr);
    }

    return jsonOk({ slack_lead: slackLead, zoho_deal: zohoDeal, row: newRow, merged_into_rescue: !!rescue, sweep: sweep });
  } catch (err) {
    reportErrorToSlack("doPost", err);
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
          sheet.getRange(matchedRow, emailColIdx + 1).setValue(sheetSafeCell(email));
          sheet.getRange(matchedRow, capturedColIdx + 1).setValue(nowJst);
          // 紐づく商談があればメールアドレスをZohoにも反映する
          var zohoUpdate = updateZohoDealFromRow(sheet, header, matchedRow);
          return jsonOk({ matched: true, row: matchedRow, zoho_deal: zohoUpdate });
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
    sheet.appendRow(sheetSafeRow(row));
    return jsonOk({ matched: false, appended: true });
  } catch (err) {
    return jsonError(err);
  }
}

// thanks到達ピンが本体を待つ時間。5秒×6回＝最長30秒（GASの1実行6分には十分収まる）。
// 2026-10-01 の誤警報（8秒1回で足りなかった）を受けて多段化。値を縮めるときは
// docs/release-incidents.md 2026-10-01 を読んでから。
var THANKS_PING_WAIT_STEP_MS = 5000;
var THANKS_PING_WAIT_ROUNDS = 6;
// 本体到着時に合流対象とする救済行の新しさ。Zoho の重複判定（ZOHO_DEDUP_HOURS）と同じ24時間。
var RESCUE_MERGE_HOURS = 24;

/**
 * thanks到達ピン（2026-08-30 リード消失盲点の対策）。
 * LPのフォーム送信後、thanksページ（qualified）から電話番号つきで1本届く。
 * 正常時: 電話番号で送信行が見つかる → thanks_reached_at を記録するだけ（到達の裏取り）。
 * 異常時: 送信行が見つからない ＝ フォーム送信がZapier/GASの**両方に届かなかった疑い**
 *（従来はCVだけ発火してどこにも痕跡が残らなかった）。救済行を残し、@channelで警報を出す。
 * 誤警報対策: 送信ビーコンとピンはほぼ同時に飛ぶため、見つからない場合は8秒待って再検索する
 *（クライアント側もピンは thanks 表示後＝送信の数秒後）。テスト（_test付き）は警報を鳴らさない。
 */
function handleThanksReached(params) {
  try {
    var tel = String(params["your-tel"] || "").trim();
    var nowJst = toJst(new Date());
    var sheet = getSheet();
    var header = ensureHeader(sheet);

    var row = tel ? findLatestRowByTelOrEmail(sheet, header, tel, "") : -1;
    // 送信ビーコンとの競合（ピンが先に着いた）を吸収する。
    // 2026-10-01: 8秒1回では足りず誤警報が出た（本体の sendBeacon がブラウザ側で遅延し、
    // さらに GAS の起動待ちが乗ると 8秒を超える）。短い間隔で複数回見に行き、
    // 合計 THANKS_PING_WAIT_ROUNDS × THANKS_PING_WAIT_STEP_MS（30秒）まで待つ。
    // それでも無ければ救済行を立てる。本体がその後に届いたら doPost が救済行へ合流する
    //（findRecentRescueRow / mergeIntoRescueRow）ので、ここで誤警報になっても二重にはならない。
    var waitedMs = 0;
    for (var attempt = 0; row === -1 && tel && attempt < THANKS_PING_WAIT_ROUNDS; attempt++) {
      Utilities.sleep(THANKS_PING_WAIT_STEP_MS);
      waitedMs += THANKS_PING_WAIT_STEP_MS;
      row = findLatestRowByTelOrEmail(sheet, header, tel, "");
    }

    if (row !== -1) {
      markThanksReached(sheet, header, row, nowJst);
      return jsonOk({ matched: true, row: row, waited_ms: waitedMs });
    }

    // 送信行が無い＝消失の疑い。届いた情報だけで救済行を残す。
    if (params["_name"] && !params["your-last-name"]) params["your-last-name"] = params["_name"];
    var testReason = detectTestSubmission(params);
    if (testReason) params["_test"] = testReason;
    params["_received_at"] = nowJst;
    params["_recovered"] = "thanks_ping";
    params["thanks_reached_at"] = nowJst;
    ensureColumn(sheet, header, "_recovered");
    ensureColumn(sheet, header, "thanks_reached_at");
    var rowVals = [];
    for (var j = 0; j < header.length; j++) {
      rowVals.push((header[j] in params) ? params[header[j]] : "");
    }
    // 「最終確認→救済行の追記」はロック内で一体に行う（doPost 側の「救済行を探す→追記/合流」と
    // 同じロック）。待ち切った直後に本体が追記していた場合はここで拾えるので二重行にならない。
    var lateRow = -1;
    var newRow = withScriptLock(function (locked) {
      lateRow = tel ? findLatestRowByTelOrEmail(sheet, header, tel, "") : -1;
      if (lateRow !== -1) return lateRow;
      return appendRowAndGetIndex(sheet, sheetSafeRow(rowVals), { locked: locked });
    });
    if (lateRow !== -1) {
      markThanksReached(sheet, header, lateRow, nowJst);
      return jsonOk({ matched: true, row: lateRow, waited_ms: waitedMs, late: true });
    }

    var text;
    if (testReason) {
      text = ":test_tube: 【テスト送信】thanks到達のみ検知（送信本体なし・種別: " + testReason + "）\n" +
        "●電話番号：" + slackSafe(tel) + "\n●LP：" + slackSafe(params["_lp"] || "");
    } else {
      text = "<!channel> :rotating_light: *送信消失の疑い（救済リード）*\n" +
        "thanksページ到達を検知しましたが、フォーム送信本体がシートに届いていません。\n" +
        "届いた情報だけで記録しました。**本物のリードとして架電してください。**\n" +
        "●名前：" + slackSafe(params["_name"] || "不明") + "\n" +
        "●電話番号：" + slackSafe(tel || "不明") + "\n" +
        "●LP：" + slackSafe(params["_lp"] || "不明") + "\n" +
        "_資格・都道府県などの詳細は取得できていません（送信データが消失）_";
    }
    var slackRes = postSlackChatMessage({ text: text });
    if (slackRes.ok && slackRes.ts) {
      updateRowColumns(sheet, header, newRow, {
        slack_thread_ts: String(slackRes.ts),
        slack_channel_id: slackRes.channel || getScriptProp("SLACK_LEAD_CHANNEL_ID")
      });
    } else {
      var pingSlackErr = slackRes.error || slackRes.note || "notify failed";
      updateRowColumns(sheet, header, newRow, { slack_error: String(pingSlackErr) });
      reportErrorToSlack("thanks_ping_recovery (row " + newRow + ")", pingSlackErr);
    }
    return jsonOk({ matched: false, recovered: true, row: newRow, waited_ms: waitedMs });
  } catch (err) {
    reportErrorToSlack("handleThanksReached", err);
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
      // 紐づく商談があれば LINE登録済みをZohoにも反映する
      var zohoUpdate = updateZohoDealFromRow(sheet, header, matchedRow);
      return jsonOk({ matched: true, row: matchedRow, zoho_deal: zohoUpdate });
    }
    return jsonOk({ matched: false, note: "no row" });
  } catch (err) {
    return jsonError(err);
  }
}

/** GAS 内で catch した例外を Slack に報告する */
function reportErrorToSlack(context, err) {
  try {
    var channel = getScriptProp("SLACK_ERROR_CHANNEL_ID") || getScriptProp("SLACK_LEAD_CHANNEL_ID");
    if (!channel) return;
    var token = getScriptProp("SLACK_BOT_TOKEN");
    if (!token) return;
    var ts = Utilities.formatDate(new Date(), TZ, TS_FORMAT);
    var msg = ":warning: *GAS エラー*\n"
            + "*場所:* " + context + "\n"
            + "*エラー:* " + String(err) + "\n"
            + "*時刻:* " + ts;
    UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify({ channel: channel, text: msg }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("reportErrorToSlack failed: " + e);
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

function slackBotEnabled() {
  return !!(
    getScriptProp("SLACK_BOT_TOKEN") && getScriptProp("SLACK_LEAD_CHANNEL_ID")
  );
}

/** Slack Bot トークンが有効か（投稿せず auth.test のみ） */
function slackAuthTest() {
  var token = getScriptProp("SLACK_BOT_TOKEN");
  if (!token) return { ok: false, note: "no token" };
  var res = UrlFetchApp.fetch("https://slack.com/api/auth.test", {
    method: "post",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  });
  var json = {};
  try {
    json = JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, error: "invalid slack response" };
  }
  return {
    ok: !!json.ok,
    team: json.team || "",
    team_id: json.team_id || "",
    user: json.user || "",
    user_id: json.user_id || "",
    bot_id: json.bot_id || "",
    error: json.error || ""
  };
}

/** ?action=slack_health — Bot 設定・auth.test（チャンネルには投稿しない） */
function getSlackBotHealthPayload() {
  var payload = {
    checked_at: toJst(new Date()),
    bot_enabled: slackBotEnabled(),
    bot_token_set: !!getScriptProp("SLACK_BOT_TOKEN"),
    lead_channel_set: !!getScriptProp("SLACK_LEAD_CHANNEL_ID"),
    lead_channel_id: getScriptProp("SLACK_LEAD_CHANNEL_ID")
      ? "(set)"
      : "",
    mention_ca_set: !!getScriptProp("SLACK_MENTION_CA"),
    webhook_fallback_set: !!getScriptProp("SLACK_WEBHOOK_URL"),
    auth: { ok: false, note: "slack bot off" }
  };
  if (payload.bot_enabled) {
    try {
      payload.auth = slackAuthTest();
    } catch (err) {
      payload.auth = {
        ok: false,
        note:
          "auth.test は GAS エディタの testSlackBotHealth で実行してください（Webアプリ初回は外部接続の再承認が必要な場合あり）",
        error: String(err)
      };
    }
  }
  return payload;
}

function handleSlackHealthRequest(e) {
  if (!webhookAuthorized(e)) return jsonError("unauthorized");
  return jsonOk(getSlackBotHealthPayload());
}

/** GASエディタ: testSlackBotHealth → 実行ログで Bot 状態を確認 */
function testSlackBotHealth() {
  var info = getSlackBotHealthPayload();
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

function postSlackChatMessage(options) {
  options = options || {};
  var token = getScriptProp("SLACK_BOT_TOKEN");
  var channel = options.channel || getScriptProp("SLACK_LEAD_CHANNEL_ID");
  if (!token || !channel) return { ok: false, note: "slack bot not configured" };
  var body = {
    channel: channel,
    text: options.text || "",
    unfurl_links: false,
    unfurl_media: false
  };
  if (options.thread_ts) body.thread_ts = String(options.thread_ts);
  var res = UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var json = {};
  try {
    json = JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, error: "invalid slack response" };
  }
  return {
    ok: !!json.ok,
    ts: json.ts || "",
    channel: json.channel || channel,
    error: json.error || ""
  };
}

/**
 * テスト送信の判定（2026-08-30）。空文字=本物のリード、非空=テスト種別。
 * ①LP側判定の同送値 _test（stg / param / pattern）
 * ②_page がSTG（/denki-lp-cvr-stg/）から来ている
 * ③除外IP（EXCLUDE_IPS）からの送信
 * ④明らかなテストパターン（zoho.js の zohoIsTestSubmission と同じ基準）
 * 本物っぽい入力での本番テストは機械判定できないため、運用ルールとして
 * 「本番で試すときはURLに ?dk_test=1 を付ける」を守ること（CLAUDE.md）。
 */
function detectTestSubmission(params) {
  var t = String(params["_test"] || "").trim();
  if (t) return t;
  if (String(params["_page"] || "").indexOf("/denki-lp-cvr-stg/") !== -1) return "stg";
  if (isExcludedIp(params["_ip"])) return "ip";
  try {
    if (typeof zohoIsTestSubmission === "function" && zohoIsTestSubmission(params)) return "pattern";
  } catch (e) { /* noop */ }
  return "";
}

/**
 * Slack の text に差し込むユーザー入力の無害化。& < > を Slack 指定のエンティティにする。
 * 姓に <!channel> や <https://…|正規サイト> を入れられると、全員メンションやリンク偽装になる
 * （フォームは誰でも送れる）。見出しの <!channel> はコード側の固定文なので対象外。
 */
function slackSafe(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 除外IP（2026-10-10）。「除外IP」タブ（exclude-ips.js）と、スクリプトプロパティ EXCLUDE_IPS に、カンマ・空白・改行区切りで
 * IPv4/IPv6 の完全一致、または IPv4 の CIDR（例 203.0.113.0/24）を書く。
 * 一致した送信は**捨てずにテスト扱い**（_test=ip）＝シートに残り、Slackは【テスト送信】表記・
 * @channelなし、Zoho商談は作らない。LPも doGet ?action=ip_check で照会し、送信前に
 * _test=ip を立てて thanks の lead_conversion（広告CV）を止める。社内・無効リードの発信元を数字から外すための仕組み。
 */
function isExcludedIp(ip) {
  ip = String(ip || "").trim();
  if (!ip) return false;
  var list = String(getScriptProp("EXCLUDE_IPS") || "").split(/[\s,]+/);
  // 「除外IP」タブ（.htaccess の貼り付け＋refreshExcludeIps の追加分。exclude-ips.js）
  if (typeof getExcludeIpSheetList === "function") list = list.concat(getExcludeIpSheetList());
  // 完全一致を先に（大半はこれ）。CIDR は範囲指定の行だけ順に見る
  if (list.indexOf(ip) !== -1) return true;
  for (var i = 0; i < list.length; i++) {
    if (list[i].indexOf("/") !== -1 && ipv4InCidr(ip, list[i].trim())) return true;
  }
  return false;
}

function ipv4ToInt(ip) {
  var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip));
  if (!m) return null;
  var n = 0;
  for (var i = 1; i <= 4; i++) {
    var o = Number(m[i]);
    if (o > 255) return null;
    n = n * 256 + o;
  }
  return n;
}

function ipv4InCidr(ip, cidr) {
  var parts = String(cidr).split("/");
  var bits = Number(parts[1]);
  var a = ipv4ToInt(ip), b = ipv4ToInt(parts[0]);
  if (a === null || b === null || !(bits >= 0 && bits <= 32) || parts[1] === "") return false;
  var size = Math.pow(2, 32 - bits);
  return Math.floor(a / size) === Math.floor(b / size);
}

function buildLeadSlackMessage(params) {
  var last = params["your-last-name"] || "";
  var first = params["your-first-name"] || "";
  var name = (last + " " + first).trim();
  if (!name) name = params.calendar_guest_name || params["guest_name"] || "";
  var tel        = params["your-tel"] || params["guest_phone"] || "";
  var lp         = params["_lp"] || params["lp_id"] || "";
  var pref       = params["your-pref"] || "不明";
  var city       = params["your-city"] || "";
  var location   = city ? pref + city : pref;
  var byear      = params["your-birthday-year"] || "";
  var bmonth     = params["your-birthday-month"] || "";
  var bday       = params["your-birthday-day"] || "";
  // 現行LPは生まれ年のみ収集。年だけのとき「1990//」と崩れないようにする
  var birthday   = params["your-birthday"] ||
    (byear && bmonth && bday ? byear + "/" + bmonth + "/" + bday :
     byear ? byear + "年生まれ（年のみ回答）" : "");
  var willingness = params["your-willingness"] || "";
  var license    = params["your-license01"] || "";
  var experience = params["your-experience"] || "";
  var keyword    = params["your-term"] || "";
  var ip         = params["_ip"] || "";
  // テスト送信は @channel を鳴らさず、テストだと一目で分かる見出しにする（2026-08-30）。
  // 通知自体は出す（テストが届いた事実を運用が確認できるように。**消さないこと**——
  // 通知を後から削除すると「リードが届いていない」誤認を生む）。
  var testReason = String(params["_test"] || "").trim();
  var lines = [testReason
    ? ":test_tube: *【テスト送信】LP登録テスト（種別: " + testReason + "・Zoho登録なし）*"
    : "<!channel> :inbox_tray: *新規リード（LP登録）*"];
  lines.push("●名前：" + slackSafe(name));
  lines.push("●電話番号：" + slackSafe(tel));
  lines.push("●都道府県：" + slackSafe(location));
  if (birthday)   lines.push("●生年月日：" + slackSafe(birthday));
  if (willingness) lines.push("●転職意思：" + slackSafe(willingness));
  if (license)    lines.push("●保有資格：" + slackSafe(license));
  if (experience) lines.push("●経験：" + slackSafe(experience));
  lines.push("●キーワード：" + slackSafe(keyword));
  lines.push("●IP：" + slackSafe(ip));
  lines.push("●LP：" + slackSafe(lp));
  lines.push("_このスレッドに面談予約の返信が届きます_");
  return lines.join("\n");
}

function notifySlackNewLead(params) {
  if (!slackBotEnabled()) return { ok: false, note: "slack bot off" };
  return postSlackChatMessage({ text: buildLeadSlackMessage(params) });
}

function getSlackCaMention() {
  // SLACK_MENTION_CA は <!subteam^S...|@ca> 形式のほか、S.../U... の生IDも受け付ける
  var raw = String(getScriptProp("SLACK_MENTION_CA") || "").trim();
  if (!raw) return "";
  if (raw.charAt(0) === "<") return raw;
  var id = raw.replace(/^@/, "");
  if (/^U[A-Z0-9]+$/.test(id)) return "<@" + id + ">";
  if (/^S[A-Z0-9]+$/.test(id)) return "<!subteam^" + id + ">";
  return raw;
}

function buildBookingThreadSlackMessage(params) {
  var ca = getSlackCaMention();
  var staffMention = "";
  if (params.calendar_staff_id && typeof getStaffSlackMention === "function") {
    staffMention = getStaffSlackMention(params.calendar_staff_id) || "";
  }
  var start = params.calendar_start || "";
  var end = params.calendar_end || "";
  var when = start;
  if (start && end) when = start + " 〜 " + end;
  var name = params.calendar_guest_name || params["guest_name"] || "";
  var tel = params["your-tel"] || params["guest_phone"] || "";
  var staffName = params.calendar_staff_name || "";
  var head = "";
  if (ca && staffMention) head = ca + " " + staffMention;
  else if (ca) head = ca;
  else if (staffMention) head = staffMention;
  var lines = ["面談の予約がされました", "*日時:* " + slackSafe(when || "要確認")];
  if (head) lines.unshift(head);
  if (staffName) lines.push("*担当:* " + slackSafe(staffName));
  if (name) lines.push("*名前:* " + slackSafe(name));
  if (tel) lines.push("*電話:* " + slackSafe(tel));
  return lines.join("\n");
}

function postSlackBookingInLeadThread(params, channel, threadTs) {
  if (!threadTs || !slackBotEnabled()) {
    return { ok: false, note: "no thread" };
  }
  return postSlackChatMessage({
    channel: channel,
    thread_ts: threadTs,
    text: buildBookingThreadSlackMessage(params)
  });
}

function readRowSlackThread(sheet, header, rowNum) {
  var threadCol = header.indexOf("slack_thread_ts");
  var channelCol = header.indexOf("slack_channel_id");
  var threadTs = "";
  var channelId = getScriptProp("SLACK_LEAD_CHANNEL_ID");
  if (rowNum < 2) return { thread_ts: "", channel: channelId };
  if (threadCol !== -1) {
    threadTs = String(
      sheet.getRange(rowNum, threadCol + 1).getDisplayValue() || ""
    ).trim();
  }
  if (channelCol !== -1) {
    var ch = String(
      sheet.getRange(rowNum, channelCol + 1).getDisplayValue() || ""
    ).trim();
    if (ch) channelId = ch;
  }
  return { thread_ts: threadTs, channel: channelId };
}

function readRowAsParams(sheet, header, rowNum) {
  var out = {};
  if (rowNum < 2) return out;
  for (var i = 0; i < header.length; i++) {
    var key = header[i];
    if (!key) continue;
    out[key] = String(sheet.getRange(rowNum, i + 1).getDisplayValue() || "").trim();
  }
  return out;
}

function mergeParamsForSlack(base, extra) {
  var merged = {};
  var k;
  for (k in base) {
    if (base.hasOwnProperty(k)) merged[k] = base[k];
  }
  for (k in extra) {
    if (!extra.hasOwnProperty(k)) continue;
    if (extra[k] !== "" && extra[k] != null) merged[k] = extra[k];
  }
  return merged;
}

/** 行に slack_thread_ts が無ければ新規リード投稿して保存（予約のみ先行の行も救済） */
function ensureSlackLeadThread(sheet, header, rowNum, params) {
  var meta = readRowSlackThread(sheet, header, rowNum);
  if (meta.thread_ts && slackBotEnabled()) return meta;
  if (!slackBotEnabled()) return meta;

  var leadParams = mergeParamsForSlack(readRowAsParams(sheet, header, rowNum), params);
  // 名前も電話も無い空リードは投稿しない（情報なしのリードFMT通知が届くのを防ぐ）。
  // この場合は呼び出し元が日時入りの単独メッセージにフォールバックする。
  var hasLeadInfo = !!(
    leadParams["your-last-name"] ||
    leadParams["your-first-name"] ||
    leadParams.calendar_guest_name ||
    leadParams["guest_name"] ||
    leadParams["your-tel"] ||
    leadParams["guest_phone"]
  );
  if (!hasLeadInfo) return meta;

  var slackLead = notifySlackNewLead(leadParams);
  if (!slackLead.ok || !slackLead.ts) return meta;

  var threadTs = String(slackLead.ts);
  updateRowColumns(sheet, header, rowNum, {
    slack_thread_ts: threadTs,
    slack_channel_id: slackLead.channel || getScriptProp("SLACK_LEAD_CHANNEL_ID")
  });
  return {
    thread_ts: threadTs,
    channel: slackLead.channel || getScriptProp("SLACK_LEAD_CHANNEL_ID")
  };
}

function notifySlackBooking(sheet, header, rowNum, params) {
  if (!slackBotEnabled()) {
    return postToSlack(buildCalendarSlackMessage(params));
  }
  var slackMeta = ensureSlackLeadThread(sheet, header, rowNum, params);
  if (slackMeta.thread_ts) {
    var reply = postSlackBookingInLeadThread(
      params,
      slackMeta.channel,
      slackMeta.thread_ts
    );
    if (reply.ok) return reply;
  }
  // スレッドが無い/返信失敗でも、@ca＋日時入りの予約通知は必ず届ける
  return postToSlack(buildCalendarSlackMessage(params));
}

/**
 * 同じ電話番号の「未合流の救済行」（_recovered=thanks_ping）が直近 RESCUE_MERGE_HOURS 時間内に
 * あれば返す。無ければ null。
 * 戻り値: { row, thread_ts, channel, received_at }
 */
function findRecentRescueRow(sheet, header, tel) {
  var telKey = normalizeTel(tel);
  if (!telKey) return null;
  var recCol = header.indexOf("_recovered");
  var telCol = header.indexOf("your-tel");
  if (recCol === -1 || telCol === -1) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var n = lastRow - 1;
  var recVals = sheet.getRange(2, recCol + 1, n, 1).getDisplayValues();
  var telVals = sheet.getRange(2, telCol + 1, n, 1).getDisplayValues();
  var atCol = header.indexOf("_received_at");
  var atVals = atCol !== -1 ? sheet.getRange(2, atCol + 1, n, 1).getDisplayValues() : null;
  var threadCol = header.indexOf("slack_thread_ts");
  var chCol = header.indexOf("slack_channel_id");
  for (var i = n - 1; i >= 0; i--) {
    if (String(recVals[i][0] || "").trim() !== "thanks_ping") continue;
    if (normalizeTel(telVals[i][0]) !== telKey) continue;
    var receivedAt = atVals ? String(atVals[i][0] || "").trim() : "";
    if (receivedAt && !isWithinHours(receivedAt, RESCUE_MERGE_HOURS)) return null; // 古い救済行は別件
    var rowNum = i + 2;
    return {
      row: rowNum,
      received_at: receivedAt,
      thread_ts: threadCol !== -1 ? String(sheet.getRange(rowNum, threadCol + 1).getDisplayValue() || "").trim() : "",
      channel: chCol !== -1 ? String(sheet.getRange(rowNum, chCol + 1).getDisplayValue() || "").trim() : ""
    };
  }
  return null;
}

/** "yyyy-MM-dd HH:mm:ss"（JST表記）が今から hours 時間以内か。読めない値は「以内」とみなす（合流側に倒す）。 */
function isWithinHours(jstText, hours) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(jstText || ""));
  if (!m) return true;
  var utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]); // JST → UTC
  var diff = Date.now() - utcMs;
  return diff <= hours * 3600000;
}

/**
 * 救済行を本体の内容で埋める。救済行が既に持つ到達時刻・Slackスレッドは保持し、
 * _recovered を thanks_ping_merged に、_recovered_merged_at に合流時刻を書く。
 * 合流後の行は通常の送信行と同じ扱い（Zoho商談もこの行から作る）。
 */
function mergeIntoRescueRow(sheet, header, rescue, params) {
  var keep = { "_recovered": 1, "thanks_reached_at": 1, "slack_thread_ts": 1, "slack_channel_id": 1, "slack_error": 1 };
  var range = sheet.getRange(rescue.row, 1, 1, header.length);
  var cur = range.getValues()[0];
  for (var j = 0; j < header.length; j++) {
    var key = header[j];
    if (!key || keep[key]) continue;
    if (key in params) cur[j] = sheetSafeCell(params[key]);
  }
  range.setValues([cur]);
  updateRowColumns(sheet, header, rescue.row, {
    "_recovered": "thanks_ping_merged",
    "_recovered_merged_at": toJst(new Date())
  });
}

/**
 * 救済行への合流を Slack に反映する。警報スレッドに本体の全項目を返信し、
 * 親の警報文を「本体到着済み（誤警報）」に書き換える（@channel は鳴らし直さない）。
 * 戻り値は notifySlackNewLead と同じ形。ts は警報スレッドの ts（面談予約の返信先を揃える）。
 */
function notifySlackRescueMerged(params, rescue) {
  if (!slackBotEnabled()) return { ok: false, note: "slack bot off" };
  if (!rescue.thread_ts) return notifySlackNewLead(params); // 警報投稿が失敗していた行は通常通知
  var channel = rescue.channel || getScriptProp("SLACK_LEAD_CHANNEL_ID");
  var detail = buildLeadSlackMessage(params).replace(/<!channel>\s*/g, "");
  var reply = postSlackChatMessage({
    channel: channel,
    thread_ts: rescue.thread_ts,
    text: ":white_check_mark: *送信本体が届きました（上の警報は誤警報・同一リード。架電は1件でOK）*\n" + detail
  });
  if (!reply.ok) return reply;
  var name = ((params["your-last-name"] || "") + " " + (params["your-first-name"] || "")).trim() || params["_name"] || "";
  updateSlackChatMessage(channel, rescue.thread_ts,
    ":white_check_mark: *送信本体が届きました（誤警報・架電は1件でOK）*\n" +
    "thanks到達ピンが本体より先に着いたため一時的に「送信消失の疑い」を出しましたが、同じ送信の本体がその後届きました。\n" +
    "●名前：" + name + "\n●電話番号：" + (params["your-tel"] || "") + "\n●LP：" + (params["_lp"] || "") + "\n" +
    "_全項目はこのスレッドの返信、面談予約の返信もこのスレッドに届きます_");
  return { ok: true, ts: String(rescue.thread_ts), channel: channel, merged: true };
}

/** 自分（Bot）が投稿したメッセージの本文を書き換える。失敗しても処理は止めない。 */
function updateSlackChatMessage(channel, ts, text) {
  try {
    var token = getScriptProp("SLACK_BOT_TOKEN");
    if (!token || !channel || !ts) return { ok: false, note: "slack bot not configured" };
    var res = UrlFetchApp.fetch("https://slack.com/api/chat.update", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify({ channel: channel, ts: String(ts), text: text }),
      muteHttpExceptions: true
    });
    var json = JSON.parse(res.getContentText());
    if (!json.ok) console.log("chat.update failed: " + json.error);
    return { ok: !!json.ok, error: json.error || "" };
  } catch (e) {
    console.log("chat.update error: " + e);
    return { ok: false, error: String(e) };
  }
}

function findLatestRowByTelOrEmail(sheet, header, tel, email) {
  var telColIdx = header.indexOf("your-tel");
  var emailColIdx = header.indexOf("your-email");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  if (tel && telColIdx !== -1) {
    var telKey = normalizeTel(tel);
    var telVals = sheet
      .getRange(2, telColIdx + 1, lastRow - 1, 1)
      .getDisplayValues();
    for (var i = telVals.length - 1; i >= 0; i--) {
      if (normalizeTel(telVals[i][0]) === telKey) return i + 2;
    }
  }
  if (email && emailColIdx !== -1) {
    var emailKey = String(email).toLowerCase().trim();
    var emailVals = sheet.getRange(2, emailColIdx + 1, lastRow - 1, 1).getDisplayValues();
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

/**
 * シートに書く値の無害化（数式インジェクション対策）。
 * フォームから届いた文字列が = + - @ やタブ・改行で始まると、Sheets はそれを数式として評価する
 * （=IMPORTXML(...) で他の行の氏名・電話を外部へ送れる）。先頭に ' を付けると文字列として保存され、
 * getValues() で読む側には ' は見えない（値はそのまま）。数値・日付・空はそのまま返す。
 */
function sheetSafeCell(v) {
  if (typeof v !== "string" || !v) return v;
  return /^[=+\-@\t\r\n]/.test(v) ? "'" + v : v;
}
function sheetSafeRow(row) {
  var out = [];
  for (var i = 0; i < row.length; i++) out.push(sheetSafeCell(row[i]));
  return out;
}

/**
 * 行を追記して「その行の行番号」を返す。
 *
 * appendRow の直後に getLastRow() を読むだけだと、**同時に届いた別の送信**が
 * 先に追記していた場合に他人の行番号を拾う。すると slack_thread_ts / zoho_deal_id /
 * zoho_error を**別人の行に書き込む**ことになり、
 *  - 書き込まれた側は「連携済み」と誤認され、backfillZohoDeals() が永久に商談を作らない
 *  - 書けなかった側は未連携のまま残り、後から重複商談が立つ
 *  - Slackスレッドの面談予約返信も別人に紐づく
 * という壊れ方をする。しかもエラーはどこにも残らない（このリポジトリが繰り返し
 * 踏んできた「無言でリードが消える」型）。追記と行番号取得をロックで一体にする。
 *
 * ロックが取れないときは**記録を優先して続行**する。行番号がずれる可能性より
 * リードを1件落とすほうが損失が大きい（Zoho連携の判断と同じ方針）。
 */
function appendRowAndGetIndex(sheet, row, opts) {
  // opts.locked=true は呼び出し元が withScriptLock で既にロックを持っている場合（二重取得しない）
  if (opts && opts.locked) {
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return sheet.getLastRow();
  }
  var lock = null, locked = false;
  try {
    lock = LockService.getScriptLock();
    locked = lock.tryLock(30000);
    if (!locked) console.log("appendRowAndGetIndex: ロックを取得できずロック無しで続行");
  } catch (e) {
    console.log("appendRowAndGetIndex: LockService を使えません: " + e);
  }
  try {
    sheet.appendRow(row);
    SpreadsheetApp.flush(); // 追記を確定させてから行番号を読む
    return sheet.getLastRow();
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e2) { /* 解放失敗は放置（自動失効する） */ } }
  }
}

/**
 * スクリプトロックを取って fn(locked) を実行する。「探す→書く」を他の実行と排他にしたいときに使う。
 * ロックが取れないときは appendRowAndGetIndex と同じ方針で**記録を優先して続行**する（fn(false)）。
 */
function withScriptLock(fn) {
  var lock = null, locked = false;
  try {
    lock = LockService.getScriptLock();
    locked = lock.tryLock(30000);
    if (!locked) console.log("withScriptLock: ロックを取得できずロック無しで続行");
  } catch (e) {
    console.log("withScriptLock: LockService を使えません: " + e);
  }
  try {
    return fn(locked);
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e2) { /* 解放失敗は放置（自動失効する） */ } }
  }
}

/** 行の thanks_reached_at が空なら到達時刻を書く（初回到達時刻を保持） */
function markThanksReached(sheet, header, rowNum, nowJst) {
  var reachedCol = ensureColumn(sheet, header, "thanks_reached_at");
  var cell = sheet.getRange(rowNum, reachedCol + 1);
  if (!String(cell.getValue() || "").trim()) cell.setValue(nowJst);
}

// 孤児救済行の掃除で遡る行数（直近だけ見れば十分。全行を毎回読まない）
var RESCUE_SWEEP_ROWS = 500;

/**
 * 合流できずに残った救済行（_recovered=thanks_ping）に、同じ番号の本体行が前後 RESCUE_MERGE_HOURS
 * 時間内にあれば「誤警報の残骸」として片付ける（2026-10-04）。対象は 合流機能より前の行と、
 * ロック化前の競合で二重になった行。
 *  - 救済行: _recovered=thanks_ping_superseded・_recovered_merged_at・（商談IDが無ければ）
 *    zoho_error=skipped: superseded_by_row N。backfill と代理店共有はこの印で除外する
 *  - 本体行: thanks_reached_at が空なら救済行の到達時刻を移す
 *  - Slack: 救済の警報文を「本体到着済み（誤警報）」に書き換え、スレッドに本体の場所を返信する
 * doPost の最後に毎回走る（直近 RESCUE_SWEEP_ROWS 行だけ）。エディタからは sweepOrphanRescueRowsNow()。
 * 戻り値: { checked, superseded: [{ rescue_row, body_row }] }
 */
function sweepOrphanRescueRows(sheet, header) {
  var recCol = header.indexOf("_recovered");
  var telCol = header.indexOf("your-tel");
  var atCol = header.indexOf("_received_at");
  if (recCol === -1 || telCol === -1) return { checked: 0, superseded: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { checked: 0, superseded: [] };
  var start = Math.max(2, lastRow - RESCUE_SWEEP_ROWS + 1);
  var n = lastRow - start + 1;
  var values = sheet.getRange(start, 1, n, header.length).getValues();
  var out = { checked: n, superseded: [] };

  function isRescue(v) { return String(v || "").trim().indexOf("thanks_ping") === 0 && String(v || "").trim() !== "thanks_ping_merged"; }
  function timeMs(v) {
    if (v instanceof Date) return v.getTime();
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(v || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]) : NaN;
  }

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][recCol] || "").trim() !== "thanks_ping") continue;
    var telKey = normalizeTel(values[i][telCol]);
    if (!telKey) continue;
    var t0 = atCol !== -1 ? timeMs(values[i][atCol]) : NaN;
    var bodyIdx = -1;
    for (var j = 0; j < values.length; j++) {
      if (j === i || isRescue(values[j][recCol])) continue;
      if (normalizeTel(values[j][telCol]) !== telKey) continue;
      if (atCol !== -1) {
        var t1 = timeMs(values[j][atCol]);
        if (!isNaN(t0) && !isNaN(t1) && Math.abs(t1 - t0) > RESCUE_MERGE_HOURS * 3600000) continue;
      }
      bodyIdx = j;
      break;
    }
    if (bodyIdx === -1) continue; // 本体が無い＝本当の消失。救済行のまま残す

    var rescueRow = start + i, bodyRow = start + bodyIdx;
    var rescueParams = readRowAsParams(sheet, header, rescueRow);
    var bodyParams = readRowAsParams(sheet, header, bodyRow);
    var now = toJst(new Date());
    var upd = { "_recovered": "thanks_ping_superseded", "_recovered_merged_at": now };
    if (!String(rescueParams["zoho_deal_id"] || "").trim()) upd["zoho_error"] = "skipped: superseded_by_row " + bodyRow;
    updateRowColumns(sheet, header, rescueRow, upd);
    if (!String(bodyParams["thanks_reached_at"] || "").trim() && rescueParams["thanks_reached_at"]) {
      updateRowColumns(sheet, header, bodyRow, { thanks_reached_at: rescueParams["thanks_reached_at"] });
    }
    var threadTs = String(rescueParams["slack_thread_ts"] || "").trim();
    if (threadTs && slackBotEnabled()) {
      var channel = String(rescueParams["slack_channel_id"] || "").trim() || getScriptProp("SLACK_LEAD_CHANNEL_ID");
      var name = ((bodyParams["your-last-name"] || "") + " " + (bodyParams["your-first-name"] || "")).trim() || rescueParams["your-last-name"] || "";
      postSlackChatMessage({
        channel: channel,
        thread_ts: threadTs,
        text: ":white_check_mark: 送信本体は別途「新規リード（LP登録）」として届いています（シート " + bodyRow + " 行目）。上の警報は誤警報・同一リードなので架電は1件でOK。面談予約の返信は本体のスレッドに届きます。"
      });
      updateSlackChatMessage(channel, threadTs,
        ":white_check_mark: *送信本体が届いていました（誤警報・架電は1件でOK）*\n" +
        "thanks到達ピンが本体より先に着いたため「送信消失の疑い」を出しましたが、同じ送信の本体は「新規リード（LP登録）」として別途届いています。\n" +
        "●名前：" + name + "\n●電話番号：" + (rescueParams["your-tel"] || "") + "\n●LP：" + (rescueParams["_lp"] || "") + "\n" +
        "_全項目・面談予約の返信は本体の「新規リード」スレッドへ_");
    }
    out.superseded.push({ rescue_row: rescueRow, body_row: bodyRow });
  }
  return out;
}

/** GASエディタ用: 孤児救済行の掃除を手で1回流す */
function sweepOrphanRescueRowsNow() {
  var sheet = getSheet();
  var header = ensureHeader(sheet);
  var res = sweepOrphanRescueRows(sheet, header);
  Logger.log(JSON.stringify(res));
  return res;
}

function updateRowColumns(sheet, header, rowNum, updates) {
  for (var key in updates) {
    if (!updates.hasOwnProperty(key) || updates[key] === "" || updates[key] == null) continue;
    var colIdx = ensureColumn(sheet, header, key);
    var cell = sheet.getRange(rowNum, colIdx + 1);
    var val = updates[key];
    if (key === "slack_thread_ts") {
      cell.setNumberFormat("@");
      val = String(val);
    }
    cell.setValue(sheetSafeCell(val));
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
      calendar_staff_id: params.calendar_staff_id || "",
      calendar_staff_name: params.calendar_staff_name || "",
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
      matchedRow = appendRowAndGetIndex(sheet, sheetSafeRow(row));
    }

    var slackResult = notifySlackBooking(sheet, header, matchedRow, params);

    return jsonOk({
      matched: matchedRow > 0,
      row: matchedRow,
      slack: slackResult
    });
  } catch (err) {
    reportErrorToSlack("handleCalendarBooked/handleBookSlot", err);
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
  var staffName = params.calendar_staff_name || "";
  if (staffName) lines.push("*担当:* " + staffName);
  // スレッド返信できない場合のフォールバックでも @ca・担当に届くようにする
  var ca = getSlackCaMention();
  var staffMention = "";
  if (params.calendar_staff_id && typeof getStaffSlackMention === "function") {
    staffMention = getStaffSlackMention(params.calendar_staff_id) || "";
  }
  var head = [ca, staffMention].filter(function (m) { return !!m; }).join(" ");
  if (head) lines.unshift(head);
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
  // ?action=ip_check&ip=… 除外IP（EXCLUDE_IPS）の照会（2026-10-10）。LPがフォームに触れた時に1回だけ呼ぶ。
  // 一致したらLPが送信前に _test=ip を立て、thanks で lead_conversion（広告CV）を発火させない。
  // 返すのは真偽だけ（IPリスト自体は外に出さない）。
  if (e && e.parameter && e.parameter.action === "ip_check") {
    return jsonOk({ excluded: isExcludedIp(e.parameter.ip) });
  }
  if (e && e.parameter && e.parameter.action === "slack_health") {
    return handleSlackHealthRequest(e);
  }
  // ?setup=legend で凡例シートを構築・更新
  if (e && e.parameter && e.parameter.setup === "legend") {
    var msg = setupColumnsLegend();
    return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
  }
  // ?action=backfill_params で既存行に広告・計測パラメーターを遡って埋める（要 key 認証）
  if (e && e.parameter && e.parameter.action === "backfill_params") {
    if (!webhookAuthorized(e)) return jsonError("unauthorized");
    return jsonOk({ result: backfillTrackingParams() });
  }
  // ?action=sweep_orphan_rescues で合流できずに残った救済行を片付ける（要 key 認証。doPost でも毎回走る）
  if (e && e.parameter && e.parameter.action === "sweep_orphan_rescues") {
    if (!webhookAuthorized(e)) return jsonError("unauthorized");
    return jsonOk({ result: sweepOrphanRescueRowsNow() });
  }
  return ContentService.createTextOutput("LP form recorder is alive.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// 凡例シートの中身。カラム名 / 意味 / 備考 の3列
const COLUMNS_LEGEND = [
  ["カラム名", "意味", "備考"],
  ["_received_at", "GAS受信時刻", "サーバー側で記録した日本時間 (yyyy-MM-dd HH:mm:ss)"],
  ["_lp", "送信元LP識別子", "sekoukanri / denkikouji / sekoukanri-doboku / sekoukanri-kentiku / sekoukanri-denkisekou / *-meta / nenshu-shindan-* / thanks / nenshu-shindan-thanks など"],
  ["_test", "テスト送信フラグ", "空=本物のリード。stg=ステージングから送信 / param=?dk_test=1付き / pattern=テスト名・テスト番号 / ip=除外IP（スクリプトプロパティ EXCLUDE_IPS）からの送信。テストもシートには残すが、Slackは【テスト送信】表記・Zoho商談は作らない・広告CVにも乗らない（ip はLPがフォーム操作時にGASへ照会して送信前に判定する。照会が間に合わなかった/失敗した送信だけはGAS側で ip が付くが広告CVには乗る）"],
  ["slack_error", "Slack通知エラー", "新規リードのSlack通知が失敗した理由。空なら通知成功（slack_thread_ts が入る）"],
  ["thanks_reached_at", "thanks到達確認", "thanksページ到達ピンの受信時刻。空でもLINE即遷移等はあり得るが、行全体で常に空が続く場合はピン配線の故障を疑う"],
  ["_recovered", "救済行フラグ", "thanks_ping=フォーム送信本体が届かずthanks到達ピンだけ届いた救済行（送信消失の疑い）。名前・電話番号以外の項目は無い。@channel警報も出る。thanks_ping_merged=警報の後に本体が届き、この行へ合流した（全項目あり・誤警報だった。Slackの警報文も書き換わる）。thanks_ping_superseded=本体が別の行として既に届いていた救済行（誤警報の残骸。商談・代理店共有の対象外。本体行は zoho_error の superseded_by_row N）"],
  ["_recovered_merged_at", "救済行への合流時刻", "本体が届いて救済行に合流した日本時間。_recovered=thanks_ping_merged の行にだけ入る"],
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
  ["zoho_deal_id", "Zoho商談ID", "Zoho CRM の Deals レコードID。空なら未連携（backfillZohoDeals() で再送できる）"],
  ["zoho_synced_at", "Zoho登録時刻", "商談を作成／既存商談に紐付けた日本時間"],
  ["zoho_error", "Zoho連携エラー", "作成に失敗した理由、またはテスト送信として除外した記録"],
  ["_submitted_at", "クライアント送信時刻", "ブラウザがフォーム送信した日本時間"],
  ["_page", "送信時のURL", "utm等の全パラメーター付き。下の個別列はここから自動抽出"],
  ["_referrer", "流入元URL", "どこからLPに来たか"],
  ["utm_source", "流入元", "_page から自動抽出。例: google / yahoo / instagram"],
  ["utm_medium", "媒体種別", "_page から自動抽出。例: cpc / display / social"],
  ["utm_campaign", "キャンペーン名", "_page から自動抽出。例: lis_ad_010_02"],
  ["utm_term", "検索キーワード", "_page から自動抽出。日本語はデコード済み（例: 電工 仕事探し）"],
  ["utm_content", "広告クリエイティブ識別", "_page から自動抽出。Metaは広告ID、Googleはマッチタイプ(phrase_match等)が入る"],
  ["utm_id", "広告キャンペーンID", "_page から自動抽出。MetaのキャンペーンID（utm_campaignと同値のことが多い）"],
  ["gclid", "Google広告クリックID", "_page から自動抽出。Google Ads の click id"],
  ["gbraid", "Google iOSアプリ計測ID", "_page から自動抽出（アプリ→Web）"],
  ["wbraid", "Google Web計測ID", "_page から自動抽出（Web→アプリ）"],
  ["gad_source", "Google広告ソース", "_page から自動抽出"],
  ["gad_campaignid", "GoogleキャンペーンID", "_page から自動抽出"],
  ["yclid", "Yahoo広告クリックID", "_page から自動抽出。Yahoo広告の click id"],
  ["fbclid", "Meta広告クリックID", "_page から自動抽出。Facebook/Instagram広告の click id"],
  ["msclkid", "Microsoft広告クリックID", "_page から自動抽出"],
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
