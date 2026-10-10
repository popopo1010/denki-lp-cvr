/**
 * 除外IPリストと .htaccess の貼り替え用テキスト（2026-10-10）。
 *
 * 運用:
 *   1. スプレッドシートの「除外IP」タブの A列に、いまサーバーにある .htaccess をそのまま貼る
 *      （A2 から下。1行1セル。Sheets に複数行テキストを貼れば自動で行に分かれる）。
 *   2. GASエディタで refreshExcludeIps() を実行する。
 *      - Zoho で「28_無効リード」になっている送信の IP のうち、A列に無いものを C列に書き出す
 *      - E列に「A列＋不足分」を差し込んだ .htaccess 全文を書き出す（E列を丸ごとコピーして貼り替える）
 *   3. 次回は新しい .htaccess を A列に貼り直して 2 を実行するだけ（毎回 A列が正本）。
 *
 * テスト送信（_test 付き）の IP は追加しない。社内・オーナーの端末の IP を .htaccess に入れると
 * 自分たちが LP を開けなくなる（STGでの実機確認もできなくなる）。
 *
 * このタブの IP（A列＋C列）は isExcludedIp() も読む＝フォーム送信のテスト扱い・広告CV除外にも効く。
 */

var EXCLUDE_IP_SHEET = "除外IP";
var EXCLUDE_IP_INVALID_STAGE = "28_無効リード";
var EXCLUDE_IP_CACHE_KEY = "exclude_ips_v1";
var EXCLUDE_IP_SECTION = "# ===== 無効リード（Zoho 28_無効リード・LPフォーム由来。refreshExcludeIps で追加） =====";

function excludeIpSheet(create) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(EXCLUDE_IP_SHEET);
  if (!sh && create) {
    sh = ss.insertSheet(EXCLUDE_IP_SHEET);
    sh.getRange(1, 1, 1, 5).setValues([[
      "貼り付け欄: いまの .htaccess をA2から下にそのまま貼る",
      "",
      "追加分（28_無効リードでA列に無いIP）",
      "",
      "貼り替え用 .htaccess（この列を丸ごとコピー）"
    ]]).setFontWeight("bold");
    sh.setColumnWidth(1, 360);
    sh.setColumnWidth(3, 360);
    sh.setColumnWidth(5, 360);
  }
  return sh;
}

/** テキストから IPv4/IPv6・IPv4 CIDR を拾う。コメント行（#）は読まない。 */
function excludeIpExtract(lines) {
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var parts = String(lines[i] == null ? "" : lines[i]).split(/\r?\n/);
    for (var j = 0; j < parts.length; j++) {
      var line = parts[j].trim();
      if (!line || line.charAt(0) === "#") continue;
      var m = /^Require\s+not\s+ip\s+(.+)$/i.exec(line);
      var body = m ? m[1] : line;
      var toks = body.split(/[\s,]+/);
      for (var k = 0; k < toks.length; k++) {
        var t = toks[k].trim();
        if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(t) || /^[0-9a-f:]+:[0-9a-f:]*$/i.test(t)) out.push(t);
      }
    }
  }
  return out;
}

function excludeIpColumn(sh, col) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, col, last - 1, 1).getValues().map(function (r) { return r[0]; });
}

/**
 * isExcludedIp が読む「除外IP」タブの IP 一覧（A列＋C列）。10分キャッシュ。
 * タブが無ければ空配列（EXCLUDE_IPS プロパティだけで動く）。
 */
function getExcludeIpSheetList() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(EXCLUDE_IP_CACHE_KEY);
  if (hit !== null) return hit ? hit.split(",") : [];
  var list = [];
  try {
    var sh = excludeIpSheet(false);
    if (sh) {
      list = excludeIpExtract(excludeIpColumn(sh, 1)).concat(
        excludeIpExtract(excludeIpColumn(sh, 3).map(function (v) { return String(v).split(/\s/)[0]; })));
    }
  } catch (e) {
    Logger.log("exclude ip sheet read failed: " + e);
  }
  var joined = list.join(",");
  try { if (joined.length < 90000) cache.put(EXCLUDE_IP_CACHE_KEY, joined, 600); } catch (e2) { /* noop */ }
  return list;
}

/** Zoho の 28_無効リード の {ids, phones}。COQL は1回2000件・offset でページング。 */
function fetchInvalidLeadKeys() {
  var ids = {}, phones = {};
  for (var offset = 0; offset < 20000; offset += 2000) {
    var res = zohoFetch("/coql", {
      method: "post",
      payload: {
        select_query: "select id, m_phone_number from Deals where Stage = '" + EXCLUDE_IP_INVALID_STAGE +
          "' limit " + offset + ", 2000"
      }
    });
    if (res.code === 204) break;
    if (res.code !== 200) throw new Error("COQL " + zohoErrorText(res));
    var data = (res.body && res.body.data) || [];
    for (var i = 0; i < data.length; i++) {
      ids[String(data[i].id)] = true;
      var tel = zohoNormalizeTel(data[i].m_phone_number);
      if (tel.length >= 10) phones[tel] = true;
    }
    if (!(res.body.info && res.body.info.more_records)) break;
  }
  return { ids: ids, phones: phones };
}

