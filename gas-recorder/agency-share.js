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
  "逆オファーOK到達",
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

/**
 * 共有するチャネルの絞り込み。スクリプトプロパティ AGENCY_SHARE_UTM_SOURCE に
 * カンマ区切りで utm_source を書くと、その流入元の行だけを共有する。
 * 空・未設定なら全チャネル（Google / Meta / 自然流入すべて）。
 *   例) "google"      … Google広告だけ。fb / ig（Meta）や自然流入は出さない
 *       "google,fb"   … GoogleとMeta
 *       （未設定）      … 全部
 * ※Google広告は自動タグ設定で utm_source が付かず gclid だけ付くことがあるため、
 *   "google" を指定したときは gclid/gbraid/wbraid を持つ行も対象に含める。
 */
function agencyShareSourceFilter() {
  var raw = agencyShareProp("AGENCY_SHARE_UTM_SOURCE");
  if (!raw) return null;
  var list = raw.split(",").map(function (s) { return String(s).trim().toLowerCase(); })
    .filter(function (s) { return !!s; });
  return list.length ? list : null;
}

// utm_source の個別列が空でも _page のURLから拾う（gclid列は2026-07に追加のため）
function agencyShareHasGoogleClickId(params) {
  var keys = ["gclid", "gbraid", "wbraid"];
  for (var i = 0; i < keys.length; i++) {
    if (String(params[keys[i]] == null ? "" : params[keys[i]]).trim()) return true;
  }
  return /[?&](gclid|gbraid|wbraid)=[^&\s]/.test(String(params["_page"] || ""));
}

function agencyShareMatchesFilter(filter, track, params) {
  if (!filter) return true;
  var src = String(track.utm_source || "").trim().toLowerCase();
  if (src) return filter.indexOf(src) !== -1;
  return filter.indexOf("google") !== -1 && agencyShareHasGoogleClickId(params);
}

var AGENCY_SHARE_CAMPAIGN_FUNNEL_SHEET = "キャンペーン別到達率";
var AGENCY_SHARE_KEYWORD_FUNNEL_SHEET = "KW別到達率";
var AGENCY_SHARE_MONTHLY_SHEET = "月別推移";
// 広告費の手入力タブ。sync は**読むだけで消さない**（唯一、上書きしないタブ）。
var AGENCY_SHARE_COST_SHEET = "広告コスト入力";

// 見たいのは「逆オファーOKまで到達したか」だけ。他のステージは出さない。
// 別の段階も見たくなったら rank を足す（04_HOT なら 4、21_内定なら 21）。
var AGENCY_SHARE_TARGET_LABEL = "逆オファーOK到達";
var AGENCY_SHARE_TARGET_RANK = 8; // 08_逆オファーOK
var AGENCY_SHARE_TARGET_MARK = "✓";

/**
 * ステージ名の先頭連番を進捗ランクにする（"01_新規リード" → 1）。
 * ただし 27_ナーチャリング / 28_無効リード は**番号が大きいだけで前進ではない**ため 0 を返す。
 * ここを素直に数値比較すると、無効リードが「内定到達」に化けて率が壊れる。
 */
var AGENCY_SHARE_NON_PROGRESS_MIN_RANK = 26;
function agencyShareStageRank(stage) {
  var m = /^(\d{1,2})[_ ]/.exec(String(stage == null ? "" : stage).trim());
  if (!m) return 0;
  var n = Number(m[1]);
  return n >= AGENCY_SHARE_NON_PROGRESS_MIN_RANK ? 0 : n;
}

/**
 * 送信日を "yyyy-MM-dd" にする。
 * スプレッドシートは _received_at を**日付型セル**として持つことがあり、getValues() では
 * Date オブジェクトで返る。String() すると "Wed May 27 2026 10:15:00 GMT+0900" になり、
 * 先頭10文字を切ると "Wed May 27" という壊れた日付になる（本番で実際に発生）。
 */
function agencyShareDay(value) {
  if (value instanceof Date) return toJst(value).slice(0, 10);
  var s = String(value == null ? "" : value).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var jst = toJst(s);                      // 解釈できなければ元の文字列が返る
  return /^\d{4}-\d{2}-\d{2}/.test(jst) ? jst.slice(0, 10) : "";
}

