/**
 * LPフォーム送信 → Zoho CRM「見込み客(Leads)」自動作成
 *
 * 前提:
 *  - Zoho側の受け皿は Leads モジュール。求職者用のカスタム項目が既にある。
 *      field 生まれ年 / field1 経験 / field4 転職時期 / field5 電気保有資格 / field7 求職者名
 *    ※ 2026-07-26時点で field(生まれ年) と field1(経験) は Zoho のレイアウトから
 *      外れており (getFields で type:"unused")、APIで送っても保存されない。
 *      そのため **項目メタデータを実行時に読んで、使える項目・存在する選択肢だけ送る**。
 *      オーナーがZoho画面でレイアウトに戻したり選択肢を追加したりすれば、
 *      コードを変えなくても自動的に埋まり始める（既存分は resyncZohoLeadFields() で追いつく）。
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
// 先頭から順に試し、Zohoのピックリストに存在する値を採用する。
// 「近いうちに転職したい」をZoho側の選択肢に追加すれば、原文のまま入るようになる。
var ZOHO_WILLINGNESS_MAP = {
  "今は情報収集したい": ["今は情報収集したい", "情報収集のみ"],
  "近いうちに転職したい": ["近いうちに転職したい", "3ヶ月以内"]
};

// シート「your-experience」→ Zoho field1(経験)。
// 「未経験」「設計・積算経験」はZohoの既定選択肢に無いので、追加されるまでは その他 に寄せる。
var ZOHO_EXPERIENCE_MAP = {
  "施工管理経験": ["施工管理経験"],
  "工事作業経験": ["工事作業経験"],
  "設備管理経験": ["設備管理経験"],
  "現場監督経験": ["現場監督経験", "施工管理経験"],
  "設計・積算経験": ["設計・積算経験", "その他"],
  "未経験": ["未経験", "その他"]
};

// LP識別子 → 見込み客のデータ元(Lead_Source)。
// 「LP - denkikouji」等をZoho側の選択肢に追加すればLP単位で切り分けられる。
// 無ければ ZOHO_LEAD_SOURCE_FALLBACK。
var ZOHO_LEAD_SOURCE_FALLBACK = "Advertisement";

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

/**
 * Leads の項目メタデータ（どの項目が使えるか・各ピックリストにどの値があるか）を取得する。
 * Zoho画面での項目追加・レイアウト変更に自動追従させるための土台。
 * 6時間キャッシュ。取得に失敗したら「制約なし」を返し、送信自体は止めない。
 */
function zohoFieldMeta() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("zoho_leads_field_meta");
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* 壊れていたら取り直す */ }
  }

  var meta = { ok: false, usable: {}, options: {} };
  try {
    var res = zohoFetch("/settings/fields?module=Leads&type=all");
    if (res.code === 200 && res.body && res.body.fields) {
      meta.ok = true;
      res.body.fields.forEach(function (f) {
        // type:"unused" はレイアウトから外れている＝APIで送っても保存されない
        meta.usable[f.api_name] = f.type !== "unused";
        if (f.pick_list_values && f.pick_list_values.length) {
          meta.options[f.api_name] = f.pick_list_values.map(function (v) { return v.actual_value; });
        }
      });
      cache.put("zoho_leads_field_meta", JSON.stringify(meta), 6 * 60 * 60);
    }
  } catch (err) {
    // メタ取得に失敗しても登録は続行する
  }
  return meta;
}

// メタが取れていない場合は「使える」とみなす（従来どおり送る）
function zohoFieldUsable(meta, apiName) {
  if (!meta.ok) return true;
  return meta.usable[apiName] !== false;
}

