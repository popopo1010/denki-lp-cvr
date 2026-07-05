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
