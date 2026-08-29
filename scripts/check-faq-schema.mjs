#!/usr/bin/env node
/**
 * FAQ本文と構造化データ(JSON-LD)の一致を見張る。
 *
 * 表示しているQ&Aと ld+json の中身がズレると、Googleはリッチリザルトの
 * 対象から外す。片方だけ直す事故が起きやすいので機械で止める。
 * あわせて運営者情報ブロックの必須項目も確認する。
 *
 * 対象は「cvr-faq-schema を持つページ」だけ。構造化データを入れていない
 * 既存LPは素通しなので、1本ずつ広げていける。
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync('git -c core.quotePath=false ls-files -z -- "*.html"', {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
}).split("\0").filter(Boolean);

const strip = (s) =>
  s.replace(/<[^>]*>/g, "")
   .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

let checked = 0;
const errors = [];

for (const file of files) {
  const html = readFileSync(file, "utf8");
  const ld = html.match(
    /<script type="application\/ld\+json" id="cvr-faq-schema">([\s\S]*?)<\/script>/
  );
  if (!ld) continue;
  checked++;

  let graph;
  try {
    graph = JSON.parse(ld[1])["@graph"];
  } catch (e) {
    errors.push(`${file}: JSON-LD が壊れている (${e.message})`);
    continue;
  }

  const faqNode = graph.find((n) => n["@type"] === "FAQPage");
  const orgNode = graph.find((n) => n["@type"] === "Organization");
  if (!faqNode) { errors.push(`${file}: FAQPage が無い`); continue; }
  if (!orgNode) errors.push(`${file}: Organization が無い`);
  else if (!String(orgNode.identifier ?? "").includes("13-ユ-316946"))
    errors.push(`${file}: Organization に許可番号が無い`);

  const shown = [...html.matchAll(
    /<details class="cvr-faq__item">\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g
  )].map((m) => [strip(m[1]), strip(m[2])]);

  const inLd = faqNode.mainEntity.map((q) => [
    strip(q.name), strip(q.acceptedAnswer?.text ?? ""),
  ]);

  if (shown.length !== inLd.length) {
    errors.push(`${file}: 表示 ${shown.length}問 と JSON-LD ${inLd.length}問 で件数が違う`);
    continue;
  }
  shown.forEach(([q, a], i) => {
    if (q !== inLd[i][0]) errors.push(`${file}: 質問 ${i + 1} がズレている\n    表示: ${q}\n    LD  : ${inLd[i][0]}`);
    if (a !== inLd[i][1]) errors.push(`${file}: 回答 ${i + 1} がズレている\n    表示: ${a}\n    LD  : ${inLd[i][1]}`);
  });

  if (!html.includes('class="cvr-about"')) {
    errors.push(`${file}: 運営者情報ブロック (.cvr-about) が無い`);
  } else {
    for (const need of ["XCHANGE株式会社", "13-ユ-316946", "/privacypolicy"]) {
      if (!html.includes(need)) errors.push(`${file}: 運営者情報に「${need}」が無い`);
    }
    if (!html.includes('id="cvr-about-css"'))
      errors.push(`${file}: 運営者情報のスタイルが無い`);
  }
}

if (errors.length) {
  console.error("✗ FAQと構造化データの不一致:\n");
  errors.forEach((e) => console.error("  " + e));
  console.error(`\n${errors.length} 件`);
  process.exit(1);
}
console.log(`✓ FAQと構造化データ一致OK（${checked} ページ走査）`);
