#!/usr/bin/env node
/**
 * theme-lp.css（生成物）と theme-snapshot.css（正本）で LP の描画が同一かを比較する【手動】
 *
 * 目的: theme-lp.css は theme-snapshot.css から「LPで使う規則だけ」を残した生成物
 * （scripts/build-theme-lp-css.mjs）。落とした規則が本当に未使用かは、実ブラウザで
 * 全ステップ・全状態を描いて正本と見比べるのが唯一の確証になる。
 * 主力LPの HTML/JS/CSS を触ったとき・theme-snapshot.css が更新されたときに回す。
 *
 * 比べるもの（LP × 390px/1280px）:
 *   各ステップの初期表示 / アプリ内ブラウザ余白+キーボード表示中(html.dk-inapp.dk-ios, body.lp-kb-open)
 *   / 未入力で次へ（エラー表示）/ 入力後 / 離脱防止モーダル・ライブ通知
 *
 * 判定は **全要素（::before/::after 含む）の computedStyle の一致** で行う。
 *   - CSSの規則が1つでも落ちていれば、どこかの要素のどれかのプロパティが必ず変わる。
 *   - ピクセル比較は判定に使わない。2026-09-04 の実装時に、①ネイティブ select の矢印が
 *     8px だけ違う ②sticky CTA がスクロール位置で動く（エラー表示直後は app.js の
 *     キーボードナッジが最長1.5秒スクロールし続ける）③施工管理 step06 で入力状態が
 *     タイミングでズレる、の3種の**偽差分**が出て、ピクセルでは白黒つけられなかった。
 *   - スクリーンショットは参考として撮り、差分が出た状態だけ --out に両PNGを書く。
 * DOM（要素列・入力値）まで同じであることも一致条件に含める。ここが違うのは
 * 「歩き方のゆらぎ」なので1回だけ撮り直し、それでも違えば FAIL（内容を表示）。
 *
 * 使い方:
 *   npm i --no-save playwright@1.56.1   （Chromium は npx playwright install chromium）
 *   node scripts/visual-diff-theme-lp.mjs --lp /denkikouji/ /sekoukanri/ [--out /tmp/vd]
 *   PLAYWRIGHT_MODULE_PATH / PLAYWRIGHT_CHROMIUM_PATH は e2e-lp-flow-local.mjs と同じ流儀。
 */
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, extname, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const lpArgs = args.includes("--lp") ? args.slice(args.indexOf("--lp") + 1) : [];
const lpEnd = lpArgs.findIndex((a) => a.startsWith("--")); // 次のフラグ（--out 等）の手前まで
const lps = lpArgs.length ? lpArgs.slice(0, lpEnd < 0 ? undefined : lpEnd) : ["/denkikouji/", "/sekoukanri/"];
const OUT = args.includes("--out") ? resolve(args[args.indexOf("--out") + 1]) : join(tmpdir(), "visual-diff-theme-lp");
mkdirSync(OUT, { recursive: true });

async function loadPlaywright() {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  for (const c of [process.env.PLAYWRIGHT_MODULE_PATH, "playwright", "/opt/node22/lib/node_modules/playwright", "/usr/lib/node_modules/playwright"].filter(Boolean)) {
    try { return require(c); } catch { /* 次へ */ }
  }
  throw new Error("playwright が見つからない（npm i --no-save playwright を実行するか PLAYWRIGHT_MODULE_PATH を指定）");
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
function startServer() {
  return new Promise((ok) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = join(ROOT, p);
      if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[extname(f)] || "application/octet-stream" });
      res.end(readFileSync(f));
    });
    srv.listen(0, "127.0.0.1", () => ok({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
// 送信は絶対に通さない（thanks へ遷移するとページが壊れる。app.js の送信は document 委譲なので window capture で先に止める）
const BLOCK_SUBMIT = "window.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();},true);";

/** 全要素の computedStyle（::before/::after 含む）と DOM の並び・入力値を1本の文字列列にする */
function styleSignature() {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "LINK") continue;
    const parts = [el.tagName + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().replace(/\s+/g, ".") : "")];
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") parts.push("value=" + el.value);
    // プロパティ名でソートして並び順の違いを無視する（CSS変数 --lg/--xl は宣言順で列挙順が変わる。値は同じ）
    const dump = (cs) => { const names = []; for (let i = 0; i < cs.length; i++) names.push(cs[i]); names.sort(); let s = ""; for (const p of names) s += p + ":" + cs.getPropertyValue(p) + ";"; return s; };
    parts.push(dump(getComputedStyle(el)));
    for (const ps of ["::before", "::after"]) { const c = getComputedStyle(el, ps); if (c.content && c.content !== "none") parts.push(ps + "{" + dump(c) + "}"); }
    out.push(parts.join("|"));
  }
  return out;
}

