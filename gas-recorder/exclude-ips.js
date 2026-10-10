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
 * 追加しないIP（誤ブロック防止）:
 *   - テスト送信（_test 付き）を一度でも出したIP。社内・オーナーの端末の IP を .htaccess に入れると
 *     自分たちが LP を開けなくなる（STGでの実機確認もできなくなる）。無効リードとテストの両方が
 *     出ているIP（8/30 の _test 導入前の社内テスト等）もここで外れる。
 *   - 無効ではない商談（28_無効リード 以外）も出しているIP。携帯回線のIPは共有されるので、
 *     本物の応募者を巻き込まないため。
 *
 * 自動実行: doPost の最後で maybeRefreshExcludeIpsDaily() が1日1回だけ走る（その日最初の送信のついで）。
 * 手で今すぐ回すときは GAS エディタで refreshExcludeIps()。
 *
 * このタブの IP（A列＋C列）は isExcludedIp() も読む＝フォーム送信のテスト扱い・広告CV除外にも効く。
 */

var EXCLUDE_IP_SHEET = "除外IP";
var EXCLUDE_IP_INVALID_STAGE = "28_無効リード";
var EXCLUDE_IP_CACHE_KEY = "exclude_ips_v1";
// LPフォーム（form_submissions）の記録開始より前の商談は照合に使わない（2024年の取込分などで
// 照会が何ページにも膨らむだけ）。シートの最古行は 2026-05-20。
var EXCLUDE_IP_ZOHO_SINCE = "2026-04-01T00:00:00+09:00";
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
          "' and Created_Time >= '" + EXCLUDE_IP_ZOHO_SINCE + "' limit " + offset + ", 2000"
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

  // 1周目: IPごとに「テストを出したか」「無効でないリードを出したか」を集める
  var testIps = {}, okIps = {}, candidates = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var ip = String(r[cIp] || "").trim();
    if (!ip) continue;
    if (String(r[cTest] || "").trim()) { testIps[ip] = true; continue; }
    var deal = String(r[cDeal] || "").trim();
    var hasDeal = /^\d{15,}$/.test(deal);
    var tel = zohoNormalizeTel(r[cTel]);
    // 商談IDがある行はそのIDのステージだけで判断する。電話番号で照らすのは商談IDが無い・壊れた行
    // （"3.755E+15" 等）だけ——過去の無効商談と同じ番号の人が、今回は本物として登録していることがあるため。
    if (hasDeal ? inv.ids[deal] : (tel.length >= 10 && inv.phones[tel])) candidates.push(r);
    // 無効でない商談が実在する行だけを「本物のリード」と数える。商談IDの無い行（Zoho連携前・
    // 手で消したテスト等）は判断材料にしない＝無効扱いにも本物扱いにもしない。
    else if (hasDeal) okIps[ip] = true;
  }
  // 2周目: 無効リードだけを出しているIPを追加候補にする
  var added = {}, order = [], skippedTest = {}, skippedShared = {};
  var haveList = Object.keys(have);
  for (var k = 0; k < candidates.length; k++) {
    var c = candidates[k];
    var cip = String(c[cIp]).trim();
    if (testIps[cip]) { skippedTest[cip] = true; continue; }
    if (okIps[cip]) { skippedShared[cip] = true; continue; }
    if (have[cip] || added[cip] || isIpCoveredByList(cip, haveList)) continue;
    // シートの日時セルは Date で返る。String(Date) は "Wed May 20 …" になるので toJst で整形する
    added[cip] = { at: String(toJst(c[cAt]) || "").slice(0, 10), lp: String(c[cLp] || "") };
    order.push(cip);
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
    " 件 / 社内テストのIPのため除外 " + Object.keys(skippedTest).length +
    " 件 / 無効でないリードとIPが共通のため除外 " + Object.keys(skippedShared).length + " 件" +
    (pasted.join("").trim() ? "" : "（A列が空のため、E列は追加分のブロックだけ）");
  Logger.log(msg);
  return msg;
}

/**
 * doPost から呼ぶ1日1回の自動更新。日付をスクリプトプロパティに残し、同じ日は2回目以降なにもしない。
 * 同時に2つの送信が来ても二重に走らないよう、先に日付を書いてから実行する（失敗してもその日は再試行しない
 * ＝送信のたびに重い処理を繰り返さない。翌日また走る）。
 */
function maybeRefreshExcludeIpsDaily() {
  if (typeof zohoEnabled !== "function" || !zohoEnabled()) return "skip: zoho disabled";
  var today = toJst(new Date()).slice(0, 10);
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("EXCLUDE_IPS_REFRESHED_ON") === today) return "skip: already ran " + today;
  props.setProperty("EXCLUDE_IPS_REFRESHED_ON", today);
  var msg = refreshExcludeIps();
  props.setProperty("EXCLUDE_IPS_LAST_RESULT", today + " " + String(msg).slice(0, 400));
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

  // 同じIPの重複行は最初の1行だけ残す（貼り付け元の .htaccess に重複がある。2026-10-10 時点で10件）
  var seen = {};
  out = out.filter(function (l) {
    var m = /^\s*Require\s+not\s+ip\s+(\S+)\s*$/i.exec(l);
    if (!m) return true;
    if (seen[m[1]]) return false;
    seen[m[1]] = true;
    return true;
  });
  var total = Object.keys(seen).length;
  return out.map(function (l) {
    return /^#\s*Total:\s*\d+\s*IP addresses blocked/i.test(l.trim()) ? "# Total: " + total + " IP addresses blocked" : l;
  });
}
