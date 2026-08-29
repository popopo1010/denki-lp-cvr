#!/usr/bin/env node
/**
 * スマホUI/UX 実測監査（全機種幅 × 主要LP）
 *
 * 「スマホ最適化されているか」を、感覚ではなく**実測値**で判定する。
 * 見るのは、実機で事故になる4点にしぼる:
 *   ① 横スクロール … 画面幅を超える要素があると、指が横に滑って離脱する
 *   ② タップ領域   … CTA/選択肢が小さいと押し間違える（WCAG 2.5.8 は24px、
 *                     Apple HIG/Material は44〜48px。ここは実運用に合わせ44pxを閾値）
 *   ③ 文字サイズ   … 本文16px未満はiOSでフォーカス時に自動ズームが起き、
 *                     戻れなくなって離脱する（入力欄は特に厳格）
 *   ④ ファーストビュー … CTAが折り返し(=画面下端)より下だと、
 *                     スクロールしない層をまるごと落とす
 *
 * 使い方: node scripts/audit-mobile-ux.mjs [--lp /denkikouji/ ...]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const THEME_SNAPSHOT = join(ROOT, "assets/css/theme-snapshot.css");

/** 実機シェアを踏まえた代表機種。小さい順（横スクロールは狭い端末で出る） */
let DEVICES = [
  { name: "iPhone SE(第2/3世代)", width: 375, height: 667, dpr: 2 },
  { name: "iPhone 12/13 mini",   width: 360, height: 780, dpr: 3 },
  { name: "Android 小型(Galaxy A)", width: 360, height: 800, dpr: 3 },
  { name: "iPhone 13/14/15",     width: 390, height: 844, dpr: 3 },
  { name: "iPhone 14/15 Pro Max", width: 430, height: 932, dpr: 3 },
  { name: "Android 大型(Pixel 7)", width: 412, height: 915, dpr: 2.6 }
];

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

let BASE = "";
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = join(ROOT, p);
      const st = await stat(file).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404).end("nf"); return; }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      res.end(await readFile(file));
    } catch { res.writeHead(500).end("err"); }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => {
    BASE = `http://127.0.0.1:${server.address().port}`; r(server);
  }));
}

