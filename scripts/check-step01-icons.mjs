#!/usr/bin/env node
/**
 * step01 の資格アイコンが「表示サイズに見合った軽量版」で配られることの番人（2026-09-12）。
 *
 * 資格選択ボタンのアイコン（denkikouji / denkisekou / denkishunin / other）は
 * WPテーマ配信の原寸が 1665x1733 前後・4枚で 238,836B ある。
 * 一方の実描画はモバイル 44px / PC 50px（テーマCSS込みで実測）で、
 * **必要画素数の100倍以上を配っていた**。FVをタップした直後に4枚まとめて走るので、
 * 初期表示ではなく「最初の操作」の体感に効く。
 *
 * 判定: これらのアイコンを持つ <picture> は、**最初の <source> が軽量版 -192.webp** であり、
 *       **テーマ原寸の webp を <source> に持たない**こと。<picture> は type/media で選んだ source が
 *       404 でも次の source へ落ちないので、原寸 webp を2番目に置いても取得失敗時のフォールバックには
 *       ならず、ボタン1つにつき約150Bの死んだタグになるだけ（2026-10-04 に全LPから外した）。
 *       <img> の PNG は webp 非対応ブラウザ用に残す。
 *
 * 実行: node scripts/check-step01-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = ["denkikouji", "denkisekou", "denkishunin", "other"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "index.html" || e.name === "steps-lazy.html") out.push(p);
  }
  return out;
}

// 軽量版の実体があること（参照だけ足して画像を入れ忘れると本番で原寸に落ちる）
let bad = 0;
for (const n of ICONS) {
  const f = path.join(ROOT, "assets", "img", `${n}-192.webp`);
  if (!fs.existsSync(f)) { bad++; console.log(`  NG  assets/img/${n}-192.webp が無い`); }
}

let pages = 0;
for (const file of walk(ROOT)) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  let touched = false;
  for (const pic of html.match(/<picture>[\s\S]*?<\/picture>/g) || []) {
    // -192 だけの <picture>（原寸名が <img> にも無い書き方）も見落とさない
    const icon = ICONS.find((n) => new RegExp(`[/"]${n}(-192)?\\.(webp|png)`).test(pic));
    if (!icon) continue;
    touched = true;
    const sources = pic.match(/<source[^>]*>/g) || [];
    const first = sources[0] || "";
    if (!first.includes(`${icon}-192.webp`)) {
      bad++;
      console.log(`  NG  ${rel}: ${icon} の <picture> が原寸から始まっている（先頭に -192 を置く）`);
    }
    if (sources.some((t) => new RegExp(`[/"]${icon}\\.webp"`).test(t))) {
      bad++;
      console.log(`  NG  ${rel}: ${icon} の <picture> に原寸 webp の <source> が残っている（フォールバックにならない死んだタグ。外す）`);
    }
  }
  if (touched) pages++;
}

console.log(bad === 0
  ? `✓ step01アイコンの軽量版OK（${pages}ページ走査）`
  : `--- step01アイコンの配り方に問題 ${bad} 件（${pages}ページ中） ---`);
process.exit(bad === 0 ? 0 : 1);
