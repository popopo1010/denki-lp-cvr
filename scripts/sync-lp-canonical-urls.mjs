#!/usr/bin/env node
/**
 * 各 LP index.html の canonical / og:url を静的LP本番URLに揃える。
 * Usage: node scripts/sync-lp-canonical-urls.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ORIGIN = "https://denkilp.builders-job.com/denki-lp-cvr";
const SKIP_DIR_RE =
  /(?:^|\/)(?:thanks-v2|ad-cr|assets|scripts|v2-deploy|node_modules|\.git)(?:\/|$)/;

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (SKIP_DIR_RE.test(rel)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (name !== "index.html") continue;
    const src = fs.readFileSync(full, "utf8");
    if (!/window\.__LP_ID\s*=/.test(src)) continue;
    const lpDir = path.dirname(full);
    const relDir = path.relative(ROOT, lpDir).replace(/\\/g, "/");
    out.push({ file: full, relDir, canonical: `${ORIGIN}/${relDir}/` });
  }
}

function patchCanonical(file, canonical) {
  let src = fs.readFileSync(file, "utf8");
  const ogRe = /(<meta\s+property="og:url"\s+content=")[^"]*(")/i;
  const canRe = /(<link\s+rel="canonical"\s+href=")[^"]*(")/i;
  if (!ogRe.test(src) && !canRe.test(src)) return false;
  const next = src
    .replace(ogRe, `$1${canonical}$2`)
    .replace(canRe, `$1${canonical}$2`);
  if (next === src) return false;
  fs.writeFileSync(file, next, "utf8");
  return true;
}

const targets = [];
walk(ROOT, targets);

let updated = 0;
for (const { file, relDir, canonical } of targets) {
  if (patchCanonical(file, canonical)) {
    console.log("updated", relDir, "→", canonical);
    updated++;
  }
}
console.log(`\n${updated} canonical/og:url updated.`);
