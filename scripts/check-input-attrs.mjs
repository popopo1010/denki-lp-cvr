#!/usr/bin/env node
/**
 * 入力欄の属性が全LPで揃っていることを守る
 *
 * スマホのフォーム完了率は「キーボードが数字で開くか」「自動入力が効くか」で素直に動く。
 * このリポジトリはLPが60本以上あり、実際に本番LPだけ属性が付いていて
 * meta-lp / nenshu-shindan / WPLP / 自前LP では欠けている、という差分が溜まっていた
 * （2026-08-22 QA で 25〜54ファイル分を検出・修正）。差分は必ずまた生えるので固定する。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set([".git", "node_modules", "docs", ".netlify", ".github"]);

/** name → 必須属性。理由をコメントに残す（消される時に判断できるように） */
const CONTRACT = {
  "your-zip": {
    label: "郵便番号",
    required: ['type="tel"', 'inputmode="numeric"', 'pattern="[0-9]*"', 'autocomplete="postal-code"']
  },
  "your-tel": {
    label: "携帯番号",
    required: ['type="tel"', 'inputmode="numeric"', 'pattern="[0-9]*"', 'autocomplete="tel-national"', 'minlength="11"', 'maxlength="11"']
  },
  "your-last-name": { label: "姓", required: ['autocomplete="family-name"'] },
  "your-first-name": { label: "名", required: ['autocomplete="given-name"'] },
  "your-birthday-year": { label: "生年", required: ['inputmode="numeric"', 'autocomplete="bday-year"'] }
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const problems = [];
let inputs = 0;
const files = walk(ROOT);

for (const file of files) {
  const html = readFileSync(file, "utf8");
  for (const [name, spec] of Object.entries(CONTRACT)) {
    const re = new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`, "g");
    for (const m of html.matchAll(re)) {
      const tag = m[0];
      if (tag.includes('type="hidden"')) continue;
      inputs++;
      const missing = spec.required.filter((a) => !tag.includes(a));
      if (missing.length) {
        problems.push(`${relative(ROOT, file)} … ${spec.label}(${name}) に ${missing.join(" ")} が無い`);
      }
    }
  }
}

if (problems.length) {
  console.error("✗ 入力欄の属性がLP間で揃っていない（スマホのキーボード/自動入力に直結）:");
  problems.slice(0, 40).forEach((p) => console.error("  - " + p));
  if (problems.length > 40) console.error(`  … 他 ${problems.length - 40} 件`);
  process.exit(1);
}
console.log(`✓ 入力欄の属性OK（${inputs} 入力欄 / ${files.length} HTML走査）`);
