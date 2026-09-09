#!/usr/bin/env node
/**
 * Zoho 商談の「項目の長さ制限」対策が生きているかの番人（GASを模したスタブ上で実行）。
 *
 * 2026-09-07 本番: 施工管理LPで資格を11個すべて選んだ人の商談名が 143 文字になり、
 * Deal_Name(120) を超えて Zoho が 400 INVALID_DATA を返し、**商談だけ作られなかった**。
 * Slack通知もシート記録も正常なので気づきにくく、営業側で1件まるごと欠ける。
 *
 * 同じ壊れ方は「長い値を持ちうる項目」すべてで起こるため、
 * 3段構え（組み立て時／送信直前／弾かれた後の再送）をコードで検査する。
 *
 * 実行: node scripts/check-zoho-field-limits.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.log(`  NG  ${label}${detail ? " … " + detail : ""}`);
  }
}

/* ---------------------------------------------------------------- GAS スタブ */
// zoho.js は GAS 前提なので、純粋関数を呼ぶのに必要な分だけ埋める。
const ctx = vm.createContext({
  console,
  Date,
  Object,
  String,
  Number,
  Math,
  JSON,
  RegExp,
  isNaN,
  Utilities: {
    formatDate: (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) },
  pad2: (v) => String(v).padStart(2, "0")
});
vm.runInContext(fs.readFileSync(path.join(ROOT, "gas-recorder", "zoho.js"), "utf8"), ctx);

// 施工管理LP step01 の選択肢を全部選んだ状態（2026-09-07 に本番で落ちた形）
const ALL_LICENSES = [
  "1級建築施工管理技士", "2級建築施工管理技士", "1級土木施工管理技士", "2級土木施工管理技士",
  "1級電気施工管理技士", "2級電気施工管理技士", "第一種電気工事士", "第二種電気工事士",
  "1級管工事施工管理技士", "2級管工事施工管理技士", "その他の資格"
].join(", ");
const META_OFF = { ok: false, usable: {}, options: {}, lengths: {} };

console.log("1) 商談名は上限を超えない（1段目: 組み立て）");
{
  const build = ctx.zohoBuildDealName;
  const cases = [
    ["短い", "山田太郎", "第一種電気工事士"],
    ["資格11個（本番で落ちた形）", "Rhatlakorn Khomsan", ALL_LICENSES],
    ["資格が異常に多い", "山田太郎", (ALL_LICENSES + ", ").repeat(5)],
    ["氏名だけで上限超え", "あ".repeat(300), ALL_LICENSES],
    ["資格なし", "山田太郎", ""]
  ];
  for (const [label, name, license] of cases) {
    const out = build(name, license, 120);
    check(`${label}: 120文字以内 (${out.length})`, out.length <= 120, out);
  }
  check("上限内なら素通し（既存の命名 `姓名/資格` を変えない）",
        build("山田太郎", "第一種電気工事士", 120) === "山田太郎/第一種電気工事士");
  check("詰めるときは資格の途中で切らず「ほかN件」を付ける",
        /ほか\d+件$/.test(build("Rhatlakorn Khomsan", ALL_LICENSES, 120)),
        build("Rhatlakorn Khomsan", ALL_LICENSES, 120));
  check("メタの上限が小さくなっても従う",
        build("山田太郎", ALL_LICENSES, 40).length <= 40);
}