function agencyShareSetWidth(sheet, cols, columnName, px) {
  var idx = cols.indexOf(columnName);
  if (idx >= 0) sheet.setColumnWidth(idx + 1, px);
}

function agencySharePct(n, total) {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

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

  var ours = [AGENCY_SHARE_DETAIL_SHEET, AGENCY_SHARE_SUMMARY_SHEET, AGENCY_SHARE_LEGEND_SHEET,
              AGENCY_SHARE_CAMPAIGN_FUNNEL_SHEET, AGENCY_SHARE_KEYWORD_FUNNEL_SHEET,
              AGENCY_SHARE_MONTHLY_SHEET, AGENCY_SHARE_COST_SHEET];
  var strays = ss.getSheets().filter(function (sh) { return ours.indexOf(sh.getName()) === -1; });
  // ヘッダーだけ / 空の「シート1」「Untitled」等が1枚だけ残っているなら、それを流用する
  if (strays.length === 1 && strays[0].getLastRow() <= 1) {
    return strays[0].setName(name);
  }
  return ss.insertSheet(name);
}

/**
 * 代理店共有シートを最新化する（毎回まるごと作り直す）。
 * トリガーからも、エディタからの手動実行からも呼べる。
 *
 * 途中で例外が出ても「止まっていること」をシート上に残す。無言で古いまま放置されると、
 * 代理店が古い数字を見続ける（2026-08-15〜09-01 に更新が止まっていたのに誰も気づけなかった）。
 */
function syncAgencyShare() {
  try {
    return syncAgencyShareRun();
  } catch (err) {
    var msg = "NG: 更新を中止しました（" + err + "）";
    try {
      var ss = openAgencyShareSpreadsheet();
      if (ss) setupAgencyShareLegend(ss, agencyShareSourceFilter(), ["更新全体を中止: " + err]);
    } catch (e2) { /* 凡例すら書けないなら諦める。ログとSlackには残る */ }
    if (typeof reportErrorToSlack === "function") reportErrorToSlack("syncAgencyShare", String(err));
    Logger.log(msg);
    return msg;
  }
}

