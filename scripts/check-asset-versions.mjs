#!/usr/bin/env node
/**
 * キャッシュバスター(?v=)の番人
 *
 * このリポジトリで一番高くついている事故は「?v= を上げ忘れた／一部だけ上げた」。
 * アセットは immutable キャッシュ前提なので、中身を変えても ?v= が同じなら
 * ユーザーには一生古いファイルが配られる（本番でだけ直らない＝原因が分からない）。
 *
 * 3つの目で見る:
 *   A. 同じアセットが、HTML全体で1つの ?v= に揃っているか（一部だけ bump の検出）
 *   B. アセットの中身が変わったのに ?v= が据え置きになっていないか（bump忘れの検出）
 *   C. deploy.yml が本番で grep する期待値が、リポジトリのHTMLと一致しているか
 *      （ここがズレると、本番へ rsync した「後」に検証が落ちる ＝ 事故った状態で気づく）
 *
 * 使い方:
 *   node scripts/check-asset-versions.mjs            検査（CI）
 *   node scripts/check-asset-versions.mjs --update   ?v= を正しく上げた後に台帳を更新
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LEDGER = join(ROOT, "scripts", "asset-versions.json");
const UPDATE = process.argv.includes("--update");

const SKIP_DIRS = new Set([".git", "node_modules", "docs", ".netlify", ".github"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);

const errors = [];
const notes = [];

// ── A. HTML内の ?v= を集計 ───────────────────────────────────
// href="../assets/js/app.js?v20260822a" / src="...thanks-page.css?v=57" の両表記に対応
const REF = /(?:href|src)="([^"?]+\.(?:js|css|html))\?v=?([A-Za-z0-9._-]+)"/g;
const versions = new Map(); // repo相対パス -> Map(version -> [html...])

for (const html of walk(ROOT)) {
  const src = readFileSync(html, "utf8");
  for (const m of src.matchAll(REF)) {
    const [, ref, ver] = m;
    if (/^https?:\/\//.test(ref)) continue;
    const abs = resolve(dirname(html), ref);
    if (!abs.startsWith(ROOT)) continue;
    const rel = relative(ROOT, abs);
    if (!existsSync(abs)) continue; // 存在チェックは check-local-refs.mjs の担当
    if (!versions.has(rel)) versions.set(rel, new Map());
    const byVer = versions.get(rel);
    if (!byVer.has(ver)) byVer.set(ver, []);
    byVer.get(ver).push(relative(ROOT, html));
  }
}

for (const [asset, byVer] of [...versions].sort()) {
  if (byVer.size <= 1) continue;
  const detail = [...byVer]
    .map(([v, files]) => `  v=${v} … ${files.length}ファイル (例: ${files[0]})`)
    .join("\n");
  errors.push(`${asset} の ?v= が揃っていない（一部だけ bump した疑い）:\n${detail}`);
}

// ── JS内にハードコードされたキャッシュキーも同じ台帳で見る ──
const JS_PINNED = [
  { file: "assets/js/app.js", asset: "assets/js/cvr-boost.js", re: /CVR_BOOST_VER\s*=\s*"([^"]+)"/ },
  { file: "assets/js/app.js", asset: "assets/js/thanks-booking-bootstrap.js", re: /thanks-booking-bootstrap\.js\?v=([A-Za-z0-9._-]+)/ },
  { file: "assets/js/app-v2.js", asset: "assets/js/thanks-booking-bootstrap.js", re: /thanks-booking-bootstrap\.js\?v=([A-Za-z0-9._-]+)/ }
];
for (const { file, asset, re } of JS_PINNED) {
  const p = join(ROOT, file);
  if (!existsSync(p) || !existsSync(join(ROOT, asset))) continue;
  const m = readFileSync(p, "utf8").match(re);
  if (!m) { errors.push(`${file}: ${asset} のキャッシュキーが見つからない（配線が消えた？）`); continue; }
  if (!versions.has(asset)) versions.set(asset, new Map());
  const byVer = versions.get(asset);
  if (!byVer.has(m[1])) byVer.set(m[1], []);
  byVer.get(m[1]).push(file);
}

// ── B. 中身が変わったのに ?v= 据え置き ─────────────────────
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
const nextLedger = {};

for (const [asset, byVer] of [...versions].sort()) {
  const ver = [...byVer.keys()].sort().join("+");
  const digest = sha(join(ROOT, asset));
  nextLedger[asset] = { version: ver, sha256: digest };
  const prev = ledger[asset];
  if (!prev) { notes.push(`台帳に新規追加: ${asset} (v=${ver})`); continue; }
  if (prev.sha256 !== digest && prev.version === ver) {
    errors.push(
      `${asset}: 中身が変わったのに ?v=${ver} が据え置き。` +
      `参照している全HTMLの ?v= を上げてから \`node scripts/check-asset-versions.mjs --update\``
    );
  }
  if (prev.sha256 === digest && prev.version !== ver) {
    notes.push(`${asset}: 中身は同じで ?v= だけ変わった (${prev.version} → ${ver})`);
  }
}

// ── B2. HTMLから参照されるローカルJS/CSSは必ず ?v= を持つ ────
// .htaccess が js/css を immutable(1年) で配るので、版が無いファイルは
// 中身を変えても永遠に古いものが配られる（2026-08-23 に長期キャッシュを有効化）。
{
  const NOVER = /(?:href|src)="((?!https?:)[^"]+\.(?:js|css))"/g;
  const bare = [];
  for (const html of walk(ROOT)) {
    const src = readFileSync(html, "utf8");
    for (const m of src.matchAll(NOVER)) {
      const abs = resolve(dirname(html), m[1]);
      if (!abs.startsWith(ROOT) || !existsSync(abs)) continue;
      bare.push(`${relative(ROOT, html)} → ${m[1]}`);
    }
  }
  if (bare.length) {
    errors.push(
      `?v= の無いローカルJS/CSS参照がある（.htaccess が js/css を immutable で配るため、` +
      `中身を変えても届かなくなる）:\n` + bare.slice(0, 10).map((b) => "    " + b).join("\n")
    );
  }
}

// ── C. deploy.yml の期待値 vs リポジトリのHTML ───────────────
const deployPath = join(ROOT, ".github/workflows/deploy.yml");
if (existsSync(deployPath)) {
  const deploy = readFileSync(deployPath, "utf8");
  // grep -q 'app.js?v20260822a' のような期待値を拾う
  const EXPECT = /grep -q(?:E)? '([A-Za-z0-9._/-]+\.(?:js|css|html))\\?\?v=?([A-Za-z0-9._-]+)'/g;
  for (const m of deploy.matchAll(EXPECT)) {
    const [, file, ver] = m;
    const base = file.split("/").pop();
    // steps-lazy.html のように同名ファイルがLPごとに存在するので、同名アセット全体の
    // バージョン集合と突き合わせる（deploy.yml だけが誰も使っていない値を見ている、を検出する）
    const known = [...versions]
      .filter(([asset]) => asset.endsWith("/" + base) || asset === base)
      .flatMap(([, byVer]) => [...byVer.keys()]);
    if (!known.length) continue;
    if (!known.includes(ver)) {
      errors.push(
        `deploy.yml が本番に期待する ${base}?v=${ver} は、リポジトリのHTML(${known.join(",")})と食い違う。` +
        `このままだと rsync 済み＝本番反映後に Verify が落ちる`
      );
    }
  }
}

// ── 出力 ────────────────────────────────────────────────────
if (UPDATE) {
  writeFileSync(LEDGER, JSON.stringify(nextLedger, null, 2) + "\n", "utf8");
  console.log(`✓ 台帳を更新: scripts/asset-versions.json（${Object.keys(nextLedger).length}アセット）`);
  process.exit(0);
}

notes.forEach((n) => console.log(`· ${n}`));
if (errors.length) {
  console.error("\n✗ キャッシュバスターの不整合:");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
console.log(`✓ ?v= 整合OK（${versions.size}アセット / ${walk(ROOT).length}HTML走査）`);
