/**
 * LPフォーム送信 → Zoho CRM「商談(Deals)」自動作成
 *
 * なぜ見込み客(Leads)ではなく商談(Deals)か:
 *  営業チームの運用は Deals の「求職者対応」パイプラインで回っている
 *  （01_新規リード → 02_未通電 → 04_HOT → 09_履歴書作成 …）。
 *  見込み客モジュールは使われていないため、LP送信は商談として作る。
 *
 * Zoho側の仕様（2026-07-27 にAPIで確認。ハマりどころ）:
 *  - Stage は「表示名」と「内部値」がズレている。
 *      表示 01_新規リード / 内部値 求職者の見極め
 *      表示 02_未通電…   / 内部値 内定
 *    ただし **API には表示名の方を渡す**と通る（内部値を渡すと MAPPING_MISMATCH）。
 *  - Pipeline と Stage の組み合わせが合わないと MAPPING_MISMATCH で弾かれる。
 *    求職者対応 パイプラインのステージは Standard レイアウト側に定義されている。
 *  - 保有資格 shikaku は複数選択(multiselectpicklist)。LPの複数資格をそのまま入れられる。
 *  - 認証は Zoho Self Client のリフレッシュトークン。スクリプトプロパティに
 *      ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN
 *      ZOHO_ACCOUNTS_HOST (任意, 既定 https://accounts.zoho.jp)
 *      ZOHO_API_HOST      (任意, 既定 https://www.zohoapis.jp)
 *    を設定する。未設定なら連携ごと無効（スプシ記録は従来どおり動く）。
 *
 * 動作:
 *  - doPost のフォーム送信時に商談を作成し、zoho_deal_id / zoho_synced_at を行に書き戻す。
 *  - 作成前に電話番号でZoho側を検索し、既にあれば作らずIDだけ紐付ける（重複防止）。
 *  - 失敗しても doPost 自体は成功させる。理由は zoho_error 列に残す。
 */

var ZOHO_DEFAULT_ACCOUNTS_HOST = "https://accounts.zoho.jp";
var ZOHO_DEFAULT_API_HOST = "https://www.zohoapis.jp";
var ZOHO_API_VERSION = "v8";

var ZOHO_DEAL_PIPELINE = "求職者対応";
var ZOHO_DEAL_STAGE = "01_新規リード"; // 表示名で渡す（上のコメント参照）

// シート「your-license01」表記 → Zoho 保有資格(shikaku) の選択肢。複数可。
var ZOHO_SHIKAKU_MAP = {
  "第一種電気工事士": "第1種電気工事士",
  "第二種電気工事士": "第2種電気工事士",
  "電気施工管理 1級": "1級電気工事施工管理技士",
  "電気施工管理 2級": "2級電気工事施工管理技士",
  "1級電気施工管理技士": "1級電気工事施工管理技士",
  "2級電気施工管理技士": "2級電気工事施工管理技士",
  "1級電気工事施工管理技士": "1級電気工事施工管理技士",
  "2級電気工事施工管理技士": "2級電気工事施工管理技士",
  "1級建築施工管理技士": "1級建築施工管理技士",
  "2級建築施工管理技士": "2級建築施工管理技士",
  "1級管工事施工管理技士": "1級管工事施工管理技士",
  "2級管工事施工管理技士": "2級管工事施工管理技士",
  "1級土木施工管理技士": "1級土木施工管理技士",
  "2級土木施工管理技士": "2級土木施工管理技士",
  "電気主任技術者": "第3種電気主任技術者",
  "その他の資格": "その他"
};

