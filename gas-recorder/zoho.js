/**
 * LPフォーム送信 → Zoho CRM「見込み客(Leads)」自動作成
 *
 * 前提:
 *  - Zoho側の受け皿は Leads モジュール。求職者用のカスタム項目が既にある。
 *      field4 転職時期 / field5 電気保有資格 / field7 求職者名
 *    ※ field(生まれ年) と field1(経験) は Zoho のレイアウトから外れている
 *      (getFields で type:"unused") ため API で送っても無視される。
 *      値は Description に文字で残す。レイアウトに戻したら
 *      ZOHO_USE_UNUSED_FIELDS = true 相当の分岐を足すこと。
 *  - 認証は Zoho Self Client のリフレッシュトークン。
 *    スクリプトプロパティに以下を設定する（手順は Zoho連携セットアップ.md）:
 *      ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN
 *      ZOHO_ACCOUNTS_HOST (任意, 既定 https://accounts.zoho.jp)
 *      ZOHO_API_HOST      (任意, 既定 https://www.zohoapis.jp)
 *    3つの必須プロパティが未設定なら、この連携は丸ごと無効（スプシ記録は従来どおり動く）。
 *
 * 動作:
 *  - doPost のフォーム送信時に Lead を作成し、zoho_lead_id / zoho_synced_at を行に書き戻す。
 *  - 失敗しても doPost 自体は成功させる（スプシ記録とSlack通知を止めない）。理由は zoho_error 列に残す。
 *  - backfillZohoLeads() で未連携行をまとめて送る。電話番号でZoho側を検索してから作るので
 *    何度実行しても重複しない。
 */

var ZOHO_DEFAULT_ACCOUNTS_HOST = "https://accounts.zoho.jp";
var ZOHO_DEFAULT_API_HOST = "https://www.zohoapis.jp";
var ZOHO_API_VERSION = "v8";

// Lead_Source は Zoho のピックリスト既存値のみ有効。LP経由は広告流入なので Advertisement。
var ZOHO_LEAD_SOURCE = "Advertisement";
var ZOHO_LEAD_STATUS = "精査前";

// シート「your-license01」表記 → Zoho field5(電気保有資格) ピックリスト値。
// 上から順に判定し、最初に一致した＝最上位の資格を1つだけ入れる（field5は単一選択）。
var ZOHO_LICENSE_RANK = [
  ["電気主任技術者", "第3種電気主任技術者"],
  ["1級電気工事施工管理技士", "1種電気施工管理技士"],
  ["1級電気施工管理技士", "1種電気施工管理技士"],
  ["電気施工管理 1級", "1種電気施工管理技士"],
  ["電気施工管理 2級", "2種電気施工管理技士"],
  ["第一種電気工事士", "1種電気工事士"],
  ["第二種電気工事士", "2種電気工事士"]
];

// シート「your-willingness」→ Zoho field4(転職時期)。
// LPの選択肢は2つだけなので、Zohoの7段階に寄せる。
var ZOHO_WILLINGNESS_MAP = {
  "今は情報収集したい": "情報収集のみ",
  "近いうちに転職したい": "3ヶ月以内"
};

// テスト送信とみなす氏名（姓+名を連結して判定）
var ZOHO_PLACEHOLDER_NAMES = [
  "あ", "ああ", "あああ", "ああい", "あい", "い", "いい",
  "h", "hh", "テスト", "てすと", "test", "ytest", "さかな", "aaa"
];

function zohoEnabled() {
  return !!(getScriptProp("ZOHO_CLIENT_ID") &&
            getScriptProp("ZOHO_CLIENT_SECRET") &&
            getScriptProp("ZOHO_REFRESH_TOKEN"));
}

function zohoAccountsHost() {
  return getScriptProp("ZOHO_ACCOUNTS_HOST") || ZOHO_DEFAULT_ACCOUNTS_HOST;
}

function zohoApiHost() {
  return getScriptProp("ZOHO_API_HOST") || ZOHO_DEFAULT_API_HOST;
}