/**
 * 28_無効リードの IP で .htaccess に足りないものを洗い出し、貼り替え用全文を作る。
 * GASエディタから手で実行する（時間主導トリガーにしてもよい）。
 */
function refreshExcludeIps() {
  if (typeof zohoEnabled !== "function" || !zohoEnabled()) {
    return "NG: Zoho連携が未設定（ZOHO_*）のため 28_無効リード を取得できません";
  }
  var sh = excludeIpSheet(true);
  var pasted = excludeIpColumn(sh, 1).map(function (v) { return String(v); });
  var have = {};
  excludeIpExtract(pasted).forEach(function (ip) { have[ip] = true; });

  var inv = fetchInvalidLeadKeys();

  var src = getSheet();
  var header = ensureHeader(src);
  var lastRow = src.getLastRow();
  var values = lastRow < 2 ? [] : src.getRange(2, 1, lastRow - 1, header.length).getValues();
  var col = function (name) { return header.indexOf(name); };
  var cIp = col("_ip"), cTel = col("your-tel"), cDeal = col("zoho_deal_id"),
      cTest = col("_test"), cAt = col("_received_at"), cLp = col("_lp");

  var added = {}, order = [], skippedTest = {};
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var ip = String(r[cIp] || "").trim();
    if (!ip) continue;
    var deal = String(r[cDeal] || "").trim();
    var tel = zohoNormalizeTel(r[cTel]);
    if (!inv.ids[deal] && !(tel.length >= 10 && inv.phones[tel])) continue;
    if (String(r[cTest] || "").trim()) { skippedTest[ip] = true; continue; }
    if (have[ip] || isIpCoveredByList(ip, Object.keys(have)) || added[ip]) continue;
    added[ip] = { at: String(r[cAt] || "").slice(0, 10), lp: String(r[cLp] || "") };
    order.push(ip);
  }

  // C列: 追加分（IP 送信日 LP）
  var lastC = Math.max(sh.getLastRow(), 2);
  sh.getRange(2, 3, lastC, 1).clearContent();
  if (order.length) {
    sh.getRange(2, 3, order.length, 1).setValues(order.map(function (ip) {
      return [ip + "  " + added[ip].at + " " + added[ip].lp];
    }));
  }

  // E列: 貼り替え用 .htaccess
  var outLines = buildHtaccessWithAdditions(pasted, order);
  sh.getRange(2, 5, Math.max(sh.getLastRow(), outLines.length + 1), 1).clearContent();
  if (outLines.length) {
    // 先頭が = や + の行を数式と解釈させない
    sh.getRange(2, 5, outLines.length, 1).setNumberFormat("@")
      .setValues(outLines.map(function (l) { return [l]; }));
  }

  CacheService.getScriptCache().remove(EXCLUDE_IP_CACHE_KEY);
  var msg = "OK: 追加 " + order.length + " 件 / 貼り付け済み " + Object.keys(have).length +
    " 件 / テスト送信のため除外 " + Object.keys(skippedTest).length + " 件" +
    (pasted.join("").trim() ? "" : "（A列が空のため、E列は追加分のブロックだけ）");
  Logger.log(msg);
  return msg;
}

function isIpCoveredByList(ip, list) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].indexOf("/") !== -1 && typeof ipv4InCidr === "function" && ipv4InCidr(ip, list[i])) return true;
  }
  return false;
}

/**
 * 貼られた .htaccess の「# End of blocked IP addresses」の直前（無ければ </RequireAll> の直前、
 * それも無ければ末尾）に追加ブロックを差し込み、「# Total: N」の件数も数え直す。
 */
function buildHtaccessWithAdditions(pastedCells, additions) {
  var lines = [];
  pastedCells.forEach(function (c) { String(c).split(/\r?\n/).forEach(function (l) { lines.push(l); }); });
  while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
  var block = additions.length
    ? ["", EXCLUDE_IP_SECTION + " " + toJst(new Date()).slice(0, 10)]
        .concat(additions.map(function (ip) { return "Require not ip " + ip; }))
    : [];
  if (!lines.length) return block.slice(1);

  var at = -1;
  for (var i = 0; i < lines.length; i++) {
    if (/^#\s*End of blocked IP addresses/i.test(lines[i].trim())) { at = i; break; }
  }
  if (at === -1) {
    for (var j = 0; j < lines.length; j++) {
      if (/^<\/RequireAll>/i.test(lines[j].trim())) { at = j; break; }
    }
  }
  if (at === -1) at = lines.length;
  if (block.length) block.push("");
  var out = lines.slice(0, at).concat(block, lines.slice(at));

  var total = out.filter(function (l) { return /^\s*Require\s+not\s+ip\s+/i.test(l); }).length;
  return out.map(function (l) {
    return /^#\s*Total:\s*\d+\s*IP addresses blocked/i.test(l.trim()) ? "# Total: " + total + " IP addresses blocked" : l;
  });
}
