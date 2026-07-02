#!/usr/bin/env node
/**
 * クマ（フォロワーアイコン）の初期位置ガード。
 *
 * ルール: FVのクマは「最初のCTA（2択ボタン）を指す」= .cvr-kuma-wrap > .cvr-kuma は
 * top:0 付近でボタン右上に密着させる（v1 cvr-boost.css 準拠）。
 * 負の top で浮かせるとタイトル側に寄り「CTAを指していない」見た目になる
 * （2026-07-02 v2で top:-36px の逸脱が本番露出 → オーナー指摘）。
 * あわせて .cvr-kuma は pointer-events:none（タップを奪わない）を必須とする。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = fs.readdirSync(path.join(ROOT, "assets/css")).filter((f) => /^cvr-boost.*\.css$/.test(f));

let bad = 0;
for (const f of targets) {
  const css = fs.readFileSync(path.join(ROOT, "assets/css", f), "utf-8");
  const m = css.match(/\.cvr-kuma-wrap\s*>\s*\.cvr-kuma\s*\{[^}]*\}/);
  if (!m) continue; // クマ未使用のCSSは対象外
  const block = m[0];
  const top = block.match(/top:\s*(-?\d+)px/);
  if (top && Number(top[1]) < -8) {
    console.error(`✗ ${f}: .cvr-kuma-wrap > .cvr-kuma の top が ${top[1]}px（負のオフセットでCTAから離れる）`);
    bad++;
  }
  // 単独セレクタの .cvr-kuma ルール（`> .cvr-kuma` の wrap ルールは除外）
  const kumaRule = css.match(/(?:^|[}\n])\s*\.cvr-kuma\s*\{[^}]*\}/);
  if (kumaRule && !/pointer-events:\s*none/.test(kumaRule[0])) {
    console.error(`✗ ${f}: .cvr-kuma に pointer-events:none がない（CTAのタップを奪う恐れ）`);
    bad++;
  }
}

if (bad) {
  console.error(`\nクマ初期位置ルール違反 ${bad} 件（scripts/check-kuma-anchor.mjs）。`);
  process.exit(1);
}
console.log(`✓ クマ初期位置ルールOK（${targets.length} CSS走査）`);
