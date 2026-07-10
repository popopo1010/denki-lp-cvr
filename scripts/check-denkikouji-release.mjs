#!/usr/bin/env node
/**
 * denkikouji リリース前静的チェック（事業・マーケ責任者向け）
 * Usage: node scripts/check-denkikouji-release.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const lp = read("denkikouji/index.html");
const lazy = read("denkikouji/steps-lazy.html");
const meta = read("meta-lp/denkikouji/index.html");
const css = read("assets/css/cvr-boost-denkikouji.css");
const app = read("assets/js/app.js");

// ?v= はHTMLから自動導出（固定値だとbump時の更新漏れで陳腐化する: 2026-07-10 に
// css v20260705b / app v20260707 のまま取り残されていたのを発見）
const EXPECT = {
  css: (lp.match(/cvr-boost-denkikouji\.css\?v[0-9a-z]+/) || ["cvr-boost-denkikouji.css?v"])[0],
  app: (lp.match(/app\.js\?v[0-9a-z]+/) || ["app.js?v"])[0],
  lazy: (lp.match(/steps-lazy\.html\?v[0-9a-z]+/) || ["steps-lazy.html?v"])[0]
};

[
  ["LP CSS", lp.includes(EXPECT.css)],
  ["LP app.js", lp.includes(EXPECT.app)],
  ["LP lazy steps", lp.includes(EXPECT.lazy)],
  ["meta CSS", meta.includes(EXPECT.css)],
  ["meta app.js", meta.includes(EXPECT.app)],
  ["FV 全5ステップ", lp.includes("全5ステップ")],
  ["step01 あと4", lp.includes("あと4ステップ")],
  ["step06 損失回避コピー", lazy.includes("いま見ないと損")],
  ["step06 満足度96.4%", lazy.includes("利用者の<strong>96.4%</strong>が満足と回答")],
  ["submit CTA 文言", lazy.includes("あなたに合う求人を見る")],
  ["thanks-v2 遷移", app.includes("thanks-v2")],
  ["dk_lp_lead_v1", app.includes("dk_lp_lead_v1")],
  ["dk_test ガード", app.includes("dk_test")],
  ["submit input 非表示CSS", css.includes(".c-submit-button input") && css.includes("font-size: 0 !important")],
  ["FV CTA 76px", css.includes("min-height: 76px") && lp.includes("min-height:76px")]
].forEach(([k, v]) => (v ? pass("denkikouji", k) : fail("denkikouji", k)));

// 94%・34,513 は 2026-06 にオーナー判断で step06 に復活（根拠データは本番反映手順書の確認事項）
const forbidden = [
  ["本登録", "本登録表記"],
  ["プレビュー", "プレビュー表記"],
  ["/thanks/", "旧thanks直遷移（thanks-v2以外）"]
];
for (const [needle, label] of forbidden) {
  const inLazy = lazy.includes(needle);
  const inLp = lp.includes(needle);
  if (needle === "/thanks/") {
    !app.match(/location\.href\s*=\s*["']\/thanks\//) ? pass("禁止", label) : fail("禁止", `${label} in app.js`);
  } else if (!inLazy && !inLp) {
    pass("禁止", label);
  } else {
    fail("禁止", `${label} が残存`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
process.exit(failed.length ? 1 : 0);
