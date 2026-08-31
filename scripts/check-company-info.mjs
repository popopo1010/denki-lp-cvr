#!/usr/bin/env node
/**
 * 会社情報が全ページで一致していることを見張る。
 *
 * なぜ要るか（2026-08-31 の事故）:
 *   プライバシーポリシー3本に、テンプレート流用元である別会社（and-and.jp）の
 *   値が残っていた。問い合わせ先 info@and-and.jp、所在地・代表者も別会社のもの。
 *   法定表示なので、誤ったまま公開されていた期間がある。
 *   同じ情報がいま8ページ（privacypolicy 3本 + service 5本）に直書きされており、
 *   次に会社情報が変わったとき、8箇所を揃える保証がどこにも無い。
 *
 * 何を見るか:
 *   会社情報を載せているページを内容から自動で見つけ（「許可番号」の行を持つページ）、
 *   会社名・代表者・所在地・許可番号・メールが**正**と一致するかを確認する。
 *   ページを増やしても列挙を書き換える必要はない。
 *
 * 正の値を変えるときは、ここと各ページの両方を直すことになる。
 * それが面倒に見えるが、片方だけ直して気づかない方がはるかに高くつく。
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** オーナー確認済み（2026-08-31）。ここが唯一の正。 */
const TRUTH = {
  会社名: "XCHANGE株式会社",
  代表者: "柴山 友貴",
  所在地: "〒104-0061 東京都中央区銀座1丁目22番11号 銀座大竹ビジデンス2階",
  許可番号: "13-ユ-316946",
  メール: "info@xchange-inc.com",
};

/** 別会社のテンプレート由来の値。1つでも残っていたら落とす。 */
const FORBIDDEN = [
  "and-and.jp",
  "池尾 優斗",
  "渋谷スクランブルスクエア",
  "builders-job.com/company",
];

let pass = 0;
const fails = [];
const ok = (m) => { pass++; console.log("✓ " + m); };
const ng = (m, d) => { fails.push(m + (d ? " — " + d : "")); console.log("✗ " + m + (d ? " — " + d : "")); };

const files = globSync("**/*.html", { cwd: ROOT })
  .filter((f) => !f.startsWith(".git/") && !f.startsWith("docs/") && !f.startsWith("dk_lp/docs/"))
  .map((f) => path.join(ROOT, f));

const infoPages = [];
for (const f of files) {
  const html = readFileSync(f, "utf8");
  // 会社情報の表を持つページ = 「許可番号」と「会社名」の行が両方あるページ
  if (/<th>許可番号<\/th>/.test(html) && /<th>会社名<\/th>/.test(html)) infoPages.push([f, html]);
}

if (infoPages.length === 0) {
  ng("会社情報のページが1つも見つからない", "検出条件が古くなっている可能性");
} else {
  ok(`会社情報を載せているページ ${infoPages.length} 本を検出`);
}

for (const [f, html] of infoPages) {
  const rel = path.relative(ROOT, f);
  const rows = {};
  for (const m of html.matchAll(/<tr><th>([^<]+)<\/th><td>([^<]*)<\/td><\/tr>/g)) {
    rows[m[1]] = m[2];
  }
  for (const [key, want] of Object.entries(TRUTH)) {
    const got = rows[key];
    if (got === undefined) continue;            // その項目を出していないページは対象外
    if (got.includes(want)) ok(`${rel}: ${key} が正しい`);
    else ng(`${rel}: ${key} が正と違う`, `期待「${want}」実際「${got}」`);
  }
}

// 別会社の値が全ページ（会社情報ページに限らず）に残っていないこと
for (const bad of FORBIDDEN) {
  const hit = files.filter((f) => readFileSync(f, "utf8").includes(bad))
    .map((f) => path.relative(ROOT, f));
  if (hit.length === 0) ok(`別会社/旧値「${bad}」の残存なし`);
  else ng(`別会社/旧値「${bad}」が残っている`, hit.slice(0, 4).join(", "));
}

console.log(`\n--- ${pass}/${pass + fails.length} passed ---`);
if (fails.length) process.exit(1);