async function advanceOnce(page) {
    const acted = await page.evaluate(() => {
    const vis = [...document.querySelectorAll(".js-form-group")].filter((e) => getComputedStyle(e).display !== "none");
    const cur = vis[vis.length - 1];
    if (!cur) return "no-step";
    const click = (el) => { if (!el) return false; el.click(); return true; };

    // 1) 選択式は「グループごとに1つだけ」選ぶ。
    //    複数選択(施工管理step01の資格チェック)で全部タップし続けると、
    //    自動遷移待ちの2.8秒を選択肢の数だけ繰り返して手数を使い切る。
    const SEL = ".js-radio-button, .js-radio-button02, .js-checkbox-button";
    const groups = [...new Set([...cur.querySelectorAll(SEL)].map((b) => b.dataset.group || ""))];
    for (const g of groups) {
      const q = g ? `${SEL.split(", ").map((s) => `${s}[data-group="${g}"]`).join(", ")}` : SEL;
      const opts = [...cur.querySelectorAll(q)];
      if (!opts.length || opts.some((b) => b.classList.contains("is-active"))) continue;
      click(opts[0]);
      return "choice:" + (opts[0].dataset.value || g);
    }

    // 2) 入力欄を埋める（住所APIはローカルで叩けないので select を直接指定する）
    const setVal = (el, v) => {
      if (!el || el.value) return false;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    let filled = false;
    const pref = cur.querySelector("#pref");
    if (pref && !pref.value && pref.options.length > 1) {
      pref.selectedIndex = 1;
      pref.dispatchEvent(new Event("change", { bubbles: true }));
      filled = true;
    }
    const city = cur.querySelector("#city");
    if (city && !city.value) {
      // 市区町村は都道府県選択後に外部API(heartrails)で埋まる。ローカルからは叩けないので
      // 「APIが返ってきた状態」を手で作る（見たいのは住所APIではなくフォームの進行）。
      if (city.options.length <= 1) city.add(new Option("テスト市", "テスト市"));
      city.value = city.options[city.options.length - 1].value;
      city.dispatchEvent(new Event("change", { bubbles: true }));
      filled = true;
    }
    filled = setVal(cur.querySelector("#last-name"), "山田") || filled;
    filled = setVal(cur.querySelector("#first-name"), "太郎") || filled;
    filled = setVal(cur.querySelector("#bday-year"), "1990") || filled;
    filled = setVal(cur.querySelector('input[type="tel"]:not([name="your-zip"])'), "09012345678") || filled;
    if (filled) {
      // 実装によって検証タイミングが input / blur と分かれる（dk_lp参照実装は blur）。
      // 実ユーザーは次のCTAをタップした時点で必ず blur するので、それに合わせる。
      cur.querySelectorAll("input").forEach((el) => { try { el.blur(); } catch (e) {} });
      return "filled";
    }

    // 3) 次へ（「戻る」も .js-step-button なので、必ず前進するボタンだけを押す）
    const ORDER = ["step-first", "step01", "step02", "step03", "step03b", "step04", "step05", "step06", "step-last"];
    const rank = (id) => { const i = ORDER.indexOf(id); return i < 0 ? 99 : i; };
    // 送信CTAは絶対に押さない（押すとGASへ本物の送信が飛ぶ）。押せる状態かは別途調べる。
    const isSubmit = (b) =>
      b.id === "step-last-button" || b.id === "submit-button" || b.classList.contains("c-submit-button");
    const forward = [...cur.querySelectorAll(".js-next-button, .js-step-button[data-page-to]")]
      .filter((b) => !b.classList.contains("is-disable") && getComputedStyle(b).display !== "none")
      .filter((b) => !isSubmit(b))
      .filter((b) => !b.dataset.pageTo || rank(b.dataset.pageTo) > rank(cur.id));
    if (forward.length) { click(forward[0]); return "next"; }
    return "stuck";
  });
  await page.waitForTimeout(acted === "choice" ? 900 : 700);
  // 施工管理step01は最後のタップから2800ms後に自動遷移する
  if (acted.startsWith("choice")) await page.waitForTimeout(2400);
  return acted;
}

const findings = [];
function note(lp, device, kind, detail) { findings.push({ lp, device, kind, detail }); }

/** ページ内をすべて実測する。返すのは「事故になる要素」だけ */
const measure = () => {
  // 画面幅は innerWidth ではなく clientWidth で見る。
  // Chromium のモバイルエミュレーションは、読み込み中に一瞬でも内容が画面幅を超えると
  // ICB(初期包含ブロック)を広げ、内容が収まっても**元に戻さない**。その状態では
  // innerWidth も documentElement.scrollWidth も広がったままになり、
  // 実際には1pxも横に動かないページを「横スクロールあり」と誤検知する
  // （2026-08-29: /自前LP/denkikouji/ が全機種・全ステップで誤検知していた）。
  const vw = document.documentElement.clientWidth;
  // 「本当に横に動くか」を実測する。これがユーザーの体験そのもの。
  const sx0 = window.scrollX;
  window.scrollTo(vw * 3, window.scrollY);
  const scrollableX = Math.round(window.scrollX - sx0);
  window.scrollTo(sx0, window.scrollY);
  const out = { overflow: [], smallTap: [], smallFont: [], scrollableX, docWidth: vw + scrollableX };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => {
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const txt = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 18);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ""}`;
  };

  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);

    // ① 画面幅を超えてはみ出す要素（position:fixed の装飾は除く）
    if (s.position !== "fixed" && (r.right > vw + 1 || r.left < -1)) {
      // 親がoverflow管理していれば事故にならない
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === "hidden" || ov === "auto" || ov === "scroll") { clipped = true; break; }
      }
      if (!clipped) out.overflow.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right) });
    }

    // ② タップ領域（実際に押すもの）
    const tappable = el.matches('a[href], button, input[type="button"], input[type="submit"], select, [role="button"], .js-step-button, .js-next-button, .js-radio-button, .js-checkbox-button');
    // step06 の同意文リンク（プライバシーポリシー・利用規約）だけは **意図的に 24px** で止める。
    // 送信CTAの真横にあるため、44pxまで広げると誤タップでLPから離脱する事故が増えCVRを下げる。
    // ここを 44px 基準のまま報告し続けると、直す気のない指摘が毎回並んで本物が埋もれる。
    const consent = el.closest(".cvr-pp-text") !== null;
    const min = consent ? 24 : 44;
    if (tappable && (r.height < min || r.width < min)) {
      out.smallTap.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height), min });
    }

    // ③ 入力欄の文字サイズ（16px未満はiOSで自動ズーム）。
    //    自動ズームが起きるのは**文字を打つ欄**だけ。ボタン化した input（送信CTAに重ねた
    //    input[type=button] は文字を隠すため font-size:0）を混ぜると、直しようのない
    //    指摘が毎回出て本物の指摘が埋もれる。
    if (el.matches('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]), select, textarea')) {
      const fs = parseFloat(s.fontSize);
      if (fs < 16) out.smallFont.push({ el: label(el), fontSize: fs });
    }
  }
  // 重複をまとめる
  const uniq = (arr, key) => { const m = new Map(); for (const o of arr) if (!m.has(o[key])) m.set(o[key], o); return [...m.values()]; };
  out.overflow = uniq(out.overflow, "el").slice(0, 6);
  out.smallTap = uniq(out.smallTap, "el").slice(0, 6);
  out.smallFont = uniq(out.smallFont, "el").slice(0, 6);
  return out;
};

/** ファーストビュー内にCTAがあるか */
const measureFV = () => {
  const vh = window.innerHeight;
  const first = document.getElementById("step-first");
  if (!first) return { skip: "FVなし" };
  const ctas = [...first.querySelectorAll("button.p-firstButton, .js-step-button, .js-radio-button, a.p-firstButton")]
    .filter((e) => e.offsetParent !== null);
  if (!ctas.length) return { skip: "FVにCTAなし" };
  const top = Math.min(...ctas.map((c) => c.getBoundingClientRect().top));
  return { ctaTop: Math.round(top), vh: Math.round(vh), inView: top < vh };
};

async function run(browser, lp) {
  for (const d of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, locale: "ja-JP",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    });
    const page = await ctx.newPage();
    await page.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE)) return route.continue();
      if (/themes\/[^/]+\/assets\/css\/style\.css/.test(u)) return route.fulfill({ path: THEME_SNAPSHOT, contentType: "text/css" });
      return route.abort();
    });
    await page.goto(BASE + lp, { waitUntil: "load" });
    await page.waitForTimeout(500);

    const fv = await page.evaluate(measureFV);
    if (!fv.skip && !fv.inView) note(lp, d.name, "FV", `CTAが画面外（CTA上端 ${fv.ctaTop}px > 画面高 ${fv.vh}px）`);

    const record = (m, where) => {
      if (m.scrollableX > 1) note(lp, d.name, "横スクロール", `${where}: 指で横に ${m.scrollableX}px 動いてしまう（画面幅 ${d.width}px）`);
      for (const o of m.overflow) note(lp, d.name, "はみ出し", `${where}: ${o.el} (right=${o.right} > ${d.width})`);
      for (const t of m.smallTap) note(lp, d.name, "タップ領域", `${where}: ${t.el} が ${t.w}×${t.h}px（${t.min}px未満）`);
      for (const f of m.smallFont) note(lp, d.name, "文字サイズ", `${where}: ${f.el} が ${f.fontSize}px（16px未満＝iOSで自動ズーム）`);
    };
    record(await page.evaluate(measure), "FV");

    // 各ステップの中も測る。CVRが起きるのはここなので、FVだけ見ても意味がない。
    // 遷移は e2e-lp-flow-local.mjs で実績のあるロジックをそのまま使う（自前実装だと
    // 複数選択ステップや住所APIで止まり、ステップ内を一度も測れない）。
    let last = "";
    for (let i = 0; i < 24; i++) {
      const acted = await advanceOnce(page);
      if (acted === "stuck" || acted === "no-step") break;
      await page.waitForTimeout(320);
      const cur = await page.evaluate(() => {
        const v = [...document.querySelectorAll(".js-form-group")].filter((e) => getComputedStyle(e).display !== "none");
        return v.length ? v[v.length - 1].id : "";
      });
      if (cur && cur !== "step-first" && cur !== last) {
        record(await page.evaluate(measure), cur);
        if (process.env.AUDIT_DEBUG) console.log(`   [${d.name}] 測定: ${cur}`);
        last = cur;
      }
      if (cur === "step06" || cur === "step-last") break;
    }

    await ctx.close();
  }
}

const args = process.argv.slice(2);
const lpIdx = args.indexOf("--lp");
const LPS = lpIdx >= 0
  ? args.slice(lpIdx + 1).filter((a) => !a.startsWith("--"))
  : ["/denkikouji/", "/sekoukanri/", "/denkikouji-v2/", "/sekoukanri-v2/"];
// 横スクロール・はみ出しは**一番狭い端末**で出る。全機種を回すと1LPあたり数分かかるので、
// 変更の確認だけしたいときは --narrow で狭い2機種（375 / 360）に絞る。
if (args.includes("--narrow")) DEVICES = DEVICES.slice(0, 2);

const pw = await import("playwright").catch(() => import("/opt/node22/lib/node_modules/playwright/index.mjs"));
const server = await startServer();
const browser = await pw.chromium.launch({ headless: true });
for (const lp of LPS) await run(browser, lp);
await browser.close();
server.close();

if (!findings.length) {
  console.log(`✓ スマホUI/UX 問題なし（${LPS.length}LP × ${DEVICES.length}機種）`);
  process.exit(0);
}
const byKind = {};
for (const f of findings) (byKind[f.kind] ||= []).push(f);
console.log(`スマホUI/UX 監査: ${LPS.length}LP × ${DEVICES.length}機種 → 指摘 ${findings.length}件\n`);
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`■ ${kind}（${list.length}件）`);
  const seen = new Set();
  for (const f of list) {
    const key = f.kind + f.detail;
    if (seen.has(key)) continue;
    seen.add(key);
    const devices = [...new Set(list.filter((x) => x.detail === f.detail).map((x) => x.device))];
    const lps = [...new Set(list.filter((x) => x.detail === f.detail).map((x) => x.lp))];
    console.log(`  ・${f.detail}`);
    console.log(`      LP: ${lps.join(", ")} / 機種: ${devices.length === DEVICES.length ? "全機種" : devices.join(", ")}`);
  }
  console.log("");
}
