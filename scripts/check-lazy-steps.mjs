#!/usr/bin/env node
// data-lazy-src（遅延ステップ読み込み）のパスが実在ファイルに解決されるか検証する。
// 経緯: 2026-06-21 PR#21 で meta-lp/denkikouji の data-lazy-src が
// "../denkikouji/steps-lazy.html"（自分自身のディレクトリに解決＝404）で導入され、
// step01→step03 でフォームが進めない状態が本番に約11日間露出した（2026-07-03 発見）。
// 相対パスの解決はブラウザと同じ「HTMLのあるディレクトリ基準」で行う。
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const files = execSync('git -c core.quotePath=false ls-files -z -- "*.html"', { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

let scanned = 0;
const errors = [];
for (const f of files) {
  const html = readFileSync(f, "utf8");
  const re = /data-lazy-src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    scanned++;
    const rel = m[1].split("?")[0].split("#")[0];
    if (/^https?:\/\//.test(rel)) continue; // 絶対URLは対象外
    const resolved = path.normalize(path.join(path.dirname(f), rel));
    if (!existsSync(resolved)) {
      errors.push(`${f}: data-lazy-src="${m[1]}" → ${resolved} が存在しない（フォームがそのステップで停止する）`);
    }
  }
}

if (errors.length) {
  console.error("✗ data-lazy-src の解決先が404になるLPがあります:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✓ data-lazy-src 解決OK（${scanned} 参照走査）`);