console.log("2) 送信直前に全テキスト項目を丸める（2段目: 面で守る）");
{
  const meta = { ok: true, usable: {}, options: {}, lengths: { Deal_Name: 120, lp_info: 60, m_phone_number: 20 } };
  const deal = {
    Deal_Name: "あ".repeat(200),
    lp_info: "い".repeat(500),
    m_phone_number: "09012345678",
    No_yubin: 1234567,
    shikaku: ["第一種電気工事士", "第二種電気工事士"]
  };
  const out = ctx.zohoClampDealFields(deal, meta);
  check("Deal_Name を120で丸める", out.Deal_Name.length === 120, String(out.Deal_Name.length));
  check("lp_info もメタの長さで丸める（Deal_Name 専用対策にしない）", out.lp_info.length === 60);
  check("上限内の項目は触らない", out.m_phone_number === "09012345678");
  check("数値項目は壊さない", out.No_yubin === 1234567);
  check("配列（複数選択）は壊さない", Array.isArray(out.shikaku) && out.shikaku.length === 2);

  // ピックリストを丸めると「存在しない選択肢」になり MAPPING_MISMATCH で落ちる
  const pick = ctx.zohoClampDealFields(
    { Stage: "01_新規リード", area: "神奈川県" },
    { ok: true, usable: {}, options: { Stage: ["01_新規リード"], area: ["神奈川県"] }, lengths: { Stage: 3, area: 2 } }
  );
  check("ピックリスト項目は丸めない（選択肢が壊れる）",
        pick.Stage === "01_新規リード" && pick.area === "神奈川県", JSON.stringify(pick));

  const emoji = ctx.zohoClampDealFields({ lp_info: "あ".repeat(9) + "\u{1F600}" },
                                        { ok: true, usable: {}, options: {}, lengths: { lp_info: 10 } });
  check("絵文字の途中で切らない（片割れを残さない）",
        !/[\uD800-\uDBFF]$/.test(emoji.lp_info), JSON.stringify(emoji.lp_info));

  const fb = ctx.zohoClampDealFields({ Deal_Name: "あ".repeat(200) }, META_OFF);
  check("メタが取れないときも既定値120で丸める", fb.Deal_Name.length === 120, String(fb.Deal_Name.length));
}

console.log("3) 弾かれても項目を直して作り直す（3段目: リードを落とさない）");
{
  const repair = ctx.zohoRepairDeal;
  const invalid = (api_name, extra = {}) => ({
    body: { data: [{ code: "INVALID_DATA", details: { api_name, ...extra } }] }
  });

  const d1 = { Deal_Name: "あ".repeat(200), name_EU: "山田太郎" };
  const r1 = repair(d1, invalid("Deal_Name", { maximum_length: 120 }));
  check("長すぎる必須項目は短縮して再送できる", !!r1 && d1.Deal_Name.length <= 120, `${r1} / ${d1.Deal_Name.length}`);

  const d2 = { Deal_Name: "山田太郎/第一種電気工事士", shikaku_sonota: "x".repeat(50) };
  const r2 = repair(d2, invalid("shikaku_sonota"));
  check("必須でない項目は落として商談を残す", !!r2 && d2.shikaku_sonota === undefined, String(r2));
  check("必須項目は落とさない（作成自体が通らなくなる）",
        repair({ Pipeline: "求職者対応" }, invalid("Pipeline")) === "");
  check("身に覚えのない項目名では何もしない",
        repair({ Deal_Name: "x" }, invalid("Unknown_Field")) === "");
  check("INVALID_DATA 以外（権限エラー等）は修復しない",
        repair({ Deal_Name: "x" }, { body: { data: [{ code: "OAUTH_SCOPE_MISMATCH" }] } }) === "");
}

console.log("4) 実際の送信ペイロードで検証（buildZohoDeal 通し）");
{
  const params = {
    "your-last-name": "Rhatlakorn", "your-first-name": "Khomsan",
    "your-tel": "07091453901", "your-license01": ALL_LICENSES,
    "your-pref": "愛知県", "your-experience": "設計・積算経験",
    "your-willingness": "近いうちに転職したい", "your-birthday-year": "1992",
    "_lp": "sekoukanri", "_received_at": "2026-09-07 19:55:52"
  };
  const deal = ctx.buildZohoDeal(params, META_OFF);
  check("本番で落ちた1件が120文字以内になる", deal.Deal_Name.length <= 120,
        `${deal.Deal_Name.length}文字: ${deal.Deal_Name}`);
  check("氏名は先頭に残る（営業が誰か分かる）", deal.Deal_Name.indexOf("RhatlakornKhomsan/") === 0, deal.Deal_Name);
  check("資格の全量は shikaku 側に残る", Array.isArray(deal.shikaku) && deal.shikaku.length >= 2);
  check("修正前の素の連結だと上限を超えていた（再現の確認）",
        ("RhatlakornKhomsan/" + ALL_LICENSES).length > 120);
}

console.log(failures === 0 ? "\nzoho-field-limits: すべてOK" : `\nzoho-field-limits: ${failures}件 失敗`);
process.exit(failures === 0 ? 0 : 1);
