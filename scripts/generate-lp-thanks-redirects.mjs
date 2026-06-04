#!/usr/bin/env node
/**
 * LP配下 /thanks/ を thanks-v2 へ転送する index.html を生成する。
 * WordPress の /thanks/ 301 を避け、旧サンクスURLを新サンクスへ統一する。
 *
 * Usage: node scripts/generate-lp-thanks-redirects.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const THANKS_V2 = "/denki-lp-cvr/thanks-v2/";

const SKIP_DIR_RE =
  /(?:^|\/)(?:nenshu-shindan(?:-v2)?|ad-cr|assets|scripts|thanks-v2|\.git|node_modules)(?:\/|$)/;

function readLpId(indexPath) {
  const src = fs.readFileSync(indexPath, "utf8");
  const m = src.match(/window\.__LP_ID\s*=\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

function isRedirectPage(thanksPath) {
  if (!fs.existsSync(thanksPath)) return false;
  const src = fs.readFileSync(thanksPath, "utf8");
  return src.includes(THANKS_V2) && src.includes("location.replace");
}

function buildRedirectHtml(lpSlug) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>登録完了</title>
<script>
(function(){
  var THANKS=${JSON.stringify(THANKS_V2)};
  var q=new URLSearchParams(location.search);
  if(!q.get("lp"))q.set("lp",${JSON.stringify(lpSlug)});
  location.replace(THANKS+"?"+q.toString());
})();
</script>
</head>
<body><p>移動中…</p></body>
</html>
`;
}

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
    const lpId = readLpId(full);
    if (!lpId) continue;
    const lpDir = path.dirname(full);
    out.push({ rel: path.relative(ROOT, lpDir).replace(/\\/g, "/"), lpId });
  }
}

const targets = [];
walk(ROOT, targets);

let written = 0;
for (const { rel, lpId } of targets) {
  const thanksDir = path.join(ROOT, rel, "thanks");
  const thanksFile = path.join(thanksDir, "index.html");
  if (isRedirectPage(thanksFile)) continue;
  if (fs.existsSync(thanksFile)) {
    const existing = fs.readFileSync(thanksFile, "utf8");
    if (existing.length > 800 && !existing.includes("location.replace")) {
      console.log("skip (custom thanks):", path.relative(ROOT, thanksFile));
      continue;
    }
  }
  fs.mkdirSync(thanksDir, { recursive: true });
  fs.writeFileSync(thanksFile, buildRedirectHtml(lpId), "utf8");
  console.log("wrote", path.relative(ROOT, thanksFile), "→", lpId);
  written++;
}

console.log(`\n${written} redirect page(s) generated.`);
