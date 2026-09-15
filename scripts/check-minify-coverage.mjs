#!/usr/bin/env node
/**
 * deploy.yml の minify 対象の取りこぼしを止める番人（2026-09-15）。
 *
 * 経緯: deploy.yml の「Minify JS/CSS/HTML」はファイルの明示リストで、新しいアセットや
 * LPを足すたびに書き足す運用だった。2026-08-25 には広告着地ファミリーの HTML が
 * 生のまま配信されていたのが見つかり、2026-09-15 には新規の lp-area-nav.js と、
 * 全LPが load 後に fetch する steps-lazy.html（13本）・denkikouji-trust / denkikouji-nd /
 * dk_lp / service / privacypolicy の HTML（合計 gz 40KB 超）がリストに無いまま配信されていた。
 * 「リストに書き足す」を人が覚えている限り必ず漏れるので、機械で見張る。
 *
 * 見るもの:
 *   1. 配信されるHTMLから参照されるローカル JS / CSS がすべて minify リストにあること
 *   2. フォームLP（index.html か隣の steps-lazy.html に your-tel があるページ）の index.html
 *   3. すべての steps-lazy.html（load 後に必ず fetch されるので毎回の転送量に効く）
 *   4. プライバシーポリシー・利用規約（全LPの同意文から辿る法務ページ。2026-09-15 に terms/ を新設）
 *
 * 使い方: node scripts/check-minify-coverage.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const deploy = readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8");

// ── deploy.yml の minify ステップ本文を取り出す ─────────────────────
const start = deploy.indexOf("name: Minify JS/CSS/HTML");
if (start < 0) { console.error("✗ deploy.yml に「Minify JS/CSS/HTML」ステップが無い"); process.exit(1); }
const rest = deploy.slice(start);
const next = rest.indexOf("\n      - name:", 10);
const step = next > 0 ? rest.slice(0, next) : rest;

// 明示的に列挙されたファイル（.js / .css / .html）。行継続の `\` や `; do` の有無に依存しない
const listed = new Set();
for (const m of step.matchAll(/(?:^|\s)((?:[\w./\-]|[^\x00-\x7f])+\.(?:js|css|html))(?=\s|$|;)/gm)) {
  listed.add(m[1].replace(/^\.\//, ""));
}
// `find A B -name index.html` / `find . ... -name steps-lazy.html` のような動的な対象
const finds = [];
for (const m of step.matchAll(/find\s+([^\n|]+?)\s+-name\s+(index\.html|steps-lazy\.html)/g)) {
  const dirs = m[1].split(/\s+/).filter((t) => t && !t.startsWith("-") && t !== "-o" && t !== "-prune" && t !== "-print");
  finds.push({ dirs: dirs.map((d) => d.replace(/^\.\//, "").replace(/\/$/, "")), name: m[2] });
}
function covered(rel) {
  if (listed.has(rel)) return true;
  const base = path.basename(rel);
  return finds.some((f) => f.name === base && f.dirs.some((d) => d === "." || rel.startsWith(d + "/")));
}

// ── 配信対象のHTML（deploy.yml の rsync 除外と同じものは外す） ─────────
const EXCLUDED = ["docs/", "scripts/", "gas-recorder/", "deploy/", "v2-deploy/", "thanks/", "WPLP/thanks/", "自前LP/thanks/", "nenshu-shindan/thanks/"];
const htmls = execSync('git -c core.quotePath=false ls-files -z -- "*.html"', { cwd: ROOT, encoding: "utf8" })
  .split("\0").filter(Boolean)
  .filter((f) => !EXCLUDED.some((e) => f.startsWith(e)));

const missing = [];
const seenAsset = new Set();
const ATTR = /(?:\bsrc|\bhref)="([^"?#]+\.(?:js|css))(?:\?[^"]*)?"/g;

for (const f of htmls) {
  const html = readFileSync(path.join(ROOT, f), "utf8");
  // 1. 参照されるローカル JS / CSS
  for (const m of html.matchAll(ATTR)) {
    const u = m[1];
    if (/^(https?:)?\/\//.test(u) || u.startsWith("/")) continue;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(f), u));
    if (!existsSync(path.join(ROOT, rel)) || seenAsset.has(rel)) continue;
    seenAsset.add(rel);
    if (!covered(rel)) missing.push(`${rel}（${f} から参照）`);
  }
}

// 2. フォームLPの index.html（index.html か隣の steps-lazy.html に your-tel）
// 3. すべての steps-lazy.html
// 4. プライバシーポリシー
const hasTel = (p) => existsSync(p) && /name="your-tel"/.test(readFileSync(p, "utf8"));
for (const f of htmls) {
  const abs = path.join(ROOT, f);
  const base = path.basename(f);
  let must = false;
  if (base === "steps-lazy.html") must = true;
  else if (base === "index.html") {
    const lazy = path.join(path.dirname(abs), "steps-lazy.html");
    if (hasTel(abs) || hasTel(lazy)) must = true;
    if (/(^|\/)(privacypolicy|terms)\/index\.html$/.test(f)) must = true;
  }
  if (must && !covered(f)) missing.push(f);
}

if (missing.length) {
  console.error(`✗ deploy.yml の minify 対象に無いまま配信されるファイルが ${missing.length} 件:`);
  for (const m of missing) console.error("  - " + m);
  console.error("  → .github/workflows/deploy.yml の「Minify JS/CSS/HTML」に追加する（生のまま本番に出て転送量が増える）");
  process.exit(1);
}
console.log(`✓ minify カバレッジOK（明示 ${listed.size} 件 + find ${finds.length} 系統 / 参照アセット ${seenAsset.size} 件 / HTML ${htmls.length} 本走査）`);
