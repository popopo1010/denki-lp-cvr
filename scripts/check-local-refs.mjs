#!/usr/bin/env node
// 全HTMLの相対参照（src / href / data-lazy-src / srcset / imagesrcset）が
// リポジトリ内の実在ファイルに解決されるか検証する。
// 経緯: 2026-07-03、dk_lp/sekokanri のFV画像srcsetが「../assets/」（1階層不足）で
// スマホ用webpが404になっていた（picture のフォールバックで見た目は保たれるが
// LCP劣化＋転送増）。data-lazy-src の404事故（check-lazy-steps.mjs）と同根の
// 「相対パスの階層数え間違い」を、srcset 系属性まで含めて機械検証する。
// 注意: サイト絶対パス(/...)と絶対URL(https://...)はWP側資産のため対象外。
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const files = execSync('git -c core.quotePath=false ls-files -z -- "*.html"', { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const ATTR = /(?:\bsrc|\bhref|data-lazy-src)="([^"]+)"/g;
const SRCSET = /(?:imagesrcset|srcset)="([^"]+)"/g;

function* urlsOf(html) {
  for (const m of html.matchAll(ATTR)) yield m[1];
  for (const m of html.matchAll(SRCSET)) {
    for (const part of m[1].split(",")) {
      const tok = part.trim().split(/\s+/)[0];
      if (tok) yield tok;
    }
  }
}

let scanned = 0;
const errors = [];
for (const f of files) {
  const html = readFileSync(f, "utf8");
  const base = path.dirname(f);
  for (const url of urlsOf(html)) {
    const u = url.split("?")[0].split("#")[0].trim();
    if (!u || /^(https?:\/\/|\/\/|\/|data:|mailto:|tel:|javascript:|\{)/.test(u)) continue;
    scanned++;
    let p = path.normalize(path.join(base, u));
    if (u.endsWith("/")) p = path.join(p, "index.html");
    const ok = existsSync(p) && (statSync(p).isFile() || existsSync(path.join(p, "index.html")) || statSync(p).isDirectory());
    if (!ok) errors.push(`${f}: ${url} → ${p} が存在しない`);
  }
}

if (errors.length) {
  console.error(`✗ 相対参照の解決先が存在しないものが ${errors.length} 件:`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✓ 相対参照の解決OK（${files.length}ファイル / ${scanned}参照走査・srcset含む）`);

// ===== WPテーマ配下への実行時参照が増えていないこと（2026-08-31 Phase 0）=====
// LPは画像を wp-content/themes/original-thema/assets/ から取っていた。WordPress を
// 畳んだ瞬間に全LPの画像が消える状態だったので、1,115参照をリポジトリ内へ移した。
// ここは「戻り」を止めるラチェット。新しい参照を足すと落ちる。
// 消すのではなく、実体をリポジトリに入れてから相対パスで参照すること。
const WP_THEME = "denkilp.builders-job.com/wp-content/themes/original-thema/assets";

// まだ実体を持っていない＝いまは残していい参照だけを明示する。
// 受領できたら assets/ に置き、参照を相対パスへ直し、ここから消す。
const ALLOWED = [
  // og:image は絶対URLでなければ SNS のクローラが読めない。差し替えには実体が要る。
  { pattern: "/ogp/ogp.jpg", where: null, why: "og:image。ogp.jpg の実体を未受領" },
  { pattern: "/img/step04_icon01.png", where: "dk_lp/denkikouji/index.html", why: "実体を未受領" },
  { pattern: "/img/step04_icon02.png", where: "dk_lp/denkikouji/index.html", why: "実体を未受領" },
  { pattern: "/img/step04_icon03.png", where: "dk_lp/denkikouji/index.html", why: "実体を未受領" },
  { pattern: "/img/step04_icon05.png", where: "dk_lp/denkikouji/index.html", why: "実体を未受領" }
];

const wpFiles = execSync('git -c core.quotePath=false ls-files -z -- "*.html" "*.js"', { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  // v2-deploy/ は WordPress の固定ページ本文に貼り付けるHTML。WP内で動くので絶対URLが正しい。
  .filter((f) => !f.startsWith("v2-deploy/") && !f.startsWith("docs/") && !f.startsWith("dk_lp/docs/"));

const wpViolations = [];
for (const f of wpFiles) {
  const src = readFileSync(f, "utf8");
  if (!src.includes(WP_THEME)) continue;
  for (const m of src.matchAll(new RegExp(WP_THEME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\"' )]*)", "g"))) {
    const tail = m[1];
    const allowed = ALLOWED.some((a) => a.pattern === tail && (a.where === null || a.where === f));
    if (!allowed) wpViolations.push(`${f}: ${WP_THEME}${tail}`);
  }
}

if (wpViolations.length) {
  console.error(`✗ WPテーマ配下への参照が ${wpViolations.length} 件増えている（WordPress を止めると消える）:`);
  for (const v of [...new Set(wpViolations)]) console.error("  - " + v);
  console.error("  実体を assets/ に入れて相対パスで参照するか、実体待ちなら ALLOWED に理由付きで追加すること");
  process.exit(1);
}
console.log(`✓ WPテーマ配下への参照は許可済み ${ALLOWED.length} 種のみ（実体の受領待ち）`);