// アクセストークンは1時間有効。55分だけキャッシュして使い回す。
function zohoAccessToken() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("zoho_access_token");
  if (cached) return cached;

  var url = zohoAccountsHost() + "/oauth/v2/token" +
    "?refresh_token=" + encodeURIComponent(getScriptProp("ZOHO_REFRESH_TOKEN")) +
    "&client_id=" + encodeURIComponent(getScriptProp("ZOHO_CLIENT_ID")) +
    "&client_secret=" + encodeURIComponent(getScriptProp("ZOHO_CLIENT_SECRET")) +
    "&grant_type=refresh_token";

  var res = UrlFetchApp.fetch(url, { method: "post", muteHttpExceptions: true });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = {}; }
  if (!body.access_token) {
    throw new Error("zoho token refresh failed: " + res.getResponseCode() + " " + res.getContentText());
  }
  cache.put("zoho_access_token", body.access_token, 55 * 60);
  return body.access_token;
}

function zohoFetch(path, options) {
  options = options || {};
  var params = {
    method: options.method || "get",
    muteHttpExceptions: true,
    headers: { Authorization: "Zoho-oauthtoken " + zohoAccessToken() }
  };
  if (options.payload) {
    params.contentType = "application/json";
    params.payload = JSON.stringify(options.payload);
  }
  var res = UrlFetchApp.fetch(zohoApiHost() + "/crm/" + ZOHO_API_VERSION + path, params);
  var text = res.getContentText();
  var json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
  return { code: res.getResponseCode(), body: json };
}

// スプシは先頭0を落とすので、10桁なら 0 を戻して 11桁の携帯番号に揃える
function zohoNormalizeTel(s) {
  var t = String(s == null ? "" : s).replace(/[^0-9]/g, "");
  if (t.length === 10 && t.charAt(0) !== "0") t = "0" + t;
  return t;
}

function zohoNormalizeZip(s) {
  var z = String(s == null ? "" : s).replace(/[^0-9]/g, "");
  if (z.length === 6) z = "0" + z;
  return z;
}

// 明らかなテスト送信（1111111111 のような番号 / 氏名「ああ」等）は Zoho に流さない
function zohoIsTestSubmission(params) {
  var tel = zohoNormalizeTel(params["your-tel"]);
  var distinct = {};
  for (var i = 0; i < tel.length; i++) distinct[tel.charAt(i)] = true;
  if (Object.keys(distinct).length < 3) return true;

  var name = String(params["your-last-name"] || "").trim() + String(params["your-first-name"] || "").trim();
  name = name.replace(/\s/g, "").toLowerCase();
  return ZOHO_PLACEHOLDER_NAMES.indexOf(name) !== -1;
}

function zohoPickLicense(raw) {
  var text = String(raw || "");
  for (var i = 0; i < ZOHO_LICENSE_RANK.length; i++) {
    if (text.indexOf(ZOHO_LICENSE_RANK[i][0]) !== -1) return ZOHO_LICENSE_RANK[i][1];
  }
  return text.trim() ? "その他" : "";
}

// Zohoの見込み客1件ぶんのペイロードを作る（移行時と同じ形）
function buildZohoLead(params) {
  var license = String(params["your-license01"] || "").trim();
  var tel = zohoNormalizeTel(params["your-tel"]);

  var desc = [
    "LP: " + (params["_lp"] || ""),
    "送信: " + (params["_received_at"] || ""),
    "生年月日: " + (params["your-birthday"] || "不明"),
    "資格: " + (license || "未選択"),
    "経験: " + (params["your-experience"] || "未選択"),
    "転職意欲: " + (params["your-willingness"] || "未選択")
  ];
  if (String(params["your-term"] || "").trim()) desc.push("検索語: " + String(params["your-term"]).trim());
  var utm = [params["utm_source"], params["utm_medium"], params["utm_campaign"]]
    .filter(function (v) { return !!v; }).join("/");
  if (utm) desc.push("utm: " + utm);
  desc.push("LINE登録: " + (params["line_clicked_at"] ? ("済 " + params["line_clicked_at"]) : "未"));
  if (tel.length !== 11) desc.push("※電話番号が不正形式（原文: " + String(params["your-tel"] || "") + "）");

  var lead = {
    Last_Name: String(params["your-last-name"] || "").trim() || "(姓未入力)",
    First_Name: String(params["your-first-name"] || "").trim(),
    field7: (String(params["your-last-name"] || "").trim() + " " + String(params["your-first-name"] || "").trim()).trim(),
    Phone: tel,
    Lead_Source: ZOHO_LEAD_SOURCE,
    Lead_Status: ZOHO_LEAD_STATUS,
    Description: desc.join(" / ")
  };

  if (String(params["your-pref"] || "").trim()) lead.State = String(params["your-pref"]).trim();
  if (String(params["your-city"] || "").trim()) lead.City = String(params["your-city"]).trim();
  var zip = zohoNormalizeZip(params["your-zip"]);
  if (zip) lead.Zip_Code = zip;

  var willingness = ZOHO_WILLINGNESS_MAP[String(params["your-willingness"] || "").trim()];
  if (willingness) lead.field4 = willingness;

  var licenseValue = zohoPickLicense(license);
  if (licenseValue) lead.field5 = licenseValue;

  return lead;
}

