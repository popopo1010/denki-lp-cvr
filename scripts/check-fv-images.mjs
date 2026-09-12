#!/usr/bin/env node
/**
 * FVの主画像が「モバイルにPC用を配っていない」ことの番人（2026-09-12）。
 *
 * 2026-09-12 の調査で、27本のLPがモバイルでもPC用のFV画像を preload して
 * LCP要素として描画していた。最悪のケースは 450KB の JPEG（SP版は 21.6KB）。
 * SP版は当時すでにリポジトリにあり、主力LPだけが使っていた＝取りこぼしだった。
 *
 * 判定: FVの主画像（first_banner0103 / sekoukanri_hero）を持つページで、
 *       **モバイルが重いPC用を取りに行かない**こと。具体的には
 *        - <picture> の中で「モバイルで最初にマッチする <source>」が -sp.webp を指す
 *          （media 無しの source も、モバイルにマッチするので合格）
 *        - hero の preload は -sp.webp か、`media="(min-width:768px)"` 付きであること
 *
 * 実行: node scripts/check-fv-images.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERO = ["first_banner0103", "sekoukanri_hero"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "index.html") out.push(p);
  }
  return out;
}

let bad = 0, checked = 0;
for (const file of walk(ROOT)) {
  const html = fs.readFileSync(file, "utf8");
  const hero = HERO.find((h) => new RegExp(`${h}\\.(jpg|webp)`).test(html));
  if (!hero) continue;
  checked++;
  const rel = path.relative(ROOT, file);

  // 1) <picture> の中で「モバイルで最初にマッチする source」が SP版か
  const pic = (html.match(/<picture>[\s\S]*?<\/picture>/g) || [])
    .find((p) => p.includes(hero));
  if (pic) {
    const sources = pic.match(/<source[^>]*>/g) || [];
    const firstMobile = sources.find((sc) => {
      const m = sc.match(/media="([^"]*)"/);
      return !m || /max-width:\s*767px/.test(m[1]); // media無し＝常にマッチ
    });
    if (!firstMobile || !firstMobile.includes(`${hero}-sp.webp`)) {
      bad++;
      console.log(`  NG  ${rel}: モバイルが ${hero} のPC用を取りに行く（最初にマッチする source が -sp.webp でない）`);
    }
  } else if (!html.includes(`${hero}-sp.webp`)) {
    bad++;
    console.log(`  NG  ${rel}: ${hero} を <picture> 無しでPC用のまま配っている`);
  }

  // 2) hero の preload は SP版か、PC専用（min-width:768px）であること
  for (const link of html.match(/<link rel="preload" as="image"[^>]*>/g) || []) {
    if (!link.includes(hero)) continue;
    if (link.includes(`${hero}-sp.webp`)) continue;
    if (/media="\(min-width:\s*768px\)"/.test(link)) continue;
    bad++;
    console.log(`  NG  ${rel}: PC用 ${hero} の preload に media="(min-width:768px)" が無い（モバイルでも取りに行く）`);
  }
}
console.log(bad === 0
  ? `✓ FV主画像のモバイル出し分けOK（${checked}ページ走査）`
  : `--- FV主画像の出し分け漏れ ${bad} 件（${checked}ページ中） ---`);
process.exit(bad === 0 ? 0 : 1);
