#!/usr/bin/env node
/**
 * LPフォームの「消えやすい配線」を静的に守る番人
 *
 * CLAUDE.md の【頻出バグ】は、どれも同じ壊れ方をしている:
 *   - 直したはずの配線が、別の変更のついでに1実装だけ落ちる
 *   - ローカルでは再現しないので、本番のスマホでオーナーが踏む
 * check-kuma-anchor.mjs が CSS（クマの初期位置）を守っているのと同じことを、
 * JS側の配線に対してやる。ここが落ちたら「触ったつもりのない実装が壊れた」と読む。
 *
 * 対象実装（同じ修正を全部に当てる、が CLAUDE.md のルール）:
 *   assets/js/app.js / app-v2.js（＋ WPLP・自前LP・dk_lp のミラー）
 *   dk_lp/denkikouji/assets/js/main.js
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const failures = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** 全ステップ実装（app.js系 / v2 / dk_lp参照実装） */
const IMPLS = [
  "assets/js/app.js",
  "assets/js/app-v2.js",
  "dk_lp/denkikouji/assets/js/main.js"
].filter((p) => existsSync(join(ROOT, p)));

/** ミラーは正本とバイト一致していること（片方だけ直す事故の検出） */
const MIRRORS = [
  ["assets/js/app.js", ["WPLP/assets/js/app.js", "自前LP/assets/js/app.js", "dk_lp/assets/js/app.js"]],
  ["assets/js/app-v2.js", ["WPLP/assets/js/app-v2.js", "自前LP/assets/js/app-v2.js"]],
  // app.js が無条件に注入するので、ミラーに無いと全ページで404を1本取りに行く（2026-08-22 QA）
  ["assets/js/cvr-boost.js", ["WPLP/assets/js/cvr-boost.js", "自前LP/assets/js/cvr-boost.js"]]
];