function syncAgencyShareRun() {
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
  var filter = agencyShareSourceFilter();
  var records = [];
  var excludedTest = 0;
  var excludedNoTel = 0;
  var excludedChannel = 0;

  for (var i = 0; i < values.length; i++) {
    var params = {};
    for (var c = 0; c < header.length; c++) params[header[c]] = values[i][c];

    // 2026-08-30〜: テスト送信はシートに残す運用になり、`_test` 列に理由(stg/param/pattern)が入る。
    // STGや ?dk_test=1 からの「本物っぽい氏名・番号」のテストは下の推測ロジックでは捕まらないため、
    // この列を最優先で見る。捕まえ損ねると候補者数が水増しされ、到達率と単価が実態より悪く出る。
    if (String(params["_test"] || "").trim()) {
      excludedTest++;
      continue;
    }

    var dealId = String(params["zoho_deal_id"] || "").trim();

    // 商談IDがある行は実在の候補者。推測によるテスト判定で落とさない。
    // （Zoho連携側が商談を作る前にテスト判定を通しているため、通過している時点で本物）
    // 未連携の行だけ、テスト送信・電話番号なし（thanksページのメール登録行など）を落とす。
    if (!dealId) {
      if (!String(params["your-tel"] || "").trim()) {
        excludedNoTel++;
        continue;
      }
      if (typeof zohoIsTestSubmission === "function" && zohoIsTestSubmission(params)) {
        excludedTest++;
        continue;
      }
    }

    var track = zohoTrackingParams(params); // 個別列が空でも _page のURLから復元する

    // チャネル絞り込み（Zohoへの問い合わせ前に落とす）
    if (!agencyShareMatchesFilter(filter, track, params)) {
      excludedChannel++;
      continue;
    }

    var day = agencyShareDay(params["_received_at"]);

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
        "逆オファーOK到達": "",
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

  // 同じ候補者の再送信は1人にまとめる（同一電話番号は同じ商談に紐づくため lead_id が同じ）。
  // まとめないと到達率の分母が水増しされる。獲得したチャネルを残したいので初回送信を採用する。
  var byLead = {};
  var unique = [];
  var duplicates = 0;
  for (var d = 0; d < records.length; d++) {
    var rec = records[d];
    var leadId = rec.values.lead_id;
    if (!leadId) { unique.push(rec); continue; }
    var prev = byLead[leadId];
    if (!prev) {
      byLead[leadId] = rec;
      unique.push(rec);
      continue;
    }
    duplicates++;
    if (String(rec.values["送信日"]) < String(prev.values["送信日"])) {
      unique[unique.indexOf(prev)] = rec;   // より古い送信（初回接触）に差し替える
      byLead[leadId] = rec;
    }
  }
  records = unique;

  var dealIds = [];
  for (var q = 0; q < records.length; q++) {
    if (records[q].dealId) dealIds.push(records[q].dealId);
  }

  var stages = fetchZohoStages(dealIds);
  var rows = [];
  for (var k = 0; k < records.length; k++) {
    var rec = records[k];
    // 到達＝現在のステージ番号が 08_逆オファーOK 以上。
    // 未連携・CRMに無い・27/28（ナーチャリング/無効リード）はチェックなし。
    var found = rec.dealId ? stages.map[rec.dealId] : null;
    var rank = found ? agencyShareStageRank(found.stage) : 0;
    rec.values[AGENCY_SHARE_TARGET_LABEL] = rank >= AGENCY_SHARE_TARGET_RANK
      ? AGENCY_SHARE_TARGET_MARK : "";

    var row = cols.map(function (name) { return rec.values[name] == null ? "" : rec.values[name]; });
    assertNoPii(row, rec.params); // ここで落ちたら1行も書かずに終わる
    rows.push(row);
  }

  // 新しい送信が上に来た方が代理店は見やすい
  rows.sort(function (a, b) {
    return String(b[cols.indexOf("送信日")]).localeCompare(String(a[cols.indexOf("送信日")]));
  });

  // タブ単位で失敗を切り分ける。1つの例外で全体が止まると、書けたタブだけ新しく、
  // 残りは古いまま無言で残る（2026-07-28 に発生。列名変更で setColumnWidth が例外）。
  // どこが古いままかを凡例タブと戻り値に必ず出す。
  var writeErrors = [];
  function safeWrite(label, fn) {
    try {
      fn();
    } catch (err) {
      writeErrors.push(label + "（" + err + "）");
    }
  }

  safeWrite(AGENCY_SHARE_DETAIL_SHEET, function () { writeAgencyShareDetail(ss, cols, rows); });

  var costs = { byMonth: {}, byCampaign: {}, total: 0 };
  safeWrite(AGENCY_SHARE_COST_SHEET, function () { costs = readAgencyShareCosts(ss); });

  safeWrite(AGENCY_SHARE_SUMMARY_SHEET, function () { writeAgencyShareSummary(ss, cols, rows); });
  safeWrite(AGENCY_SHARE_MONTHLY_SHEET, function () {
    writeAgencyShareFunnel(ss, cols, rows, AGENCY_SHARE_MONTHLY_SHEET, "送信月", "送信月",
                           { sortByKey: true, costs: { map: costs.byMonth, total: costs.total } });
  });
  safeWrite(AGENCY_SHARE_CAMPAIGN_FUNNEL_SHEET, function () {
    writeAgencyShareFunnel(ss, cols, rows, AGENCY_SHARE_CAMPAIGN_FUNNEL_SHEET,
                           "utm_campaign", "キャンペーン",
                           { costs: { map: costs.byCampaign, total: costs.total } });
  });
  // KWごとの広告費は取得できないため、KWタブに単価は出さない
  safeWrite(AGENCY_SHARE_KEYWORD_FUNNEL_SHEET, function () {
    writeAgencyShareFunnel(ss, cols, rows, AGENCY_SHARE_KEYWORD_FUNNEL_SHEET,
                           "utm_term", "キーワード");
  });
  // 凡例は最後に、失敗があっても必ず書く（どのタブが古いままかを載せる場所）
  setupAgencyShareLegend(ss, filter, writeErrors);

  // 何を落としたかは必ず出す。黙って絞ると「全件出ている」と誤解される。
  var msg = "共有シート更新: " + rows.length + "件" +
            "（テスト送信 " + excludedTest + "件・電話番号なし " + excludedNoTel + "件を除外" +
            (filter ? " / チャネル絞り込み[" + filter.join(",") + "]で " + excludedChannel + "件を除外" : "") +
            " / 同一候補者の重複 " + duplicates + "件を統合" +
            " / ステージ取得 " + Object.keys(stages.map).length + "件）" +
            " 最終更新 " + toJst(new Date());
  if (writeErrors.length) {
    msg += " ※書き込み失敗タブ（内容が古いまま）: " + writeErrors.join(" / ");
    if (typeof reportErrorToSlack === "function") {
      reportErrorToSlack("syncAgencyShare/write", writeErrors.join(" / "));
    }
  }
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
  // 列名が変わっても落ちないようにする。indexOf が -1 のとき setColumnWidth(0,…) は例外になり、
  // 明細だけ書けて他タブが古いまま残る（2026-07-28 に実際に発生）。
  agencyShareSetWidth(sheet, cols, "マーケチャネル", 380);
  agencyShareSetWidth(sheet, cols, AGENCY_SHARE_TARGET_LABEL, 130);
}

/**
 * 月 × チャネル（source/medium/campaign）で、送信数・LINE登録数・逆オファーOK到達数と到達率を出す。
 * ステージ別の内訳は出さない（見たいのは逆オファーOKまで到達したかどうかだけ）。
 */
function writeAgencyShareSummary(ss, cols, rows) {
  var iMonth = cols.indexOf("送信月");
  var iSrc = cols.indexOf("utm_source");
  var iMed = cols.indexOf("utm_medium");
  var iCamp = cols.indexOf("utm_campaign");
  var iTarget = cols.indexOf(AGENCY_SHARE_TARGET_LABEL);
  var iLine = cols.indexOf("LINE登録");

  var groups = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = [r[iMonth], r[iSrc] || "(なし)", r[iMed] || "(なし)", r[iCamp] || "(なし)"].join("\t");
    if (!groups[key]) groups[key] = { total: 0, line: 0, reached: 0 };
    groups[key].total++;
    if (r[iLine] === "済") groups[key].line++;
    if (r[iTarget] === AGENCY_SHARE_TARGET_MARK) groups[key].reached++;
  }

  var header = ["送信月", "utm_source", "utm_medium", "utm_campaign", "候補者数", "LINE登録数",
                AGENCY_SHARE_TARGET_LABEL, AGENCY_SHARE_TARGET_LABEL + "率(%)"];
  var out = Object.keys(groups).sort().reverse().map(function (key) {
    var g = groups[key];
    return key.split("\t").concat([g.total, g.line, g.reached, agencySharePct(g.reached, g.total)]);
  });

  var sheet = agencyShareGetOrCreateSheet(ss, AGENCY_SHARE_SUMMARY_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight("bold").setBackground("#f0f0f0");
  if (out.length) sheet.getRange(2, 1, out.length, header.length).setValues(out);
  sheet.setFrozenRows(1);
}

/**
 * 広告費の手入力タブを読む。**このタブだけは sync が消さない**（人が入力する場所）。
 * 列: 年月(YYYY-MM) / キャンペーン(空欄=その月の全体) / 広告費(円)
 * Google Ads を直接繋ぐようになったら、このタブを自動更新に差し替えるだけで単価計算はそのまま動く。
 */
function readAgencyShareCosts(ss) {
  var out = { byMonth: {}, byCampaign: {}, total: 0, rows: 0 };
  var sheet = ss.getSheetByName(AGENCY_SHARE_COST_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AGENCY_SHARE_COST_SHEET);
    sheet.getRange(1, 1, 1, 3)
      .setValues([["年月 (YYYY-MM)", "キャンペーン (空欄=その月の全キャンペーン)", "広告費(円)"]])
      .setFontWeight("bold").setBackground("#fff3cd");
    sheet.getRange(2, 1, 1, 3).setValues([["2026-07", "014_denki_top_of_page", ""]]);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 320);
    sheet.setColumnWidth(3, 120);
    sheet.setFrozenRows(1);
    return out;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < values.length; i++) {
    var ym = values[i][0];
    ym = (ym instanceof Date) ? toJst(ym).slice(0, 7) : String(ym == null ? "" : ym).trim().slice(0, 7);
    var camp = String(values[i][1] == null ? "" : values[i][1]).trim();
    var cost = Number(String(values[i][2] == null ? "" : values[i][2]).replace(/[^0-9.\-]/g, ""));
    if (!cost || isNaN(cost)) continue;
    out.rows++;
    out.total += cost;
    if (ym) out.byMonth[ym] = (out.byMonth[ym] || 0) + cost;
    if (camp) out.byCampaign[camp] = (out.byCampaign[camp] || 0) + cost;
  }
  return out;
}

