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

const EXPECT = {
  css: "cvr-boost-denkikouji.css?v20260713",
  app: "app.js?v20260712",
  lazy: "steps-lazy.html?v20260712"
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
  ["step06 満足度94%", lazy.includes("利用者の<strong>94%</strong>が満足と回答")],
  ["submit CTA 文言", lazy.includes("あなたに合う求人を見る")],
  ["thanks-v2 遷移", app.includes("thanks-v2")],
  ["dk_lp_lead_v1", app.includes("dk_lp_lead_v1")],
  ["dk_test ガード", app.includes("dk_test")],
  ["submit input 非表示CSS", css.includes(".c-submit-button input") && css.includes("font-size: 0 !important")],
  ["FV CTA 76px", css.includes("min-height: 76px") && lp.includes("min-height:76px")],
  // ダークモード視認性（2026-06-12 入力ステップCTAバー暗転事故の再発防止）
  ["LP color-scheme meta", lp.includes('<meta name="color-scheme" content="only light"')],
  ["LP 地色白(critical CSS)", lp.includes("color-scheme:only light") && lp.includes("html,body{background-color:#fff}")],
  ["meta-LP color-scheme meta", meta.includes('<meta name="color-scheme" content="only light"')],
  ["meta-LP 地色白(critical CSS)", meta.includes("color-scheme:only light") && meta.includes("html,body{background-color:#fff}")],
  ["CSS 地色白バックストップ", css.includes("color-scheme: only light") && css.includes("html, body { background-color: #fff; }")],
  ["sticky CTAバー不透明背景", css.includes("background: linear-gradient(180deg, rgba(255,255,255,0) 0%, #fff 10px)")]
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
