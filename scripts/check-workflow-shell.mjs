#!/usr/bin/env node
/**
 * GitHub Actions の run: ブロックをシェルとして構文検査する。
 *
 * なぜ要るか（2026-08-31）:
 *   snapshot-theme-css.yml の「Create PR if changed」が、行継続のつもりで `\\` と
 *   書いていた。YAML の block scalar は中身をそのまま渡すので、bash から見ると
 *   これは「エスケープされたバックスラッシュ」であって行継続ではない。結果、
 *     gh pr create ... --body "..." \\
 *       || echo "PR already exists"
 *   の `||` 行が独立したコマンドの先頭になり構文エラー。しかも bash はそこまでを
 *   実行してから落ちるので、**ブランチのpushとPR作成は起きたうえでワークフローが赤**
 *   という一番わかりにくい壊れ方をしていた。`|| echo` のフォールバックも効かないので、
 *   2回目以降は `gh pr create` の失敗で必ず落ちる。
 *   このワークフローは「WPテーマCSSの変更を全LPへ反映する唯一の経路」（CLAUDE.md）で、
 *   常時赤いワークフローは読まれなくなる。
 *
 *   yaml として妥当なので YAML の検証では捕まらない。同種の事故は同じ日にもう一度
 *   起きかけている（deploy.yml の rsync で、行継続の途中にコメントを置いて
 *   除外指定と転送元・転送先ごと消える書き方）。だからシェルとして見る。
 *
 * 注意: `${{ }}` は bash から見ると構文エラーになりうるので、検査前に
 *       プレースホルダへ置き換える（式の中身までは検証しない）。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WF_DIR = path.join(ROOT, ".github/workflows");

/** `run:` の block scalar を取り出す。YAMLパーサに依存しない（CIに追加の依存を持ち込まない）。 */
function extractRunBlocks(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)run:\s*(\|-?\+?|>-?\+?)?\s*$/);
    if (!m) {
      const inline = lines[i].match(/^\s*run:\s+(\S.*)$/);
      if (inline) out.push({ line: i + 1, body: inline[1] });
      continue;
    }
    const indent = m[1].length;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === "") { body.push(""); continue; }
      const ind = l.length - l.trimStart().length;
      if (ind <= indent) break;
      body.push(l);
    }
    // 最小インデントで揃える（block scalar のデデント）
    const widths = body.filter((l) => l.trim() !== "").map((l) => l.length - l.trimStart().length);
    const base = widths.length ? Math.min(...widths) : 0;
    out.push({ line: i + 1, body: body.map((l) => l.slice(base)).join("\n") });
    i = j - 1;
  }
  return out;
}

/** ${{ ... }} を bash が読める識別子に潰す。入れ子を素朴に処理する。 */
function stripExpressions(src) {
  let s = src;
  for (;;) {
    const a = s.indexOf("${{");
    if (a < 0) return s;
    const b = s.indexOf("}}", a);
    if (b < 0) return s.slice(0, a) + "GHA_EXPR";
    s = s.slice(0, a) + "GHA_EXPR" + s.slice(b + 2);
  }
}

const dir = mkdtempSync(path.join(tmpdir(), "wf-lint-"));
let checked = 0;
const bad = [];

for (const f of readdirSync(WF_DIR).filter((n) => /\.ya?ml$/.test(n)).sort()) {
  const text = readFileSync(path.join(WF_DIR, f), "utf8");
  for (const blk of extractRunBlocks(text)) {
    checked++;
    const tmp = path.join(dir, `b${checked}.sh`);
    writeFileSync(tmp, stripExpressions(blk.body), "utf8");
    try {
      execFileSync("bash", ["-n", tmp], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      bad.push(`${f}:${blk.line}\n    ${String(e.stderr || e).trim().split("\n").join("\n    ")}`);
    }
  }
}

// クォートしていないスカラーに ": " が入っていると YAML として壊れる。
// この番人を書いた当日に、ステップ名を `name: ワークフローの run: をシェルとして…`
// と書いて実際に壊した。上の run: 検査は正規表現ベースで YAML の妥当性は見ないので、
// 「シェルは全部OK」と言いながら壊れたYAMLを通してしまう。ここで塞ぐ。
for (const f of readdirSync(WF_DIR).filter((n) => /\.ya?ml$/.test(n)).sort()) {
  const lines = readFileSync(path.join(WF_DIR, f), "utf8").split("\n");
  lines.forEach((l, i) => {
    const m = l.match(/^\s*-?\s*(name|description):\s+(.+?)\s*$/);
    if (!m) return;
    const v = m[2];
    if (/^["']/.test(v)) return;               // クォート済みなら安全
    if (/:\s/.test(v)) bad.push(`${f}:${i + 1}\n    クォートされていない ${m[1]}: に ": " が入っている → YAMLが壊れる\n    ${l.trim()}`);
  });
}

if (bad.length) {
  console.error(`✗ ワークフローの不備が ${bad.length} 件:`);
  for (const b of bad) console.error("  - " + b);
  console.error("  行継続は `\\` ひとつ。`\\\\` はエスケープされたバックスラッシュで継続にならない");
  process.exit(1);
}
console.log(`✓ ワークフローOK（run: ${checked}ブロックのシェル構文＋name: のクォート）`);