// 候補を先頭から試し、Zohoのピックリストに実在する値を返す。メタ未取得なら末尾（安全側）を返す。
function zohoPickOption(meta, apiName, candidates) {
  if (!candidates || !candidates.length) return "";
  if (!meta.ok || !meta.options[apiName]) return candidates[candidates.length - 1];
  for (var i = 0; i < candidates.length; i++) {
    if (meta.options[apiName].indexOf(candidates[i]) !== -1) return candidates[i];
  }
  return "";
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

// Zohoの見込み客1件ぶんのペイロードを作る。
// meta を渡すと、実在する項目・選択肢だけを詰める（未指定なら都度取得）。
function buildZohoLead(params, meta) {
  meta = meta || zohoFieldMeta();
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
    Lead_Status: ZOHO_LEAD_STATUS,
    Description: desc.join(" / ")
  };

  // データ元は「LP - <LP名>」の選択肢があればそれ、無ければ Advertisement
  var lp = String(params["_lp"] || "").trim();
  lead.Lead_Source = zohoPickOption(meta, "Lead_Source",
    (lp ? ["LP - " + lp] : []).concat([ZOHO_LEAD_SOURCE_FALLBACK])) || ZOHO_LEAD_SOURCE_FALLBACK;

  if (String(params["your-pref"] || "").trim()) lead.State = String(params["your-pref"]).trim();
  if (String(params["your-city"] || "").trim()) lead.City = String(params["your-city"]).trim();
  var zip = zohoNormalizeZip(params["your-zip"]);
  if (zip) lead.Zip_Code = zip;

  // 生まれ年（レイアウトに戻された時点で自動的に入り始める）
  var year = String(params["your-birthday-year"] || "").replace(/[^0-9]/g, "");
  if (zohoFieldUsable(meta, "field") && year && Number(year) > 1900 && Number(year) < 2020) {
    lead.field = Number(year);
  }

  // 経験（同上）
  if (zohoFieldUsable(meta, "field1")) {
    var experience = zohoPickOption(meta, "field1",
      ZOHO_EXPERIENCE_MAP[String(params["your-experience"] || "").trim()]);
    if (experience) lead.field1 = experience;
  }

  if (zohoFieldUsable(meta, "field4")) {
    var willingness = zohoPickOption(meta, "field4",
      ZOHO_WILLINGNESS_MAP[String(params["your-willingness"] || "").trim()]);
    if (willingness) lead.field4 = willingness;
  }

  if (zohoFieldUsable(meta, "field5")) {
    var licenseValue = zohoPickOption(meta, "field5", license ? [zohoPickLicense(license)] : []);
    if (licenseValue) lead.field5 = licenseValue;
  }

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
function syncLeadToZoho(params, meta) {
  try {
    if (!zohoEnabled()) return { ok: false, skipped: "disabled" };
    if (zohoIsTestSubmission(params)) return { ok: false, skipped: "test_submission" };

    var lead = buildZohoLead(params, meta);
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
  var meta = zohoFieldMeta();
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

    var result = syncLeadToZoho(params, meta);
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

/**
 * 連携済み（zoho_lead_id がある）行を、今の項目マッピングで Zoho 側に上書きし直す。
 * Zoho画面で「生まれ年」「経験」をレイアウトに戻したり、転職時期・データ元の選択肢を
 * 追加したあとに1回まわすと、過去に登録した見込み客も追いつく。
 * 姓名・電話・住所・詳細情報も同じ値で送るだけなので、繰り返し実行しても害はない。
 * （営業が Zoho 側で編集する項目 = 見込み客ステータスは送らない）
 * 1回の実行で最大 limit 行（既定150行）。
 */
function resyncZohoLeadFields(limit) {
  if (!zohoEnabled()) return "ZOHO_* のスクリプトプロパティが未設定のため実行しません";
  limit = limit || 150;

  var sheet = getSheet();
  var header = ensureHeader(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "対象行なし";

  var values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var idCol = header.indexOf("zoho_lead_id");
  if (idCol === -1) return "zoho_lead_id 列がありません。先に backfillZohoLeads() を実行してください";

  var meta = zohoFieldMeta();
  var batch = [], updated = 0, failed = 0;

  function flush() {
    if (!batch.length) return;
    var res = zohoFetch("/Leads", { method: "put", payload: { data: batch } });
    var rows = (res.body && res.body.data) || [];
    for (var k = 0; k < batch.length; k++) {
      if (rows[k] && rows[k].code === "SUCCESS") updated++; else failed++;
    }
    batch = [];
  }

  for (var i = 0; i < values.length && (updated + failed + batch.length) < limit; i++) {
    var leadId = String(values[i][idCol] || "").trim();
    if (!leadId) continue;

    var params = {};
    for (var c = 0; c < header.length; c++) params[header[c]] = values[i][c];

    var lead = buildZohoLead(params, meta);
    delete lead.Lead_Status; // ステータスは営業が運用中なので上書きしない
    lead.id = leadId;
    batch.push(lead);
    if (batch.length === 100) flush();
  }
  flush();

  return "更新 " + updated + "件 / 失敗 " + failed + "件" +
    (meta.ok ? "" : "（項目メタデータの取得に失敗したため既定マッピングで送信）");
}

// 疎通確認用。エディタから実行して「ok: 組織名」が返れば認証まで通っている。
function testZohoConnection() {
  if (!zohoEnabled()) return "ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN が未設定";
  var res = zohoFetch("/org");
  if (res.code !== 200) return "NG: " + res.code + " " + JSON.stringify(res.body);
  var org = (res.body.org && res.body.org[0]) || {};
  return "ok: " + (org.company_name || org.primary_email || "connected");
}
