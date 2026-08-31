#!/usr/bin/env node
/**
 * LPを「メイン（広告の着地）」と「その他」の2段階に分ける。
 *
 * なぜ要るか:
 *   LPは50本以上あるが、広告費が乗っていて壊れると即CVを失うのは一部だけ。
 *   全部を等しく扱うと、メインの異常に気づくのが最後尾になる。
 *   先にメインだけ短時間で通し、緑になってから残りを回す。
 *
 * どう決めているか:
 *   Zoho商談のLP別集計（scripts/lp-tiers.json の _出典）で実際にリードが来ている
 *   `_lp` の値を main_lp_ids に置く。ページの列挙は持たない——同じ `_lp` を名乗る
 *   ページは複数ある（root / WPLP / 自前LP / dk_lp のミラー）ので、
 *   各HTMLの window.__LP_ID を走査して拾う。ミラーを増やしても追随する。
 *
 * 使い方:
 *   node scripts/lp-tiers.mjs main   → メインのLPパスを1行ずつ
 *   node scripts/lp-tiers.mjs rest   → それ以外のフォームLPを1行ずつ
 *   node scripts/lp-tiers.mjs        → 両方を見出し付きで
 */
import { readFileSync, globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONF = JSON.parse(readFileSync(path.join(ROOT, "scripts/lp-tiers.json"), "utf8"));
const MAIN_IDS = new Set(CONF.main_lp_ids);

const skip = (f) =>
  f.startsWith("v2-deploy/") ||   // WordPress の固定ページに貼るHTML。単体では動かない
  f.startsWith("docs/") || f.startsWith("dk_lp/docs/");

/** フォームを持つLP = index.html か隣の steps-lazy.html に your-tel があるページ。
 *  index.html だけで判定すると、入力欄を遅延側に置く主力（denkikouji / sekoukanri）が漏れる。 */
export function formLps() {
  const dirs = new Set();
  for (const f of globSync("**/{index,steps-lazy}.html", { cwd: ROOT })) {
    if (skip(f)) continue;
    if (!readFileSync(path.join(ROOT, f), "utf8").includes('name="your-tel"')) continue;
    dirs.add("/" + path.dirname(f).replace(/^\.$/, "") + "/");
  }
  return [...dirs].sort();
}

/** window.__LP_ID が main_lp_ids のいずれかであるページ（＝広告の着地とそのミラー）。 */
export function mainLps() {
  const out = new Set();
  for (const f of globSync("**/index.html", { cwd: ROOT })) {
    if (skip(f)) continue;
    const m = readFileSync(path.join(ROOT, f), "utf8").match(/__LP_ID\s*=\s*"([^"]+)"/);
    if (m && MAIN_IDS.has(m[1])) out.add("/" + path.dirname(f).replace(/^\.$/, "") + "/");
  }
  return [...out].sort();
}

export function restLps() {
  const main = new Set(mainLps());
  return formLps().filter((l) => !main.has(l));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv[2];
  if (which === "main") console.log(mainLps().join("\n"));
  else if (which === "rest") console.log(restLps().join("\n"));
  else {
    console.log(`== メイン（${CONF._出典}）==`);
    console.log(mainLps().map((l) => "  " + l).join("\n"));
    console.log(`\n== その他（${restLps().length}本）==`);
    console.log(restLps().map((l) => "  " + l).join("\n"));
  }
}