// テスト送信とみなす氏名（姓+名を連結して判定）
var ZOHO_PLACEHOLDER_NAMES = [
  "あ", "ああ", "あああ", "ああい", "あい", "い", "いい",
  "h", "hh", "テスト", "てすと", "test", "ytest", "さかな", "aaa",
  "山田太郎", "やまだたろう", "ヤマダタロウ", "名前なし", "匿名", "テスト太郎"
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
// forceRefresh=true でキャッシュを捨てて取り直す（401を食らったときの再試行用）。
function zohoAccessToken(forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (forceRefresh) {
    cache.remove("zoho_access_token");
  } else {
    var cached = cache.get("zoho_access_token");
    if (cached) return cached;
  }

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

// キャッシュ中のアクセストークンが失効・無効化されていることがあるため、
// 401 を食らったら一度だけトークンを取り直して再試行する。
function zohoFetch(path, options) {
  options = options || {};

  function call(forceRefresh) {
    var params = {
      method: options.method || "get",
      muteHttpExceptions: true,
      headers: { Authorization: "Zoho-oauthtoken " + zohoAccessToken(forceRefresh) }
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

  var result = call(false);
  if (result.code === 401) result = call(true);
  return result;
}

/**
 * 失敗レスポンスを読める文字列にする。
 * ※以前は data[0]（存在しないとき `{}`）だけを出していたため、認証エラーの本文が
 *   丸ごと消えて「401 {}」としか分からなかった。本文が無い場合も原因の見当を添える。
 */
function zohoErrorText(res) {
  var body = res.body || {};
  var detail = (body.data && body.data[0]) ? body.data[0] : body;
  var text = JSON.stringify(detail);
  if (!text || text === "{}") text = "(応答本文なし)";

  var hint = "";
  if (res.code === 401) {
    hint = " ※アクセストークンが無効。商談(Deals)権限を含まないスコープでリフレッシュ" +
           "トークンを発行している場合に出る（OAUTH_SCOPE_MISMATCH）。" +
           "Zoho連携セットアップ.md の手順1をやり直して ZOHO_REFRESH_TOKEN を差し替える。";
  } else if (res.code === 403) {
    hint = " ※権限不足。CRMユーザーのプロフィール権限を確認。";
  }
  return res.code + " " + text + hint;
}

/**
 * Deals の項目メタデータ（使える項目・各ピックリストの選択肢）を取得。
 * Zoho画面での項目追加・選択肢追加に自動追従させるための土台。6時間キャッシュ。
 * 取得に失敗したら「制約なし」を返し、送信自体は止めない。
 */
function zohoFieldMeta() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("zoho_deals_field_meta");
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* 壊れていたら取り直す */ }
  }

  var meta = { ok: false, usable: {}, options: {} };
  try {
    var res = zohoFetch("/settings/fields?module=Deals&type=all");
    if (res.code === 200 && res.body && res.body.fields) {
      meta.ok = true;
      res.body.fields.forEach(function (f) {
        meta.usable[f.api_name] = f.type !== "unused";
        if (f.pick_list_values && f.pick_list_values.length) {
          // Stage のように表示名と内部値がズレる項目があるため、両方を許容値として持つ
          var vals = [];
          f.pick_list_values.forEach(function (v) {
            if (v.actual_value != null) vals.push(v.actual_value);
            if (v.display_value != null && vals.indexOf(v.display_value) === -1) vals.push(v.display_value);
          });
          meta.options[f.api_name] = vals;
        }
      });
      cache.put("zoho_deals_field_meta", JSON.stringify(meta), 6 * 60 * 60);
    }
  } catch (err) {
    // メタ取得に失敗しても登録は続行する
  }
  return meta;
}

function zohoFieldUsable(meta, apiName) {
  if (!meta.ok) return true;
  return meta.usable[apiName] !== false;
}

// ピックリストに実在する値だけ通す。メタ未取得なら素通し。
function zohoValidOption(meta, apiName, value) {
  if (!value) return "";
  if (!meta.ok || !meta.options[apiName]) return value;
  return meta.options[apiName].indexOf(value) !== -1 ? value : "";
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

// 09012345678 のような連番ダミー番号か。
// 「一方向に」6桁以上つながっている場合のみ該当とする。
// ※ 1,2,1,2 のような往復を連番扱いすると実在の番号を誤検知する
//   （例: 09012123159 叶さん / 08034545213 永井さん）。方向が変わったら数え直す。
function zohoIsSequentialTel(tel) {
  var run = 1, dir = 0;
  for (var i = 1; i < tel.length; i++) {
    var diff = Number(tel.charAt(i)) - Number(tel.charAt(i - 1));
    if ((diff === 1 || diff === -1) && (dir === 0 || diff === dir)) {
      run++;
      dir = diff;
    } else if (diff === 1 || diff === -1) {
      run = 2;
      dir = diff;
    } else {
      run = 1;
      dir = 0;
    }
    if (run >= 6) return true;
  }
  return false;
}

// 明らかなテスト送信（1111111111 / 09012345678 のような番号、氏名「ああ」「山田太郎」等）は Zoho に流さない
function zohoIsTestSubmission(params) {
  var tel = zohoNormalizeTel(params["your-tel"]);

  var distinct = {};
  for (var i = 0; i < tel.length; i++) distinct[tel.charAt(i)] = true;
  if (Object.keys(distinct).length < 3) return true;
  if (zohoIsSequentialTel(tel)) return true;

  var name = String(params["your-last-name"] || "").trim() + String(params["your-first-name"] || "").trim();
  name = name.replace(/\s|　/g, "").toLowerCase();
  return ZOHO_PLACEHOLDER_NAMES.indexOf(name) !== -1;
}

/**
 * LPの保有資格文字列 → Zohoの選択肢配列（複数選択）。
 * 戻り値: { values: [...], unmapped: [...] }
 *   unmapped … 対応表に無くて「その他」に寄せた原文。shikaku_sonota に入れる分だけ。
 */
function zohoBuildShikaku(meta, raw) {
  var parts = String(raw || "").split(",");
  var values = [], unmapped = [];
  for (var i = 0; i < parts.length; i++) {
    var key = parts[i].trim();
    if (!key) continue;
    var mapped = ZOHO_SHIKAKU_MAP[key];
    if (!mapped) {
      mapped = "その他";
      unmapped.push(key);
    }
    var valid = zohoValidOption(meta, "shikaku", mapped);
    if (valid && values.indexOf(valid) === -1) values.push(valid);
  }
  if (values.length === 0) {
    var none = zohoValidOption(meta, "shikaku", "資格無し");
    if (none) values.push(none);
  }
  return { values: values, unmapped: unmapped };
}

/**
 * 広告パラメータを取り出す。個別列が空でも `_page`（送信時URL）から読み直す。
 * utm_* の個別列は2026-07に追加したもので、それ以前の行は列が空・URLにだけ情報がある。
 * （コード.js の backfillTrackingParams() で列を埋められるが、未実行でも困らないようにする）
 */
function zohoTrackingParams(params) {
  var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"];
  var out = {};
  var missing = false;
  keys.forEach(function (k) {
    out[k] = String(params[k] == null ? "" : params[k]).trim();
    if (!out[k]) missing = true;
  });

  if (missing && params["_page"]) {
    try {
      var q = parseQueryParams(String(params["_page"]));
      keys.forEach(function (k) {
        if (!out[k] && q[k]) out[k] = String(q[k]).trim();
      });
    } catch (e) {
      // URLが壊れていても致命傷にしない
    }
  }
  return out;
}

/**
 * マーケティングチャネル欄に「どこから来て、どのKW/クリエイティブで刺さったか」を入れる。
 * 従来は utm_source だけ（google / ig）で、KWも広告も分からなかった。
 *
 *   検索広告: google/cpc｜014_denki_top_of_page｜KW: 電気 工事 士 求人 (phrase_match)
 *   SNS広告 : ig/paid｜120248499798320789｜CR: denkovlog
 *   自然流入: denkikouji｜自然流入
 *
 * ※Metaの広告セットIDはLPのURLに入ってこない（utm_id はキャンペーンIDと同値）。
 *   広告セット単位で見たい場合は広告側のURLに {{adset.id}} を足す必要がある。
 */
function zohoMarketingChannel(params) {
  var t = zohoTrackingParams(params);
  var src = t.utm_source;
  var med = t.utm_medium;
  var camp = t.utm_campaign || t.utm_id;
  var term = t.utm_term || String(params["your-term"] || "").trim();
  var content = t.utm_content;

  if (!src) {
    return (String(params["_lp"] || "").trim() || "不明") + "｜自然流入";
  }

  var parts = [src + (med ? "/" + med : "")];
  if (camp) parts.push(camp);

  // 検索広告はKW、SNS広告はクリエイティブが知りたい情報
  var isSearch = (med === "cpc" || med === "ppc" || src === "google" || src === "yahoo");
  if (isSearch) {
    var kw = "KW: " + (term || "不明");
    if (content) kw += " (" + content + ")"; // Google はマッチタイプが入る
    parts.push(kw);
  } else {
    parts.push("CR: " + (term || content || "不明"));
  }

  var out = parts.join("｜");
  return out.length > 250 ? out.slice(0, 250) : out; // text項目の上限対策
}

// Zohoの商談1件ぶんのペイロードを作る
function buildZohoDeal(params, meta) {
  meta = meta || zohoFieldMeta();
  var license = String(params["your-license01"] || "").trim();
  var tel = zohoNormalizeTel(params["your-tel"]);
  var name = (String(params["your-last-name"] || "").trim() + String(params["your-first-name"] || "").trim())
    .replace(/　/g, " ").trim() || "(氏名未入力)";

  var info = [
    "LP: " + (params["_lp"] || ""),
    "送信: " + (params["_received_at"] || ""),
    "経験: " + (params["your-experience"] || "未選択"),
    "転職意欲: " + (params["your-willingness"] || "未選択")
  ];
  if (String(params["your-term"] || "").trim()) info.push("検索語: " + String(params["your-term"]).trim());
  var track = zohoTrackingParams(params);
  var utm = [track.utm_source, track.utm_medium, track.utm_campaign]
    .filter(function (v) { return !!v; }).join("/");
  if (utm) info.push("utm: " + utm);
  if (track.utm_term) info.push("utm_term: " + track.utm_term);
  if (track.utm_content) info.push("utm_content: " + track.utm_content);
  if (track.utm_id && track.utm_id !== track.utm_campaign) info.push("utm_id: " + track.utm_id);
  info.push("LINE登録: " + (params["line_clicked_at"] ? ("済 " + params["line_clicked_at"]) : "未"));
  if (String(params["email_captured_at"] || "").trim()) {
    info.push("メール登録: 済 " + params["email_captured_at"]);
  }
  if (tel.length !== 11) info.push("※電話番号が不正形式（原文: " + String(params["your-tel"] || "") + "）");

  var zip = zohoNormalizeZip(params["your-zip"]);
  // No_yubin は数値項目なので 0590031 → 590031 と先頭0が落ちる。原文をLP情報に残す。
  if (zip && zip.charAt(0) === "0") info.push("郵便番号: " + zip);

  var deal = {
    Deal_Name: name + "/" + license,
    Pipeline: ZOHO_DEAL_PIPELINE,
    Stage: ZOHO_DEAL_STAGE,
    m_phone_number: tel,
    name_EU: name,
    lp_info: info.join(" / "),
    marketing_channel: zohoMarketingChannel(params)
  };

  // 求職者登録日＝LP送信日
  var received = String(params["_received_at"] || "");
  if (received.length >= 10) deal.date_EuRegsiter = received.slice(0, 10);

  var shikaku = zohoBuildShikaku(meta, license);
  if (shikaku.values.length && zohoFieldUsable(meta, "shikaku")) deal.shikaku = shikaku.values;
  // 対応表に無くて「その他」に寄せた資格だけ原文を残す（マッピング済みは入れない）
  if (shikaku.unmapped.length && zohoFieldUsable(meta, "shikaku_sonota")) {
    deal.shikaku_sonota = shikaku.unmapped.join(", ");
  }

  var pref = zohoValidOption(meta, "area", String(params["your-pref"] || "").trim());
  if (pref) deal.area = pref;
  if (String(params["your-city"] || "").trim()) deal.shikuchoson = String(params["your-city"]).trim();

  if (zip) deal.No_yubin = Number(zip);

  if (String(params["your-birthday"] || "").trim()) deal.date_seinengappi = String(params["your-birthday"]).trim();
  if (String(params["your-email"] || "").trim()) deal.email_main = String(params["your-email"]).trim();

  return deal;
}

// 電話番号で既存の商談を探す。見つかればそのIDを返す（重複作成の防止）。
function findZohoDealByPhone(tel) {
  if (!tel) return "";
  var res = zohoFetch("/coql", {
    method: "post",
    payload: { select_query: "select id from Deals where m_phone_number = '" + tel + "' limit 1" }
  });
  if (res.code !== 200) return "";
  var data = (res.body && res.body.data) || [];
  return data.length > 0 ? String(data[0].id) : "";
}

/**
 * フォーム送信1件を Zoho の商談として登録する。
 * 戻り値: { ok:boolean, id?:string, existing?:boolean, skipped?:string, error?:string }
 * 例外は投げない（呼び出し元の doPost を落とさないため）。
 */
function syncDealToZoho(params, meta) {
  try {
    if (!zohoEnabled()) return { ok: false, skipped: "disabled" };
    if (zohoIsTestSubmission(params)) return { ok: false, skipped: "test_submission" };

    var tel = zohoNormalizeTel(params["your-tel"]);
    var existing = findZohoDealByPhone(tel);
    if (existing) return { ok: true, id: existing, existing: true };

    var deal = buildZohoDeal(params, meta);
    var res = zohoFetch("/Deals", { method: "post", payload: { data: [deal] } });
    var first = (res.body && res.body.data && res.body.data[0]) || {};
    if (res.code === 201 && first.code === "SUCCESS") {
      return { ok: true, id: String(first.details && first.details.id) };
    }
    return { ok: false, error: zohoErrorText(res) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * LINE追加クリック／メール登録が後から届いたときに、紐づく商談へ反映する。
 * 該当行に zoho_deal_id が無ければ何もしない（初回送信時の作成に任せる）。
 * 送るのは LP情報とメールアドレスだけ。ステージ等の営業運用項目は触らない。
 * 例外は投げない（呼び出し元のイベント処理を落とさないため）。
 */
function updateZohoDealFromRow(sheet, header, rowNum) {
  try {
    if (!zohoEnabled()) return { ok: false, skipped: "disabled" };
    var idCol = header.indexOf("zoho_deal_id");
    if (idCol === -1) return { ok: false, skipped: "no_column" };

    var row = sheet.getRange(rowNum, 1, 1, header.length).getValues()[0];
    var dealId = String(row[idCol] || "").trim();
    if (!dealId) return { ok: false, skipped: "not_linked" };

    var params = {};
    for (var c = 0; c < header.length; c++) params[header[c]] = row[c];

    var deal = buildZohoDeal(params);
    var payload = { id: dealId, lp_info: deal.lp_info };
    if (deal.email_main) payload.email_main = deal.email_main;

    var res = zohoFetch("/Deals", { method: "put", payload: { data: [payload] } });
    var first = (res.body && res.body.data && res.body.data[0]) || {};
    if (res.code === 200 && first.code === "SUCCESS") return { ok: true, id: dealId };
    return { ok: false, error: zohoErrorText(res) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * 未連携行（zoho_deal_id が空）をまとめて商談化する。
 * 電話番号でZoho側を検索してから作るため、何度実行しても重複しない。
 * 1回の実行で最大 limit 行（既定80行。GASの6分制限に収める）。
 * Apps Script エディタから手動実行する想定。
 */
function backfillZohoDeals(limit) {
  if (!zohoEnabled()) return "ZOHO_* のスクリプトプロパティが未設定のため実行しません";
  limit = limit || 80;

  var sheet = getSheet();
  var header = ensureHeader(sheet);
  ensureColumn(sheet, header, "zoho_deal_id");
  ensureColumn(sheet, header, "zoho_synced_at");
  ensureColumn(sheet, header, "zoho_error");
  header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "対象行なし";

  var values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var idCol = header.indexOf("zoho_deal_id");
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

    var result = syncDealToZoho(params, meta);
    if (result.ok) {
      updateRowColumns(sheet, header, rowNum, {
        zoho_deal_id: result.id,
        zoho_synced_at: toJst(new Date()),
        zoho_error: ""
      });
      if (result.existing) linked++; else created++;
    } else {
      updateRowColumns(sheet, header, rowNum, { zoho_error: result.error || result.skipped || "unknown" });
      failed++;
    }
  }

  return "処理 " + processed + "行: 新規作成 " + created +
    " / 既存に紐付け " + linked + " / テスト除外 " + skipped + " / 失敗 " + failed;
}

/**
 * 連携済み（zoho_deal_id がある）行を、今の項目マッピングで上書きし直す。
 * Zoho画面で選択肢を足したあとに1回まわすと過去分も追いつく。
 * 営業が運用する ステージ / 商談名 / 担当者 は送らない（上書きしない）。
 * 1回の実行で最大 limit 行（既定150行）。
 */
function resyncZohoDealFields(limit) {
  if (!zohoEnabled()) return "ZOHO_* のスクリプトプロパティが未設定のため実行しません";
  limit = limit || 150;

  var sheet = getSheet();
  var header = ensureHeader(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "対象行なし";

  var values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var idCol = header.indexOf("zoho_deal_id");
  if (idCol === -1) return "zoho_deal_id 列がありません。先に backfillZohoDeals() を実行してください";

  var meta = zohoFieldMeta();
  var batch = [], updated = 0, failed = 0;

  function flush() {
    if (!batch.length) return;
    var res = zohoFetch("/Deals", { method: "put", payload: { data: batch } });
    var rows = (res.body && res.body.data) || [];
    for (var k = 0; k < batch.length; k++) {
      if (rows[k] && rows[k].code === "SUCCESS") updated++; else failed++;
    }
    batch = [];
  }

  for (var i = 0; i < values.length && (updated + failed + batch.length) < limit; i++) {
    var dealId = String(values[i][idCol] || "").trim();
    if (!dealId) continue;

    var params = {};
    for (var c = 0; c < header.length; c++) params[header[c]] = values[i][c];

    var deal = buildZohoDeal(params, meta);
    // 営業が動かす項目は触らない
    delete deal.Stage;
    delete deal.Pipeline;
    delete deal.Deal_Name;
    deal.id = dealId;
    batch.push(deal);
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
