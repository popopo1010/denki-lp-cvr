#!/usr/bin/env node
/**
 * 禁止コピー・禁止ラベルの再発防止ガード（deploy / release-pre-check で必ず実行）。
 *
 * 経緯:
 * - 「しつこい営業」「営業電話」等の“営業”打ち消し表現はCVRを下げるためLPで使わない
 *   （CLAUDE.md / docs/release-incidents.md 2026-06-27）。
 * - 返報文のラベル接頭辞（「このあと：」「回答後：」）は #48 で全LPから削除したが、
 *   固定文言の置換だったため別文言の「次の画面：」がv2系で生き残った（2026-07-02）。
 *   → 文言単位ではなくパターン単位でブロックする。
 *
 * 新しいラベル文言を作っても「◯◯：」形式で cvr-step-reward に入れないこと。
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BANNED = [
  { pattern: /しつこい営業/, label: "営業ワード（しつこい営業）" },
  { pattern: /営業電話/, label: "営業ワード（営業電話）" },
  { pattern: /このあと：/, label: "返報文ラベル（このあと：）" },
  { pattern: /回答後：/, label: "返報文ラベル（回答後：）" },
  { pattern: /次の画面：/, label: "返報文ラベル（次の画面：）" },
  // ラベル接頭辞は「この文言を消す」ではなく「マイクロコピーにラベルを付けない」がルール。
  // 固定文言だけ並べていたので、新しく発明された「この回答で：」「次に届く求人：」
  // 「診断結果：」「送信後：」が31〜48本のLPで生き残っていた（2026-08-29 発覚）。
  // 以後は**構造で**止める: cvr-step-reward の本文が短いラベル＋「：」で始まっていたら不可。
  { pattern: /class="cvr-step-reward"[^>]*>\s*[^<：\n]{1,14}：/, label: "返報文ラベル（cvr-step-reward が「◯◯：」で始まっている）" },
  // 生成スクリプト側は cvr-step-reward という**構造を持たない**（文字列としてだけ持つ）。
  // 上の構造パターンだけでは生成器の汚染を素通りするので、返報文の**形**でも見る:
  // 「短いラベル＋：」で始まり <strong> を含む文字列リテラル。
  { pattern: /["'`][^"'`<\n]{1,14}：[^"'`\n]{0,80}<strong>/, label: "返報文ラベル（「◯◯：…<strong>」の文字列）" },
];

// docs/ は事例記録のため対象外。HTML と 配信JS に加えて、**LPを生成する側**も対象にする。
// HTMLだけ直しても、生成スクリプトに旧コピーが残っていれば次の再生成で丸ごと戻る
// （2026-08-29: generate-sekoukanri-variants.py に「次に届く求人：」「診断結果：」が残っており、
//  CIの「生成物のドリフトなし」で12本が巻き戻っていた。sync-lp-comparison-copy.mjs は
//  置換**後**の文字列に「次の画面：」等の禁止ラベルを持っていて、走らせると15本に注入していた）。
const files = execSync('git -c core.quotePath=false ls-files -z "*.html" "assets/js/*.js" "WPLP/assets/js/*.js" "自前LP/assets/js/*.js" "dk_lp/**/*.js" "scripts/*.mjs" "scripts/*.py"', {
  cwd: ROOT, encoding: "utf-8",
}).split("\0").filter((f) => f && !f.startsWith("docs/") && f !== "scripts/check-banned-copy.mjs");

let bad = 0;
for (const f of files) {
  const body = fs.readFileSync(path.join(ROOT, f), "utf-8");
  for (const { pattern, label } of BANNED) {
    if (pattern.test(body)) {
      console.error(`✗ ${label}: ${f}`);
      bad++;
    }
  }
}

if (bad) {
  console.error(`\n禁止コピー ${bad} 件。上記を修正するまでデプロイ不可（scripts/check-banned-copy.mjs）。`);
  process.exit(1);
}
console.log(`✓ 禁止コピー/ラベルなし（${files.length} ファイル走査）`);