function agencyShareUnitCost(cost, count) {
  if (!cost || !count) return "";
  return Math.round(cost / count);
}

/**
 * キャンペーン別 / KW別の到達率タブ。分母は送信数、分子は逆オファーOK到達数。
 *
 * 到達の判定は「**現在の**ステージ番号が 08_逆オファーOK 以上か」。ステージ履歴はZohoから
 * 取っていないので、一度到達してから 27_ナーチャリング / 28_無効リード に戻った候補者は
 * 数えない＝**実態よりやや低めに出る**。この前提は凡例タブにも書く。
 */
function writeAgencyShareFunnel(ss, cols, rows, sheetName, keyColumn, keyLabel, opts) {
  opts = opts || {};
  var iKey = cols.indexOf(keyColumn);
  var iTarget = cols.indexOf(AGENCY_SHARE_TARGET_LABEL);
  var iLine = cols.indexOf("LINE登録");

  var groups = {};
  var order = [];
  function bucket(key) {
    if (!groups[key]) {
      groups[key] = { total: 0, line: 0, reached: 0 };
      order.push(key);
    }
    return groups[key];
  }

  var all = bucket("【全体】");
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][iKey] == null ? "" : rows[i][iKey]).trim() || "(なし)";
    var targets = [all, bucket(key)];
    for (var t = 0; t < targets.length; t++) {
      targets[t].total++;
      if (rows[i][iLine] === "済") targets[t].line++;
      if (rows[i][iTarget] === AGENCY_SHARE_TARGET_MARK) targets[t].reached++;
    }
  }

  var costs = opts.costs || null;
  var header = [keyLabel, "候補者数", "LINE登録", "LINE登録率(%)",
                AGENCY_SHARE_TARGET_LABEL, AGENCY_SHARE_TARGET_LABEL + "率(%)"];
  if (costs) header = header.concat(["広告費(円)", "候補者単価(円)", AGENCY_SHARE_TARGET_LABEL + "単価(円)"]);

  // 【全体】を先頭に固定。月別推移はキーの新しい順、それ以外は候補者数の多い順。
  var keys = order.slice(1).sort(function (a, b) {
    return opts.sortByKey ? String(b).localeCompare(String(a)) : groups[b].total - groups[a].total;
  });
  keys.unshift("【全体】");

  var out = keys.map(function (key) {
    var g = groups[key];
    var row = [key, g.total, g.line, agencySharePct(g.line, g.total),
               g.reached, agencySharePct(g.reached, g.total)];
    if (costs) {
      var cost = key === "【全体】" ? costs.total : (costs.map[key] || 0);
      row.push(cost || "", agencyShareUnitCost(cost, g.total), agencyShareUnitCost(cost, g.reached));
    }
    return row;
  });

  var sheet = agencyShareGetOrCreateSheet(ss, sheetName);
  sheet.clear();
  sheet.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight("bold").setBackground("#f0f0f0");
  if (out.length) sheet.getRange(2, 1, out.length, header.length).setValues(out);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 320);
}

