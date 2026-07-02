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
];

// docs/ は事例記録のため対象外。HTML と 配信JS を対象にする。
const files = execSync('git -c core.quotePath=false ls-files -z "*.html" "assets/js/*.js" "WPLP/assets/js/*.js" "自前LP/assets/js/*.js"', {
  cwd: ROOT, encoding: "utf-8",
}).split("\0").filter((f) => f && !f.startsWith("docs/"));

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
