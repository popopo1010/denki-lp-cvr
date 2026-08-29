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

/**
 * 実行ログに出しつつ同じ値を返す。
 * Apps Script は関数の戻り値をログに表示しないため、エディタから手動実行したとき
 * 「実行完了」しか出ず結果が分からなかった。手動実行する関数はこれを通す。
 */
function zohoLog(message) {
  try { console.log(message); } catch (e) { /* ログに出せなくても処理は返す */ }
  return message;
}

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

/**
 * 日付らしき値を Zoho の date 項目形式（YYYY-MM-DD）にする。変換できなければ ""。
 * シート経由（backfill / resync）ではセルが日付型（Dateオブジェクト）に変換されて
 * いることがあり、String() すると "Tue Aug 05 …" になって INVALID_DATA で弾かれる。
 * "2026/8/5 12:34:56" のような日時文字列も日付部分だけ取り出す。
 */
function zohoToDateString(v) {
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, "Asia/Tokyo", "yyyy-MM-dd");
  }
  var m = String(v == null ? "" : v).trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  return m ? m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]) : "";
}

/**
 * 生年月日を Zoho の date 項目形式（YYYY-MM-DD）に組み立てる。
 * 現行LPは「生まれ年（西暦）」しか聞かないため、フル日付が無い行がほとんど。
 * その場合は月日を 4/1 に仮置きして返す（年齢が分かる状態にするのが目的）。
 * 仮置きかどうかは yearOnly で返し、呼び出し側が lp_info に明記する。
 * 戻り値: { date: "YYYY-MM-DD" | "", yearOnly: boolean }
 */
function zohoBuildBirthday(params) {
  var full = zohoToDateString(params["your-birthday"]);
  if (full) return { date: full, yearOnly: false };

  var y = String(params["your-birthday-year"] == null ? "" : params["your-birthday-year"]).trim();
  if (/^(19|20)\d{2}$/.test(y)) return { date: y + "-04-01", yearOnly: true };
  return { date: "", yearOnly: false };
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

  // 生まれ年のみ回答のときは月日を 4/1 に仮置きする。実誕生日と混同しないよう明記。
  var birthday = zohoBuildBirthday(params);
  if (birthday.yearOnly) info.push("生年月日は年のみ回答（月日は4/1の仮置き）");

  var deal = {
    Deal_Name: name + "/" + license,
    Pipeline: ZOHO_DEAL_PIPELINE,
    Stage: ZOHO_DEAL_STAGE,
    m_phone_number: tel,
    name_EU: name,
    lp_info: info.join(" / "),
    marketing_channel: zohoMarketingChannel(params)
  };

  // 求職者登録日＝LP送信日（日付型セル・"2026/8/5" 形式も正規化する）
  var received = zohoToDateString(params["_received_at"]);
  if (received) deal.date_EuRegsiter = received;

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

  if (birthday.date) deal.date_seinengappi = birthday.date;
  if (String(params["your-email"] || "").trim()) deal.email_main = String(params["your-email"]).trim();

  return deal;
}

// 電話番号で既存の商談を探す。見つかればそのIDを返す（重複作成の防止）。
/**
 * 同じ電話番号の商談を探す。**ただし「直近」だけを重複とみなす。**
 *
 * 以前は「同じ番号の商談が1件でもあれば作らない」だったが、これだと
 * **過去に登録した人が再登録しても新規リードとして上がってこない**。
 * 実際 2026-08 のテストで、2025年の商談に紐づいた番号が新規に出ず、
 * オーナーが「Slackにも来ない・Zohoにも増えない」と気づく事故になった。
 * 再登録は営業にとって「今また動いている人」なので、必ず新しい商談として立てる。
 *
 * 一方で守りたいのは「1回の送信が二重に処理される」ケース（再送・リトライ）だけ。
 * そこで **直近 ZOHO_DEDUP_HOURS 時間以内に作られた商談があるときだけ** 重複とみなす。
 * 判定できないときは作る側に倒す（リードを落とすほうが、重複より損失が大きい）。
 */
var ZOHO_DEDUP_HOURS = 24;

function findZohoDealByPhone(tel) {
  if (!tel) return "";
  var res = zohoFetch("/coql", {
    method: "post",
    payload: {
      select_query: "select id, Created_Time from Deals where m_phone_number = '" + tel +
        "' order by Created_Time desc limit 1"
    }
  });
  if (res.code !== 200) return "";
  var data = (res.body && res.body.data) || [];
  if (!data.length) return "";
  var created = new Date(data[0].Created_Time);
  if (isNaN(created.getTime())) return "";
  var hours = (Date.now() - created.getTime()) / 3600000;
  return hours <= ZOHO_DEDUP_HOURS ? String(data[0].id) : "";
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
  if (!zohoEnabled()) return zohoLog("ZOHO_* のスクリプトプロパティが未設定のため実行しません");
  limit = limit || 80;

  var sheet = getSheet();
  var header = ensureHeader(sheet);
  ensureColumn(sheet, header, "zoho_deal_id");
  ensureColumn(sheet, header, "zoho_synced_at");
  ensureColumn(sheet, header, "zoho_error");
  header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return zohoLog("対象行なし");

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

  return zohoLog("処理 " + processed + "行: 新規作成 " + created +
    " / 既存に紐付け " + linked + " / テスト除外 " + skipped + " / 失敗 " + failed);
}

