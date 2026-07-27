/**
 * 候補者ステージの代理店共有（個人情報なし）
 *
 * 目的:
 *  マーケ代理店に「どのチャネル/キャンペーンから来た候補者が、いま Zoho のどのステージか」を
 *  随時共有する。ただし**個人情報は一切渡さない**。
 *
 * なぜ別スプレッドシートなのか:
 *  Googleの共有権限は**ファイル単位**で、同じスプレッドシート内のタブごとに権限を分けられない。
 *  form_submissions のシートを共有すると氏名・電話・メールまで見えてしまうため、
 *  個人情報を落とした行だけを**別ファイル**に書き出し、そのファイルだけを代理店に渡す。
 *
 * 動作:
 *  - syncAgencyShare() が form_submissions を読み、Zohoから現在のステージを取り直して
 *    共有用スプレッドシートを毎回まるごと作り直す（＝ステージは常に最新・冪等）。
 *  - Apps Script の時間主導トリガー（1時間おき）に syncAgencyShare を登録して自動更新する。
 *  - 出す列は AGENCY_SHARE_COLUMNS の許可リストだけ。さらに書き出す直前に
 *    元データの個人情報が混ざっていないかを1セルずつ検査して、混ざっていたら書き込みを中止する。
 *
 * セットアップ:
 *  gas-recorder/代理店共有セットアップ.md を参照。
 */

var AGENCY_SHARE_DETAIL_SHEET = "候補者ステージ";
var AGENCY_SHARE_SUMMARY_SHEET = "チャネル別サマリ";
var AGENCY_SHARE_LEGEND_SHEET = "凡例";

// 共有シートに出してよい列。**ここに無い列は絶対に書き出さない**。
// 列を足すときは「個人が特定されないか」を必ず検討すること（氏名・電話・メール・生年月日・
// 郵便番号・市区町村・IP・UAは共有対象外＝AGENCY_SHARE_PII_KEYS）。
var AGENCY_SHARE_COLUMNS = [
  "lead_id",
  "送信日",
  "送信月",
  "LP",
  "マーケチャネル",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "ステージ",
  "ステージ更新日",
  "LINE登録"
];

// 共有してはいけない元シートの列。書き出し直前の検査（assertNoPii）に使う。
var AGENCY_SHARE_PII_KEYS = [
  "your-tel",
  "your-last-name",
  "your-first-name",
  "your-birthday",
  "your-zip",
  "your-city",
  "your-email",
  "calendar_guest_name",
  "calendar_guest_email",
  "_ip",
  "_user_agent"
];

// 広告クリックID（gclid / fbclid 等）は個人情報ではないが「特定の1クリック」を指す識別子。
// オフラインコンバージョンの取り込みに使いたい場合だけ true にする（既定は共有しない）。
var AGENCY_SHARE_INCLUDE_CLICK_IDS = false;
var AGENCY_SHARE_CLICK_ID_COLUMNS = ["gclid", "gbraid", "wbraid", "yclid", "fbclid", "msclkid"];

// Zohoに商談が無い/消えている行のステージ表記
var AGENCY_SHARE_STAGE_UNLINKED = "CRM未連携";
var AGENCY_SHARE_STAGE_UNKNOWN = "不明";

function agencyShareColumns() {
  return AGENCY_SHARE_INCLUDE_CLICK_IDS
    ? AGENCY_SHARE_COLUMNS.concat(AGENCY_SHARE_CLICK_ID_COLUMNS)
    : AGENCY_SHARE_COLUMNS.slice();
}

// スクリプトプロパティはモジュール先頭で1回キャッシュされる（getScriptProp）ため、
// セットアップ中に書き足した値も読めるよう、ここでは都度読み直す。
function agencyShareProp(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || "").trim();
}

/**
 * lead_id は「同じ候補者は常に同じID・そこから本人には戻れない」ためのハッシュ。
 * 代理店が重複を数えたり期間をまたいで追跡できるようにするだけの用途。
 * ソルトはスクリプトプロパティ AGENCY_SHARE_SALT（未設定なら初回に自動生成）。
 */
function agencyShareSalt() {
  var salt = agencyShareProp("AGENCY_SHARE_SALT");
  if (!salt) {
    salt = Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty("AGENCY_SHARE_SALT", salt);
  }
  return salt;
}