function setupAgencyShareLegend(ss, filter, writeErrors) {
  writeErrors = writeErrors || [];
  var legend = [
    ["最終更新", toJst(new Date()), "1時間ごとに自動更新"],
    ["状態", writeErrors.length ? "一部のタブが更新できませんでした" : "正常",
     writeErrors.length ? "内容が古いまま: " + writeErrors.join(" / ") : "全タブを更新済み"],
    ["対象チャネル", filter ? filter.join(" / ") + " のみ" : "全チャネル",
     filter ? "この流入元以外（他媒体・自然流入）は掲載していません" : "Google / Meta / 自然流入すべて"],
    ["", "", ""],
    ["カラム名", "意味", "備考"],
    ["lead_id", "候補者の匿名ID", "本人には戻せない不可逆ハッシュ。同じ人は常に同じIDになるので重複・再訪の判定に使える"],
    ["送信日", "LPフォーム送信日", "日本時間。同じ人が複数回送信している場合は初回送信日"],
    ["送信月", "送信日の年月", "集計用 (YYYY-MM)"],
    ["LP", "送信元LP", "denkikouji / sekoukanri / sekoukanri-doboku など"],
    ["マーケチャネル", "流入元の要約", "例: google/cpc｜014_denki_top_of_page｜KW: 電気工事士 求人 / ig/paid｜(campaign)｜CR: (クリエイティブ)"],
    ["utm_source", "流入元", "例: google / ig"],
    ["utm_medium", "媒体種別", "例: cpc / paid"],
    ["utm_campaign", "キャンペーン", "広告側のキャンペーン名またはID"],
    ["utm_content", "コンテンツ", "検索広告はマッチタイプ、SNSはクリエイティブ"],
    ["utm_term", "キーワード", "検索広告のKW"],
    ["utm_id", "キャンペーンID", ""],
    [AGENCY_SHARE_TARGET_LABEL, "08_逆オファーOK まで到達したか",
     AGENCY_SHARE_TARGET_MARK + "＝到達済み（08_逆オファーOK 以上のステージ）／空欄＝未到達。" +
     "空欄には「まだCRMに登録されていない（送信直後・連携エラー）」も含まれるため、厳密には『未到達 or 判定不能』"],
    ["LINE登録", "LINE登録の有無", "済 / 未"],
    ["", "", ""],
    ["※ 同じ候補者の重複送信は1人にまとめています（初回送信のチャネルで集計）。", "",
     "そのため候補者数は広告管理画面のCV数より少なくなることがあります"],
    ["", "", ""],
    ["【タブの説明】", "", ""],
    ["候補者ステージ", "1候補者1行の明細", "送信日・流入元・逆オファーOK到達の有無"],
    ["チャネル別サマリ", "月 × 流入元の集計", "送信数・LINE登録数・逆オファーOK到達数と到達率"],
    ["月別推移", "月ごとの候補者数・到達数・到達率", "広告コスト入力タブに費用を入れると単価も出ます"],
    ["キャンペーン別到達率", "utm_campaign ごとの逆オファーOK到達率", "候補者数を分母にした到達割合(%)。費用があれば単価も"],
    ["広告コスト入力", "★人が入力するタブ（自動更新で消えません）",
     "年月 / キャンペーン / 広告費(円) を入れると、月別推移・キャンペーン別に「候補者単価」「逆オファーOK単価」が出ます"],
    ["KW別到達率", "utm_term（検索KW）ごとの同上", "検索広告以外は「(なし)」にまとまります"],
    ["", "", ""],
    ["※ 単価は（広告費 ÷ 件数）です。広告コスト入力タブが空なら空欄になります。", "",
     "キャンペーン名は広告側の名称と一致させてください（utm_campaign と突き合わせています）"],
    ["※ 判定は『現在のステージが 08_逆オファーOK 以上か』です。", "",
     "一度到達してから 27_ナーチャリング / 28_無効リード に戻った候補者はチェックが外れるため、実態よりやや低めに出ます"],
    ["※ 27_ナーチャリング / 28_無効リード は番号が大きいですが前進ではないため、到達扱いにしていません。", "", ""],
    ["", "", ""],
    ["※ 個人情報（氏名・電話番号・メール・生年月日・住所）は共有していません。", "", ""],
    ["※ このシートは1時間ごとに自動更新されます（手動編集しても次回更新で消えます）。", "", ""]
  ];
  var sheet = agencyShareGetOrCreateSheet(ss, AGENCY_SHARE_LEGEND_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, legend.length, 3).setValues(legend);
  sheet.getRange(1, 1, 1, 1).setFontWeight("bold");
  sheet.getRange(5, 1, 1, 3).setFontWeight("bold").setBackground("#f0f0f0");
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 560);
  sheet.setFrozenRows(5);
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

  var filter = agencyShareSourceFilter();
  lines.push("対象チャネル: " + (filter ? filter.join(" / ") + " のみ（AGENCY_SHARE_UTM_SOURCE）" : "全チャネル"));
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