async function walk(browser, base, useSnapshot, lp, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 800, hasTouch: viewport.width < 800, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(BLOCK_SUBMIT);
  // 送信は絶対にしない: 送信ボタン(#step-last-button)は click の 1.1 秒後、携帯番号は 11 桁そろうと
  // 自動で location.href = thanks へ遷移する（app.js）。最終ステップでは「次へ」を押さず、番号も途中で止める。
  await page.route(/googletagmanager|ipify|builders-job\.com|heartrails|zipcloud/, (r) => r.abort());
  // 万一 thanks へ遷移しても 204 を返して今のページに留まる（abort だとエラーページへ遷移して壊れる）
  await page.route(/\/thanks/, (r) => r.fulfill({ status: 204 }));
  if (useSnapshot) {
    // 正本側: theme-lp.css の要求に theme-snapshot.css の中身を返す
    await page.route(/theme-lp\.css/, (r) => r.continue({ url: r.request().url().replace(/theme-lp\.css(\?[^ ]*)?$/, "theme-snapshot.css") }));
  }
  await page.goto(base + lp, { waitUntil: "load" });
  await page.addStyleTag({ content: FREEZE });
  await page.waitForTimeout(600);
  const sigs = {}, shots = {};
  const snap = async (name) => {
    sigs[name] = await page.evaluate(styleSignature);
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    shots[name] = await page.screenshot({ fullPage: true });
  };
  const cur = () => page.evaluate(() => { const g = [...document.querySelectorAll(".js-form-group")].find((g) => getComputedStyle(g).display !== "none"); return g && g.id; });
  const states = async (step) => {
    await snap(step);
    await page.evaluate(() => { document.documentElement.classList.add("dk-inapp", "dk-ios"); document.body.classList.add("lp-kb-open"); });
    await snap(step + ":inapp+kb");
    await page.evaluate(() => { document.documentElement.classList.remove("dk-inapp", "dk-ios"); document.body.classList.remove("lp-kb-open"); });
    const err = await page.evaluate(() => {
      const g = [...document.querySelectorAll(".js-form-group")].find((g) => getComputedStyle(g).display !== "none");
      const b = g && [...g.querySelectorAll(".js-next-button,.js-submit-button,.c-submit-button")].find((b) => !/戻る/.test(b.textContent));
      if (!b) return false; b.click(); return true;
    });
    // エラー表示後は app.js のキーボードナッジ（最長1500ms）が収まってから
    if (err) { await page.waitForTimeout(1700); if ((await cur()) === step) await snap(step + ":error"); }
  };
  let step = await cur();
  const seen = new Set();
  for (let i = 0; i < 12 && step && !seen.has(step); i++) {
    seen.add(step);
    await states(step);
    if ((await cur()) !== step) { step = await cur(); seen.add(step); await states(step); }
    const did = await page.evaluate(() => {
      const g = [...document.querySelectorAll(".js-form-group")].find((g) => getComputedStyle(g).display !== "none");
      const opts = [...g.querySelectorAll(".js-radio-button,.js-checkbox-button,.js-radio-button02")];
      const did = [];
      if (opts.length) { opts[0].click(); if (g.querySelector(".js-checkbox-button") && opts[1]) opts[1].click(); did.push("choice"); }
      const set = (el, v) => { if (!el) return false; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; };
      const sel = g.querySelector("select");
      if (sel && sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event("change", { bubbles: true })); did.push("select"); }
      set(g.querySelector("#last-name"), "山田"); set(g.querySelector("#first-name"), "太郎"); set(g.querySelector("#bday-year"), "1990");
      // 携帯番号は 11 桁そろうと app.js が約1.1秒後に自動送信して thanks へ遷移する。
      // 「入力後」の描画が見たいだけなので、桁が足りない途中状態で止める。
      set(g.querySelector('input[type="tel"]:not([name="your-zip"])'), "0901234");
      return did;
    });
    await page.waitForTimeout(did.includes("choice") ? 3200 : 700); // 施工管理step01は最後のタップから2800msで自動遷移
    await snap(step + ":filled");
    if (step === "step06" || step === "step-last") break; // 送信はしない
    if ((await cur()) === step) {
      const c = await page.evaluate(() => {
        const g = [...document.querySelectorAll(".js-form-group")].find((g) => getComputedStyle(g).display !== "none");
        const b = [...g.querySelectorAll(".js-next-button,.js-step-button[data-page-to]")].find((b) => !/戻る/.test(b.textContent));
        if (b) { b.click(); return true; } return false;
      });
      if (!c) break;
      await page.waitForTimeout(700);
    }
    step = await cur();
    if (step === "step06" && seen.has("step06")) break;
  }
  if (step && !seen.has(step)) await states(step);
  // cvr-boost.js の離脱防止モーダル・ライブ通知
  await page.evaluate(() => { const n = document.getElementById("live-notification"); if (n) n.classList.add("is-visible"); document.dispatchEvent(new Event("mouseleave")); });
  await page.waitForTimeout(300);
  await snap("extras");
  await ctx.close();
  return { sigs, shots };
}