function agencyShareLeadId(seed, salt) {
  var raw = String(seed == null ? "" : seed).trim();
  if (!raw) return "";
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + "|" + raw,
                                      Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < bytes.length && hex.length < 12; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex.slice(0, 12);
}

/**
 * Zohoから商談IDごとの現在ステージを取ってくる。
 * COQL は1回200件までなので100件ずつ問い合わせる。
 * 戻り値: { map: { dealId: {stage, modified} }, errors: [...] }
 */
function fetchZohoStages(dealIds) {
  var out = { map: {}, errors: [] };
  if (!dealIds.length) return out;
  if (typeof zohoEnabled !== "function" || !zohoEnabled()) {
    out.errors.push("Zoho連携が無効（ZOHO_* 未設定）のためステージを取得できません");
    return out;
  }

  for (var i = 0; i < dealIds.length; i += 100) {
    var chunk = dealIds.slice(i, i + 100).map(function (id) {
      return "'" + String(id).replace(/[^0-9]/g, "") + "'"; // 数値以外は落として式を壊さない
    }).filter(function (v) { return v !== "''"; });
    if (!chunk.length) continue;

    var res = zohoFetch("/coql", {
      method: "post",
      payload: {
        select_query: "select id, Stage, Modified_Time from Deals where id in (" +
                      chunk.join(",") + ") limit 200"
      }
    });
    if (res.code === 204) continue;            // 該当なし（全件削除済みなど）
    if (res.code !== 200) {
      out.errors.push("COQL " + zohoErrorText(res));
      continue;
    }
    var rows = (res.body && res.body.data) || [];
    for (var r = 0; r < rows.length; r++) {
      out.map[String(rows[r].id)] = {
        stage: String(rows[r].Stage || ""),
        modified: rows[r].Modified_Time ? toJst(rows[r].Modified_Time) : ""
      };
    }
  }
  return out;
}

/**
 * 書き出す直前の安全網。元データの個人情報がセルに混ざっていたら例外を投げて中止する。
 * 完全一致に加え、5文字以上の値は部分一致も見る（"LP: 山田…" のような埋め込みを拾うため）。
 * ただし**数字だけの値（電話・郵便番号）は完全一致だけ**にする。
 * MetaのキャンペーンID（18桁）に郵便番号7桁が偶然含まれて誤検知するのを避けるため。
 */
function assertNoPii(row, params) {
  for (var i = 0; i < AGENCY_SHARE_PII_KEYS.length; i++) {
    var pii = String(params[AGENCY_SHARE_PII_KEYS[i]] == null ? "" : params[AGENCY_SHARE_PII_KEYS[i]]).trim();
    if (pii.length < 2) continue;
    var partial = pii.length >= 5 && !/^[0-9]+$/.test(pii);
    for (var c = 0; c < row.length; c++) {
      var cell = String(row[c] == null ? "" : row[c]);
      if (!cell) continue;
      if (cell === pii || (partial && cell.indexOf(pii) !== -1)) {
        throw new Error("個人情報が共有シートに混入しかけました（列: " +
                        AGENCY_SHARE_PII_KEYS[i] + "）。書き込みを中止しました。");
      }
    }
  }
}

/**
 * 共有用スプレッドシートを開く。AGENCY_SHARE_SHEET_ID 未設定なら null。
 */
function openAgencyShareSpreadsheet() {
  var id = agencyShareProp("AGENCY_SHARE_SHEET_ID");
  if (!id) return null;
  return SpreadsheetApp.openById(id);
}

// 事前に手で用意した空スプレッドシート（「シート1」だけ、等）を渡された場合は、
// その1枚を流用する。insertSheet だけだと空タブが残って代理店に紛らわしいため。
function agencyShareGetOrCreateSheet(ss, name) {
  var found = ss.getSheetByName(name);
  if (found) return found;

  var ours = [AGENCY_SHARE_DETAIL_SHEET, AGENCY_SHARE_SUMMARY_SHEET, AGENCY_SHARE_LEGEND_SHEET];
  var sheets = ss.getSheets();
  if (sheets.length === 1 && ours.indexOf(sheets[0].getName()) === -1) {
    return sheets[0].setName(name);
  }
  return ss.insertSheet(name);
}

/**
 * 代理店共有シートを最新化する（毎回まるごと作り直す）。
 * トリガーからも、エディタからの手動実行からも呼べる。
 */
