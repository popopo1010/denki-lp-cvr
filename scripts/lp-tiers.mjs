#!/usr/bin/env node
/**
 * LPを「現役」と「アーカイブ」の2段階に分ける。
 *
 * なぜ要るか:
 *   LPは64本あるが、広告費が乗っていて壊れると即CVを失うのは一部だけ。
 *   全部を等しく扱うと、現役の異常に気づくのが最後尾になる。
 *   先に現役だけを短時間で通し、緑になってから残りを回す。
 *
 * どう決めているか:
 *   scripts/lp-tiers.json の active_lps（パスの列挙）。
 *   **_lp では区別できない**——ミラー（WPLP / 自前LP / dk_lp）は本家と同じ
 *   window.__LP_ID を名乗るので、_lp で引くとミラーまで現役に入ってしまう。
 *   仕分けの根拠は lp-tiers.json の _仕分けの経緯 を参照。
 *
 * アーカイブは消していない。本番でも生きている。
 * 古い広告やブックマークから人が来るとフォームが壊れていてもリードが無言で消えるので、
 * PR時のE2E（--tier archive）からは外さないこと。
 *
 * 使い方:
 *   node scripts/lp-tiers.mjs active    → 現役のLPパスを1行ずつ
 *   node scripts/lp-tiers.mjs archive   → アーカイブのLPパスを1行ずつ
 *   node scripts/lp-tiers.mjs           → 両方を見出し付きで
 */
import { readFileSync, globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONF = JSON.parse(readFileSync(path.join(ROOT, "scripts/lp-tiers.json"), "utf8"));

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

export function activeLps() {
  const all = new Set(formLps());
  const missing = CONF.active_lps.filter((l) => !all.has(l));
  if (missing.length) {
    // 現役に挙げたLPが消えた/名前が変わったのに気づかず「対象が減っただけ」になるのを防ぐ
    throw new Error(`lp-tiers.json の active_lps に、存在しないLPがある: ${missing.join(", ")}`);
  }
  return [...CONF.active_lps].sort();
}

export function archiveLps() {
  const active = new Set(CONF.active_lps);
  return formLps().filter((l) => !active.has(l));
}

// 旧名（--tier main / rest）からの互換
export const mainLps = activeLps;
export const restLps = archiveLps;

if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv[2];
  if (which === "active" || which === "main") console.log(activeLps().join("\n"));
  else if (which === "archive" || which === "rest") console.log(archiveLps().join("\n"));
  else {
    console.log(`== 現役 ${activeLps().length}本 ==`);
    console.log(activeLps().map((l) => "  " + l).join("\n"));
    console.log(`\n== アーカイブ ${archiveLps().length}本（本番では生きている。PR時のE2Eからは外さない）==`);
    console.log(archiveLps().map((l) => "  " + l).join("\n"));
  }
}