/**
 * 連携済み（zoho_deal_id がある）行の「Zoho側で空いている項目だけ」を埋める。
 *
 * ※上書きはしない。既存の商談には別パイプラインが入れた独自形式の lp_info
 *   （名前/年齢/経験/転職時期/資格…）や、検索KWが入った marketing_channel があり、
 *   こちらの形式で塗り潰すと営業にとって情報が劣化するため。
 *   営業が運用する ステージ / 商談名 / パイプライン / 担当者 も当然送らない。
 *
 * 1回の実行で最大 limit 行（既定150行）。
 */
function resyncZohoDealFields(limit) {
  if (!zohoEnabled()) return zohoLog("ZOHO_* のスクリプトプロパティが未設定のため実行しません");
  limit = limit || 150;

  var sheet = getSheet();
  var header = ensureHeader(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return zohoLog("対象行なし");

  var values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var idCol = header.indexOf("zoho_deal_id");
  if (idCol === -1) return zohoLog("zoho_deal_id 列がありません。先に backfillZohoDeals() を実行してください");

  var meta = zohoFieldMeta();
  // 埋める候補。ステージ・商談名・パイプラインは含めない
  var FILLABLE = ["name_EU", "area", "shikaku", "shikaku_sonota", "shikuchoson",
                  "No_yubin", "date_seinengappi", "date_EuRegsiter", "email_main",
                  "lp_info", "marketing_channel"];

  // 対象行を集める（1商談につき1行。同じIDが複数行にある場合は最初の行を使う）
  var targets = [], seen = {};
  for (var i = 0; i < values.length && targets.length < limit; i++) {
    var dealId = String(values[i][idCol] || "").trim();
    if (!dealId || seen[dealId]) continue;
    seen[dealId] = true;
    var params = {};
    for (var c = 0; c < header.length; c++) params[header[c]] = values[i][c];
    targets.push({ id: dealId, params: params });
  }
  if (!targets.length) return zohoLog("連携済みの行がありません。先に backfillZohoDeals() を実行してください");

  var updated = 0, failed = 0, skipped = 0, filledCount = {}, failReasons = {};
  function noteFail(reason) { failReasons[reason] = (failReasons[reason] || 0) + 1; failed++; }

  // Zoho側の現在値を50件ずつ取得 → 空いている項目だけ送る
  for (var s = 0; s < targets.length; s += 50) {
    var chunk = targets.slice(s, s + 50);
    var ids = chunk.map(function (t) { return t.id; }).join(",");
    var q = zohoFetch("/coql", {
      method: "post",
      payload: { select_query: "select id," + FILLABLE.join(",") + " from Deals where id in (" + ids + ") limit 50" }
    });
    if (q.code !== 200) {
      for (var f0 = 0; f0 < chunk.length; f0++) noteFail("現在値の取得に失敗: " + zohoErrorText(q));
      continue;
    }

    var current = {};
    ((q.body && q.body.data) || []).forEach(function (r) { current[String(r.id)] = r; });

    var batch = [];
    chunk.forEach(function (t) {
      var cur = current[t.id];
      if (!cur) { noteFail("Zohoに該当商談なし（削除された可能性）"); return; }
      var desired = buildZohoDeal(t.params, meta);
      var payload = { id: t.id }, n = 0;
      FILLABLE.forEach(function (f) {
        var existing = cur[f];
        var isEmpty = (existing == null || existing === "" ||
                       (existing instanceof Array && existing.length === 0) ||
                       (f === "area" && existing === "不明"));
        if (!isEmpty) return;
        var v = desired[f];
        if (v == null || v === "" || (v instanceof Array && v.length === 0)) return;
        payload[f] = v;
        filledCount[f] = (filledCount[f] || 0) + 1;
        n++;
      });
      if (n === 0) { skipped++; return; }
      batch.push(payload);
    });

    if (!batch.length) continue;
    var res = zohoFetch("/Deals", { method: "put", payload: { data: batch } });
    var rows = (res.body && res.body.data) || [];
    for (var k = 0; k < batch.length; k++) {
      var r = rows[k];
      if (r && r.code === "SUCCESS") { updated++; continue; }
      // どの項目で弾かれたかまで残す。原因が分からないと直しようがない
      var reason = r ? (r.code + ": " + (r.message || "")) : ("応答なし " + res.code);
      if (r && r.details && r.details.api_name) reason += " [" + r.details.api_name + "]";
      var sent = Object.keys(batch[k]).filter(function (x) { return x !== "id"; }).join(",");
      noteFail(reason + " / 送信項目: " + sent);
    }
  }

  var detail = Object.keys(filledCount).map(function (f) { return f + " " + filledCount[f]; }).join(" / ");
  var fails = Object.keys(failReasons).map(function (f) { return "  ・" + f + " × " + failReasons[f]; }).join("\n");
  return zohoLog("対象 " + targets.length + "件: 更新 " + updated + " / 埋める項目なし " + skipped + " / 失敗 " + failed +
         (detail ? "\n埋めた項目: " + detail : "") +
         (fails ? "\n失敗の内訳:\n" + fails : ""));
}

/**
 * resyncZohoDealFields() を全行ぶん一括実行するエントリポイント。
 * エディタの「実行」からは引数を渡せず、既定の150行では
 * 「毎回先頭150行だけ処理して151行目以降に届かない」ため（再開カーソルなし）、
 * 連携済み行が150行を超えたらこちらを実行する。
 * 1000行 ≒ COQL 20回 + 更新20バッチで、GASの6分制限には収まる。
 */
function resyncZohoDealFieldsAll() {
  return resyncZohoDealFields(1000);
}

// 疎通確認用。エディタから実行して「ok: 組織名」が返れば認証まで通っている。
function testZohoConnection() {
  if (!zohoEnabled()) return zohoLog("ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN が未設定");
  var res = zohoFetch("/org");
  if (res.code !== 200) return zohoLog("NG: " + res.code + " " + JSON.stringify(res.body));
  var org = (res.body.org && res.body.org[0]) || {};
  return zohoLog("ok: " + (org.company_name || org.primary_email || "connected"));
}

/**
 * 【セットアップ用】Zohoの認可コード → リフレッシュトークンの交換をGAS内で完結させる。
 *
 * 手動でcurlを叩いてトークンをコピペする運用は、
 *  - Codeが10分・1回きりで、失敗した時点でも使い切りになる
 *  - Code と refresh_token がどちらも "1000." 始まりで取り違えやすい
 *  - コピー時の空白・改行混入に気づけない
 * という事故が起きやすい。ここで交換まで済ませ、結果を直接スクリプトプロパティへ書く。
 *
 * 手順:
 *  1. api-console で Generate Code → 表示された Code をコピー
 *  2. スクリプトプロパティに ZOHO_AUTH_CODE として貼り付けて保存
 *  3. この関数を実行（成功すると ZOHO_REFRESH_TOKEN が自動保存され、
 *     使い終わった ZOHO_AUTH_CODE は削除される）
 *  4. testZohoConnection() で確認
 */
function exchangeZohoCode() {
  var props = PropertiesService.getScriptProperties();
  var code = String(props.getProperty("ZOHO_AUTH_CODE") || "").trim();
  if (!code) {
    return "NG: スクリプトプロパティ ZOHO_AUTH_CODE が空です。" +
           "api-console で Generate Code した Code を ZOHO_AUTH_CODE に貼って保存してから実行してください。";
  }

  var clientId = String(props.getProperty("ZOHO_CLIENT_ID") || "").trim();
  var clientSecret = String(props.getProperty("ZOHO_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) return zohoLog("NG: ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET が未設定です。");

  var url = zohoAccountsHost() + "/oauth/v2/token" +
    "?grant_type=authorization_code" +
    "&client_id=" + encodeURIComponent(clientId) +
    "&client_secret=" + encodeURIComponent(clientSecret) +
    "&code=" + encodeURIComponent(code);

  var res = UrlFetchApp.fetch(url, { method: "post", muteHttpExceptions: true });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = {}; }

  if (!body.refresh_token) {
    var err = body.error || res.getContentText();
    var hint = "";
    if (String(err).indexOf("invalid_code") !== -1) {
      hint = " ※Codeの期限切れ(10分)か、既に一度使われています。" +
             "api-console で Generate Code から新しいCodeを発行し、" +
             "ZOHO_AUTH_CODE に貼り直してすぐ実行してください。";
    } else if (String(err).indexOf("invalid_client") !== -1) {
      hint = " ※ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET を確認してください。";
    }
    return zohoLog("NG: " + err + hint);
  }

  props.setProperty("ZOHO_REFRESH_TOKEN", body.refresh_token);
  props.deleteProperty("ZOHO_AUTH_CODE");          // 使い切りなので残さない
  CacheService.getScriptCache().remove("zoho_access_token"); // 旧トークンのキャッシュを捨てる

  return zohoLog("ok: ZOHO_REFRESH_TOKEN を保存しました（長さ " + body.refresh_token.length + "）。" +
         "続けて testZohoConnection() を実行してください。");
}

/**
 * 【診断用】保存されている認証情報の「形」だけを表示する。値そのものは出さない。
 * 取り違え（Codeを入れている / access_tokenを入れている）や空白混入の切り分けに使う。
 */
function diagnoseZohoProps() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var keys = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_AUTH_CODE",
              "ZOHO_ACCOUNTS_HOST", "ZOHO_API_HOST"];
  var lines = [];
  keys.forEach(function (k) {
    var v = props[k];
    if (v == null) { lines.push(k + ": (未設定)"); return; }
    var trimmed = v.trim();
    lines.push(k + ": 長さ" + v.length +
      (v.length !== trimmed.length ? " ※前後に空白/改行あり" : "") +
      " / 先頭6文字 " + trimmed.slice(0, 6) +
      " / ドット数 " + (trimmed.split(".").length - 1));
  });
  return zohoLog(lines.join("\n"));
}