function syncAgencyShare() {
  // どの理由で終わってもログに残す。無言で終わると
  // 「実行できたのにシートが更新されない」に見えて原因が分からない。
  function bail(msg) {
    Logger.log(msg);
    return msg;
  }

  var ss = openAgencyShareSpreadsheet();
  if (!ss) {
    return bail("NG: スクリプトプロパティ AGENCY_SHARE_SHEET_ID が未設定です。" +
                "設定するか setupAgencyShare() を実行してください。");
  }

  var src = getSheet();
  var header = ensureHeader(src);
  var lastRow = src.getLastRow();
  if (lastRow < 2) return bail("NG: 元データ（" + SHEET_NAME + "）が空です");

  var values = src.getRange(2, 1, lastRow - 1, header.length).getValues();
  var idx = {};
  for (var h = 0; h < header.length; h++) idx[header[h]] = h;

  var salt = agencyShareSalt();
  var cols = agencyShareColumns();
  var records = [];
  var dealIds = [];
  var excludedTest = 0;

  for (var i = 0; i < values.length; i++) {
    var params = {};
    for (var c = 0; c < header.length; c++) params[header[c]] = values[i][c];

    // テスト送信は代理店に見せない（数字が荒れるだけ）
    if (typeof zohoIsTestSubmission === "function" && zohoIsTestSubmission(params)) {
      excludedTest++;
      continue;
    }

    var dealId = String(params["zoho_deal_id"] || "").trim();
    if (dealId) dealIds.push(dealId);

    var received = String(params["_received_at"] || "").trim();
    var day = received.length >= 10 ? received.slice(0, 10) : "";
    var track = zohoTrackingParams(params); // 個別列が空でも _page のURLから復元する

    records.push({
      params: params,
      dealId: dealId,
      values: {
        lead_id: agencyShareLeadId(dealId || params["your-tel"], salt),
        "送信日": day,
        "送信月": day ? day.slice(0, 7) : "",
        LP: String(params["_lp"] || "").trim(),
        "マーケチャネル": zohoMarketingChannel(params),
        utm_source: track.utm_source,
        utm_medium: track.utm_medium,
        utm_campaign: track.utm_campaign,
        utm_content: track.utm_content,
        utm_term: track.utm_term,
        utm_id: track.utm_id,
        "ステージ": "",
        "ステージ更新日": "",
        "LINE登録": String(params["line_clicked_at"] || "").trim() ? "済" : "未",
        gclid: String(params["gclid"] || ""),
        gbraid: String(params["gbraid"] || ""),
        wbraid: String(params["wbraid"] || ""),
        yclid: String(params["yclid"] || ""),
        fbclid: String(params["fbclid"] || ""),
        msclkid: String(params["msclkid"] || "")
      }
    });
  }

  var stages = fetchZohoStages(dealIds);
  var rows = [];
  for (var k = 0; k < records.length; k++) {
    var rec = records[k];
    if (rec.dealId) {
      var found = stages.map[rec.dealId];
      rec.values["ステージ"] = found ? (found.stage || AGENCY_SHARE_STAGE_UNKNOWN)
                                     : AGENCY_SHARE_STAGE_UNKNOWN;
      rec.values["ステージ更新日"] = found ? String(found.modified || "").slice(0, 10) : "";
    } else {
      rec.values["ステージ"] = AGENCY_SHARE_STAGE_UNLINKED;
    }

    var row = cols.map(function (name) { return rec.values[name] == null ? "" : rec.values[name]; });
    assertNoPii(row, rec.params); // ここで落ちたら1行も書かずに終わる
    rows.push(row);
  }

  // 新しい送信が上に来た方が代理店は見やすい
  rows.sort(function (a, b) {
    return String(b[cols.indexOf("送信日")]).localeCompare(String(a[cols.indexOf("送信日")]));
  });

  writeAgencyShareDetail(ss, cols, rows);
  writeAgencyShareSummary(ss, cols, rows);
  setupAgencyShareLegend(ss);

  var msg = "共有シート更新: " + rows.length + "件" +
            "（テスト送信 " + excludedTest + "件を除外 / ステージ取得 " +
            Object.keys(stages.map).length + "件）" +
            " 最終更新 " + toJst(new Date());
  if (stages.errors.length) {
    msg += " ※Zoho取得エラー: " + stages.errors.join(" / ");
    if (typeof reportErrorToSlack === "function") {
      reportErrorToSlack("syncAgencyShare", stages.errors.join(" / "));
    }
  }
  Logger.log(msg);
  return msg;
}