/** 署名列の最初の違いを人が読める形で返す（null なら一致） */
function firstDiff(a, b) {
  if (!b) return "生成側に同じ状態が無い";
  if (a.length !== b.length) return `要素数が違う ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const [ea, ...ra] = a[i].split("|"), [eb, ...rb] = b[i].split("|");
    if (ea !== eb) return `要素が違う: ${ea} vs ${eb}`;
    const pa = ra.join("|").split(";"), pb = rb.join("|").split(";");
    const bad = [];
    for (let j = 0; j < Math.max(pa.length, pb.length) && bad.length < 4; j++) if (pa[j] !== pb[j]) bad.push(`${pa[j]} → ${pb[j]}`);
    return `${ea}: ${bad.join(" / ")}`;
  }
  return null;
}

const { chromium } = await loadPlaywright();
const { srv, base } = await startServer();
const launch = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launch.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launch);
let fails = 0, total = 0, retried = 0;
try {
  for (const lp of lps) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      let A = await walk(browser, base, true, lp, vp);
      let B = await walk(browser, base, false, lp, vp);
      const diffs = () => Object.fromEntries(Object.keys(A.sigs).map((k) => [k, firstDiff(A.sigs[k], B.sigs[k])]));
      let d = diffs();
      if (Object.values(d).some(Boolean)) { // 歩き方のゆらぎ（入力状態のズレ等）を除くため1回だけ撮り直す
        retried++;
        A = await walk(browser, base, true, lp, vp); B = await walk(browser, base, false, lp, vp);
        d = diffs();
      }
      for (const k of Object.keys(A.sigs)) {
        total++;
        const ok = !d[k];
        const px = B.shots[k] && A.shots[k].equals(B.shots[k]) ? "" : "（スクショに差あり）";
        if (!ok || px) {
          const tag = `${lp.replace(/\//g, "")}-${vp.width}-${k.replace(/[:+]/g, "_")}`;
          writeFileSync(join(OUT, `${tag}-snapshot.png`), A.shots[k]);
          if (B.shots[k]) writeFileSync(join(OUT, `${tag}-lp.png`), B.shots[k]);
        }
        if (!ok) fails++;
        console.log(`${ok ? "OK  " : "DIFF"} ${lp} ${vp.width}px ${k}${px}${ok ? "" : "\n      " + d[k]}`);
      }
    }
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(`\n--- computedStyle 一致 ${total - fails}/${total}（再試行 ${retried} 回）${fails ? ` 差分PNG: ${OUT}` : ""} ---`);
process.exit(fails ? 1 : 0);