// 電話番号で既存の見込み客を探す。見つかればそのIDを返す（重複作成の防止）。
function findZohoLeadByPhone(tel) {
  if (!tel) return "";
  var res = zohoFetch("/Leads/search?phone=" + encodeURIComponent(tel) + "&fields=id&per_page=1");
  if (res.code === 204) return "";
  if (res.code !== 200) return "";
  var data = (res.body && res.body.data) || [];
  return data.length > 0 ? String(data[0].id) : "";
}

/**
 * フォーム送信1件を Zoho に登録する。
 * 戻り値: { ok:boolean, id?:string, skipped?:string, error?:string }
 * 例外は投げない（呼び出し元の doPost を落とさないため）。
 */
function syncLeadToZoho(params) {
  try {
    if (!zohoEnabled()) return { ok: false, skipped: "disabled" };
    if (zohoIsTestSubmission(params)) return { ok: false, skipped: "test_submission" };

    var lead = buildZohoLead(params);
    var res = zohoFetch("/Leads", { method: "post", payload: { data: [lead] } });
    var first = (res.body && res.body.data && res.body.data[0]) || {};
    if (res.code === 201 && first.code === "SUCCESS") {
      return { ok: true, id: String(first.details && first.details.id) };
    }
    return { ok: false, error: res.code + " " + JSON.stringify(first || res.body) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * 未連携行（zoho_lead_id が空）をまとめて Zoho に登録する。
 * 電話番号でZoho側を検索してから作るため、何度実行しても重複しない。
 * 1回の実行で最大 limit 行（既定80行。GASの6分制限に収める）。
 * Apps Script エディタから手動実行する想定。
 */
function backfillZohoLeads(limit) {
  if (!zohoEnabled()) return "ZOHO_* のスクリプトプロパティが未設定のため実行しません";
  limit = limit || 80;

  var sheet = getSheet();
  var header = ensureHeader(sheet);
  ensureColumn(sheet, header, "zoho_lead_id");
  ensureColumn(sheet, header, "zoho_synced_at");
  ensureColumn(sheet, header, "zoho_error");
  header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "対象行なし";

  var values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var idCol = header.indexOf("zoho_lead_id");
  var created = 0, linked = 0, skipped = 0, failed = 0, processed = 0;

  for (var i = 0; i < values.length && processed < limit; i++) {
    if (String(values[i][idCol] || "").trim()) continue;

    var params = {};
    for (var c = 0; c < header.length; c++) params[header[c]] = values[i][c];
    var rowNum = i + 2;
    processed++;

    if (zohoIsTestSubmission(params)) {
      updateRowColumns(sheet, header, rowNum, { zoho_error: "skipped: test_submission" });
      skipped++;
      continue;
    }

    var tel = zohoNormalizeTel(params["your-tel"]);
    var existing = findZohoLeadByPhone(tel);
    if (existing) {
      updateRowColumns(sheet, header, rowNum, {
        zoho_lead_id: existing,
        zoho_synced_at: toJst(new Date()),
        zoho_error: ""
      });
      linked++;
      continue;
    }

    var result = syncLeadToZoho(params);
    if (result.ok) {
      updateRowColumns(sheet, header, rowNum, {
        zoho_lead_id: result.id,
        zoho_synced_at: toJst(new Date()),
        zoho_error: ""
      });
      created++;
    } else {
      updateRowColumns(sheet, header, rowNum, { zoho_error: result.error || result.skipped || "unknown" });
      failed++;
    }
  }

  return "処理 " + processed + "行: 新規作成 " + created +
    " / 既存に紐付け " + linked + " / テスト除外 " + skipped + " / 失敗 " + failed;
}

// 疎通確認用。エディタから実行して「ok: 組織名」が返れば認証まで通っている。
function testZohoConnection() {
  if (!zohoEnabled()) return "ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN が未設定";
  var res = zohoFetch("/org");
  if (res.code !== 200) return "NG: " + res.code + " " + JSON.stringify(res.body);
  var org = (res.body.org && res.body.org[0]) || {};
  return "ok: " + (org.company_name || org.primary_email || "connected");
}