// ヘッダーは1行目に置く（ピボット・QUERY・Looker Studio がそのまま読めるようにするため）。
// 最終更新時刻は凡例シートの先頭に出す。
function writeAgencyShareDetail(ss, cols, rows) {
  var sheet = agencyShareGetOrCreateSheet(ss, AGENCY_SHARE_DETAIL_SHEET);
  sheet.clear();

  sheet.getRange(1, 1, 1, cols.length).setValues([cols])
    .setFontWeight("bold").setBackground("#f0f0f0");
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, cols.length).setValues(rows);
  }
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(cols.indexOf("マーケチャネル") + 1, 380);
  sheet.setColumnWidth(cols.indexOf("ステージ") + 1, 140);
}

/**
 * 月 × チャネル（source/medium/campaign）で、送信数・LINE登録数・ステージ別件数を集計する。
 * ステージ名は 01_ / 02_ … の連番始まりなので、名前順に並べればファネル順になる。
 */
function writeAgencyShareSummary(ss, cols, rows) {
  var iMonth = cols.indexOf("送信月");
  var iSrc = cols.indexOf("utm_source");
  var iMed = cols.indexOf("utm_medium");
  var iCamp = cols.indexOf("utm_campaign");
  var iStage = cols.indexOf("ステージ");
  var iLine = cols.indexOf("LINE登録");

  var groups = {};
  var stageNames = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var stage = String(r[iStage] || AGENCY_SHARE_STAGE_UNKNOWN);
    stageNames[stage] = true;
    var key = [r[iMonth], r[iSrc] || "(なし)", r[iMed] || "(なし)", r[iCamp] || "(なし)"].join("\t");
    if (!groups[key]) groups[key] = { total: 0, line: 0, stages: {} };
    groups[key].total++;
    if (r[iLine] === "済") groups[key].line++;
    groups[key].stages[stage] = (groups[key].stages[stage] || 0) + 1;
  }

  var stageCols = Object.keys(stageNames).sort();
  var header = ["送信月", "utm_source", "utm_medium", "utm_campaign", "送信数", "LINE登録数"]
    .concat(stageCols);

  var out = Object.keys(groups).sort().reverse().map(function (key) {
    var parts = key.split("\t");
    var g = groups[key];
    return parts.concat([g.total, g.line], stageCols.map(function (s) {
      return g.stages[s] || 0;
    }));
  });

  var sheet = agencyShareGetOrCreateSheet(ss, AGENCY_SHARE_SUMMARY_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight("bold").setBackground("#f0f0f0");
  if (out.length) sheet.getRange(2, 1, out.length, header.length).setValues(out);
  sheet.setFrozenRows(1);
}

function setupAgencyShareLegend(ss) {
  var legend = [
    ["最終更新", toJst(new Date()), "1時間ごとに自動更新"],
    ["", "", ""],
    ["カラム名", "意味", "備考"],
    ["lead_id", "候補者の匿名ID", "本人には戻せない不可逆ハッシュ。同じ人は常に同じIDになるので重複・再訪の判定に使える"],
    ["送信日", "LPフォーム送信日", "日本時間"],
    ["送信月", "送信日の年月", "集計用 (YYYY-MM)"],
    ["LP", "送信元LP", "denkikouji / sekoukanri / sekoukanri-doboku など"],
    ["マーケチャネル", "流入元の要約", "例: google/cpc｜014_denki_top_of_page｜KW: 電気工事士 求人 / ig/paid｜(campaign)｜CR: (クリエイティブ)"],
    ["utm_source", "流入元", "例: google / ig"],
    ["utm_medium", "媒体種別", "例: cpc / paid"],
    ["utm_campaign", "キャンペーン", "広告側のキャンペーン名またはID"],
    ["utm_content", "コンテンツ", "検索広告はマッチタイプ、SNSはクリエイティブ"],
    ["utm_term", "キーワード", "検索広告のKW"],
    ["utm_id", "キャンペーンID", ""],
    ["ステージ", "CRM上の現在のステージ", "01_新規リード → 02_未通電 → 04_HOT → 09_履歴書作成 … と進む。" +
      AGENCY_SHARE_STAGE_UNLINKED + "＝CRM未登録（送信直後・連携エラー等）、" +
      AGENCY_SHARE_STAGE_UNKNOWN + "＝CRM側で該当レコードが見つからない"],
    ["ステージ更新日", "CRMレコードの最終更新日", "ステージ以外の項目更新でも動くため、あくまで目安"],
    ["LINE登録", "LINE登録の有無", "済 / 未"],
    ["", "", ""],
    ["※ 個人情報（氏名・電話番号・メール・生年月日・住所）は共有していません。", "", ""],
    ["※ このシートは1時間ごとに自動更新されます（手動編集しても次回更新で消えます）。", "", ""]
  ];
  var sheet = agencyShareGetOrCreateSheet(ss, AGENCY_SHARE_LEGEND_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, legend.length, 3).setValues(legend);
  sheet.getRange(1, 1, 1, 1).setFontWeight("bold");
  sheet.getRange(3, 1, 1, 3).setFontWeight("bold").setBackground("#f0f0f0");
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 560);
  sheet.setFrozenRows(3);
}

