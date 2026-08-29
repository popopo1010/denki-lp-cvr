#!/usr/bin/env node
/**
 * LP v2: サンクス「求人概要→電話→全文」の流れと期待値を揃える
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const LP_GLOBS = [
  "denkikouji-v2/index.html",
  "sekoukanri-v2/index.html",
  "sekoukanri-kentiku-v2/index.html",
  "sekoukanri-doboku-v2/index.html",
  "sekoukanri-denkisekou-v2/index.html",
  "WPLP/denkikouji-v2/index.html",
  "WPLP/sekoukanri-v2/index.html",
  "WPLP/sekoukanri-kentiku-v2/index.html",
  "WPLP/sekoukanri-doboku-v2/index.html",
  "WPLP/sekoukanri-denkisekou-v2/index.html",
  "自前LP/denkikouji-v2/index.html",
  "自前LP/sekoukanri-v2/index.html",
  "自前LP/sekoukanri-kentiku-v2/index.html",
  "自前LP/sekoukanri-doboku-v2/index.html",
  "自前LP/sekoukanri-denkisekou-v2/index.html"
];

const REPLACEMENTS = [
  [
    "の条件にあった<span class=\"text-span-2\"><strong>新着求人が多数</strong></span>見つかりました。",
    "の経験を活かせる、<span class=\"text-span-2\"><strong>今より好条件</strong></span>の求人が見つかりそうです"
  ],
  [
    "<span>あなたに合う求人を見る</span>",
    "<span>今より好条件の求人を見る（無料）</span>"
  ]
];

/** 既に「比較軸」表記に更新済みのLPを平易語に揃える */
const PLAIN_REPLACEMENTS = [
  ["<span>比較軸を見る（無料）</span>", "<span>今より好条件の求人を見る（無料）</span>"]
];

const ALL_REPLACEMENTS = REPLACEMENTS.concat(PLAIN_REPLACEMENTS);

let updated = 0;
for (const rel of LP_GLOBS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.warn("skip:", rel);
    continue;
  }
  let html = fs.readFileSync(abs, "utf8");
  let changed = false;
  for (const [from, to] of ALL_REPLACEMENTS) {
    if (html.includes(from)) {
      html = html.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(abs, html, "utf8");
    updated++;
    console.log("updated", rel);
  }
}
console.log(`done: ${updated} files`);
