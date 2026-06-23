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
    "次に届く求人：<strong>1級・2級・資格別</strong>のマッチリスト（あと3ステップ）",
    "次の画面：あなたの資格に合う<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "次に届く求人：<strong>1級・2級・工種別</strong>（建築／土木／電気施工管理）のマッチリスト（あと3ステップ）",
    "次の画面：施工管理向けの<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "次に届く求人：<strong>建築施工管理の1級・2級</strong>に特化したマッチリスト（あと3ステップ）",
    "次の画面：建築施工管理向けの<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "次に届く求人：<strong>土木施工管理の1級・2級</strong>に特化したマッチリスト（あと3ステップ）",
    "次の画面：土木施工管理向けの<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "次に届く求人：<strong>電気工事施工管理の1級・2級</strong>に特化したマッチリスト（あと3ステップ）",
    "次の画面：電気施工管理向けの<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "このあと：<strong>経験種別に合った年収帯</strong>で求人を絞り込みます（あと2ステップ）",
    "このあと：<strong>経験に合った求人</strong>を優先表示（あと2ステップ）"
  ],
  [
    "回答後：<strong>通勤しやすい求人</strong>を優先表示（あと2ステップ）",
    "回答後：<strong>登録エリア</strong>で比較しやすい枠を優先（あと2ステップ）"
  ],
  [
    "回答後：<strong>年齢に合った給与相場</strong>で紹介精度が上がります（あと1ステップ）",
    "回答後：<strong>年齢帯に合った求人</strong>で精度が上がります（あと1ステップ）"
  ],
  [
    "送信後：<strong>条件に合う新着求人</strong>を担当から無料案内（営業電話なし）",
    "送信後、<strong>条件に合う求人</strong>をご案内"
  ],
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
  [
    "次の画面：<strong>現職と比べられる比較軸</strong>を先にお見せします（求人全文は10分のお電話後 · あと3ステップ）",
    "次の画面：あなたの資格に合う<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "次の画面：施工管理向けの<strong>比較軸</strong>を先にお見せします（全文は10分のお電話後 · あと3ステップ）",
    "次の画面：施工管理向けの<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "次の画面：建築施工管理向けの<strong>比較軸</strong>を先にお見せします（全文は10分のお電話後 · あと3ステップ）",
    "次の画面：建築施工管理向けの<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "次の画面：土木施工管理向けの<strong>比較軸</strong>を先にお見せします（全文は10分のお電話後 · あと3ステップ）",
    "次の画面：土木施工管理向けの<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "次の画面：電気施工管理向けの<strong>比較軸</strong>を先にお見せします（全文は10分のお電話後 · あと3ステップ）",
    "次の画面：電気施工管理向けの<strong>求人</strong>を準備中（あと3ステップ）"
  ],
  [
    "このあと：<strong>経験に合った比較軸</strong>を優先表示（あと2ステップ）",
    "このあと：<strong>経験に合った求人</strong>を優先表示（あと2ステップ）"
  ],
  [
    "回答後：<strong>年齢帯に合った比較軸</strong>で精度が上がります（あと1ステップ）",
    "回答後：<strong>年齢帯に合った求人</strong>で精度が上がります（あと1ステップ）"
  ],
  [
    "送信後：<strong>比較軸の輪郭</strong>を表示 → 全文は10分のお電話ですり合わせ後（しつこい営業はしません）",
    "送信後、<strong>条件に合う求人</strong>をご案内"
  ],
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