/**
 * 【診断用】「実行できたのにシートが更新されない」ときに、どこで止まっているかを1回で出す。
 * エディタで実行し、実行ログを読む。値そのもの（ソルト等）は出さない。
 */
function diagnoseAgencyShare() {
  var lines = [];
  var id = agencyShareProp("AGENCY_SHARE_SHEET_ID");
  lines.push("AGENCY_SHARE_SHEET_ID: " + (id ? id : "(未設定) ← これが原因です"));
  lines.push("AGENCY_SHARE_SALT: " + (agencyShareProp("AGENCY_SHARE_SALT") ? "設定済み" : "(未設定。初回実行時に自動生成)"));

  if (id) {
    try {
      var ss = SpreadsheetApp.openById(id);
      lines.push("共有シート: 開けました『" + ss.getName() + "』");
      lines.push("  タブ: " + ss.getSheets().map(function (s) { return s.getName(); }).join(" / "));
      lines.push("  URL: https://docs.google.com/spreadsheets/d/" + id + "/edit");
    } catch (err) {
      lines.push("共有シート: 開けません ← IDが違うか権限がありません（" + err + "）");
    }
  }

  try {
    var src = getSheet();
    lines.push("元データ: " + SHEET_NAME + " / " + Math.max(0, src.getLastRow() - 1) + "行");
  } catch (err2) {
    lines.push("元データ: 開けません（" + err2 + "）");
  }

  lines.push("Zoho連携: " + (typeof zohoEnabled === "function" && zohoEnabled() ? "有効" : "無効（ステージが取れません）"));

  var out = lines.join("\n");
  Logger.log(out);
  return out;
}

/**
 * 【セットアップ】共有用スプレッドシートを用意して初回同期まで行う。
 * 既に AGENCY_SHARE_SHEET_ID があればそれを使い、無ければ新規作成してIDを保存する。
 * 実行後、返ってきたURLを開いて代理店に「閲覧者」で共有する（編集権限は渡さない）。
 */
function setupAgencyShare() {
  var props = PropertiesService.getScriptProperties();
  var id = agencyShareProp("AGENCY_SHARE_SHEET_ID");
  if (!id) {
    var created = SpreadsheetApp.create("LP候補者ステージ（代理店共有 / 個人情報なし）");
    id = created.getId();
    props.setProperty("AGENCY_SHARE_SHEET_ID", id);
    // 新規作成時の空シート「シート1」は不要
    var first = created.getSheets()[0];
    if (first && created.getSheets().length === 1) first.setName(AGENCY_SHARE_DETAIL_SHEET);
  }
  agencyShareSalt(); // 未設定なら生成しておく
  var result = syncAgencyShare();
  return "共有シート: https://docs.google.com/spreadsheets/d/" + id + "/edit\n" + result +
         "\n※ このURLを代理店に『閲覧者』で共有してください（編集権限は渡さない）。" +
         "\n※ 自動更新は Apps Script の［トリガー］画面で syncAgencyShare を" +
         "「時間主導型／1時間おき」に登録してください。" +
         "（トリガーをコードから作るには script.scriptapp スコープの追加＝再認可が必要で、" +
         "稼働中のフォーム受信エンドポイントを止めうるため、あえて手動登録にしています）";
}