// ───────────────────────────────────────────────────────────
// 1. スクロール/フォーカス（2026-07-05〜 「ステップ上部が画面外に隠れる」5クラス）
// ───────────────────────────────────────────────────────────
for (const p of IMPLS) {
  const src = read(p);

  // ① 中央寄せ禁止: block:"center" は上部(STEP表示/タイトル)を押し出す
  const centers = src.match(/scrollIntoView\(\s*\{[^}]*block:\s*["']center["'][^}]*\}/g) || [];
  check(`${p}: scrollIntoView に block:"center" を使わない`, centers.length === 0,
    `${centers.length}件: ${centers[0] || ""}`);

  // ④ focus() は preventScroll 付き（ブラウザ主導スクロールを起こさない）
  const focuses = (src.match(/\.focus\(\s*\)/g) || []).length;
  const focusPreventScroll = /\.focus\(\s*\{\s*preventScroll:\s*true\s*\}\s*\)/.test(src);
  check(`${p}: 自動フォーカスは preventScroll 付き`, focusPreventScroll || focuses === 0);

  // ⑤(a) アプリ内ブラウザではステップ到達時に自動フォーカスしない
  check(`${p}: html.dk-inapp では autofocus しない`,
    /dk-inapp/.test(src) && /classList\.contains\("dk-inapp"\)/.test(src));

  // ⑤(c) focusin ナッジ（キーボードで押し上げられた上部を戻す）
  check(`${p}: focusin ナッジがある`, /addEventListener\(\s*["']focusin["']/.test(src));

  // in-app 判定（UA）自体
  check(`${p}: アプリ内ブラウザ検知(UA)がある`, /Instagram|FBAN|Line\\?\//.test(src));
}

// ② ③ ステップ切替時のスクロールは「scroll-behavior を一時的に auto」＋「reflow強制後に scrollTo」
for (const p of ["assets/js/app.js", "assets/js/app-v2.js"]) {
  const src = read(p);
  check(`${p}: 切替スクロールは scrollBehavior="auto" で瞬時`, /scrollBehavior\s*=\s*"auto"/.test(src));
  check(`${p}: scrollTo 前に reflow を強制する`, /void\s+page\.offsetHeight/.test(src));
}

// ───────────────────────────────────────────────────────────
// 2. 「選択/入力しても次へ進めない」（2026-07-10 フォームが死ぬ 4クラス）
// ───────────────────────────────────────────────────────────
for (const p of ["assets/js/app.js", "assets/js/app-v2.js"]) {
  const src = read(p);

  // ① 初期化済み判定は DOM属性でなく WeakSet（DOM差し替えを見抜く）
  check(`${p}: 初期化済み判定が WeakSet`, /new WeakSet\(\)/.test(src));

  // ① 未初期化グループの操作を capture で拾って自己修復する
  const heals = /\[["']click["'],\s*["']change["'],\s*["']input["'],\s*["']focusin["']\]/.test(src);
  check(`${p}: 未初期化グループの操作で自己修復する`, heals);
  check(`${p}: 自己修復を lp_error(form_group_reinit) で計測`, /form_group_reinit/.test(src));

  // ② 遅延ステップの取得失敗を握りつぶさない
  check(`${p}: 遅延ステップ取得失敗を計測する`, /lazy_steps_unavailable/.test(src) || !/lazy-steps-mount/.test(src));
}

// ①/④ ステップ遷移のクリック委譲は document に張る（form差し替えに耐える）
{
  const src = read("assets/js/app.js");
  check("assets/js/app.js: クリック委譲は document", /document\.addEventListener\(\s*"click"/.test(src));
  check("assets/js/app.js: 委譲は DOMContentLoaded で張る（load前クリック対策）",
    /DOMContentLoaded[\s\S]{0,400}bindGlobalDelegation\(\)/.test(src));
}

// ───────────────────────────────────────────────────────────
// 3. クマ（フォロワーアイコン）が「選択したら次のCTAへ移動する」配線
// ───────────────────────────────────────────────────────────
for (const p of IMPLS) {
  const src = read(p);
  const calls = (src.match(/moveIconById\(/g) || []).length;
  check(`${p}: クマ移動(moveIconById)の配線が残っている`, calls >= 6, `${calls}箇所`);
  // 次のCTAを指す呼び出し（"#"+nextBtn.id）が必ず在ること
  check(`${p}: 選択完了時にクマを次のCTAへ移動`, /moveIconById\("#"\s*\+\s*nextBtn\.id/.test(src));
}

// ───────────────────────────────────────────────────────────
// 4. ミラーの同一性
// ───────────────────────────────────────────────────────────
for (const [canonical, mirrors] of MIRRORS) {
  const base = read(canonical);
  for (const m of mirrors) {
    if (!existsSync(join(ROOT, m))) { check(`mirror: ${m} が存在する`, false); continue; }
    check(`mirror: ${m} === ${canonical}`, read(m) === base);
  }
}

// ───────────────────────────────────────────────────────────
// 5. 予約カレンダー（LINE一本化で撤去済み）の先読みを、使わないLPでやらない
// ───────────────────────────────────────────────────────────
{
  const thanks = read("thanks-v2/index.html");
  check("thanks-v2 に予約カレンダーが復活していない", !/thanks-booking|booking-slots\.json/.test(thanks));
  for (const p of IMPLS) {
    const src = read(p);
    if (!/prewarmThanksBookingSlots/.test(src)) continue;
    check(`${p}: 予約枠の先読みは予約を使うLPだけ`, /thanksUsesBooking/.test(src));
  }
}

// ───────────────────────────────────────────────────────────
// 5b. 生まれ年の受付範囲が全実装で同じか
//     app-v2.js だけ 2023 まで通っていて、v2系LPから「3歳の候補者」がZohoへ流れていた
//     （2026-08-22 QA）。範囲は業務ルールなので、変えるならオーナー確認の上で全実装同時に。
// ───────────────────────────────────────────────────────────
{
  const ranges = new Map();
  for (const p of IMPLS) {
    const src = read(p);
    const min = src.match(/BIRTH_YEAR_MIN\s*=\s*(\d{4})/);
    const max = src.match(/BIRTH_YEAR_MAX\s*=\s*(\d{4})/);
    check(`${p}: 生まれ年の範囲が定数で1箇所に定義されている`, !!(min && max));
    if (min && max) ranges.set(p, `${min[1]}-${max[1]}`);
    // 定数を迂回した直書きが残っていないか
    check(`${p}: 生まれ年の範囲を直書きしていない`,
      !/(?:<|>)=?\s*20(?:1[1-9]|2\d)\b/.test(src.replace(/\/\/[^\n]*/g, "")));
  }
  const uniq = new Set(ranges.values());
  check(`生まれ年の範囲が全実装で一致（${[...uniq].join(" / ")}）`, uniq.size <= 1,
    [...ranges].map(([p, r]) => `${p}=${r}`).join(", "));
}

// ───────────────────────────────────────────────────────────
// 5c. ステップ計測(form_step)を二重に送らない
//     cvr-boost.js のクリック計測と app.js の trackStep が両方 push していて、
//     app.js系LPのファネルが二重計上になっていた（2026-08-22 QA）。
// ───────────────────────────────────────────────────────────
{
  const pushers = ["assets/js/app.js", "assets/js/app-v2.js", "assets/js/cvr-boost.js",
                   "dk_lp/denkikouji/assets/js/cvr-boost.js"]
    .filter((p) => existsSync(join(ROOT, p)))
    .filter((p) => /event:\s*"form_step"/.test(read(p)));
  check(`form_step を push する実装が重複していない（${pushers.join(", ") || "なし"}）`,
    !(pushers.includes("assets/js/app.js") && pushers.includes("assets/js/cvr-boost.js")));
}

// ───────────────────────────────────────────────────────────
// 6. アプリ内ブラウザ（LINE/Instagram）の上部バー対策が全LPに入っているか
//    Meta広告の着地はほぼアプリ内ブラウザなので、ここが抜けたLPは
//    入力ステップでSTEP表示がバーの裏に隠れる（オーナー再三報告の症状）。
// ───────────────────────────────────────────────────────────
{
  const skipDirs = new Set([".git", "node_modules", "docs", ".netlify", ".github"]);
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      if (skipDirs.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (name === "index.html") out.push(p);
    }
    return out;
  };
  const missing = [];
  const centerScrolls = [];
  let formPages = 0;
  const htmlFiles = [];
  const walkAll = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skipDirs.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkAll(p);
      else if (name.endsWith(".html")) htmlFiles.push(p);
    }
  };
  walkAll(ROOT);
  for (const p of walk(ROOT)) {
    const html = readFileSync(p, "utf8");
    if (!html.includes('name="your-tel"')) continue;
    formPages++;
    if (!/html\.dk-inapp body\.lp-input-step \.js-page-body\{padding-top:96px!important\}/.test(html)) {
      missing.push(p.slice(ROOT.length));
    }
  }
  check(`全フォームLP(${formPages}本)にアプリ内ブラウザのバー対策(padding-top:96px)がある`,
    missing.length === 0, missing.slice(0, 5).join(", "));

  // ステップの初期非表示をテーマCSS任せにしない（テーマが遅い/届かないと全ステップが縦積みで出る）
  const noHide = [];
  for (const p of walk(ROOT)) {
    const html = readFileSync(p, "utf8");
    if (!html.includes('name="your-tel"')) continue;
    if (!/js-form-group(:not\(#step-first\))?\{display:none\}|js-page-body\{display:none\}/.test(html)) {
      noHide.push(p.slice(ROOT.length));
    }
  }
  check(`全フォームLPがステップの初期非表示を自前のcritical CSSで持っている`,
    noHide.length === 0, noHide.slice(0, 5).join(", "));

  // HTML側（クマのタップ等）にも block:"center" を残さない。中央寄せは上部を押し出す。
  for (const p of htmlFiles) {
    if (/scrollIntoView\(\{[^}]*block:\s*['"]center['"]/.test(readFileSync(p, "utf8"))) {
      centerScrolls.push(p.slice(ROOT.length));
    }
  }
  check(`HTML(${htmlFiles.length}本)に block:"center" のスクロールが無い`,
    centerScrolls.length === 0, centerScrolls.slice(0, 5).join(", "));
}

// ───────────────────────────────────────────────────────────
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
console.log(`\n--- ${checks.length - failures.length}/${checks.length} passed ---`);
if (failures.length) {
  console.error("\n落ちた配線（CLAUDE.md の頻出バグに直結する）:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
