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
const DEVICES = [
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

async function runLp(browser, devices, lp) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ja-JP" });
  const page = await ctx.newPage();
  const pageErrors = [];
  const localMisses = [];
  const bookingReqs = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message)));
  page.on("response", (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) localMisses.push(r.url()); });
  page.on("request", (r) => { if (/booking-slots\.json|thanks-booking-bootstrap/.test(r.url())) bookingReqs.push(r.url()); });
  const mirrorHits = { zapier: 0, gas: 0 };
  await blockExternal(page, mirrorHits);
  await page.goto(BASE + lp, { waitUntil: "load" });
  await page.waitForTimeout(600);

  // 1) FVが見えている
  const fv = await page.evaluate(probe);
  if (fv.step === "step-first" && fv.opacity === "1") pass(`${lp} FV表示`);
  else fail(`${lp} FV表示`, JSON.stringify(fv));

  // 2〜4) 最後まで進む。各遷移で上部見出しとクマを見る
  const seen = [];
  let headHidden = null;
  let kumaLost = null;
  for (let i = 0; i < 22; i++) {
    const { acted, before, after } = await advanceOnce(page);
    if (acted === "stuck" || acted === "no-step") break;
    if (after.step && after.step !== seen[seen.length - 1]) seen.push(after.step);
    // 見るのは「ステップに到達した瞬間」に上部が見えているか。
    // 入力が全部埋まった後にCTAへスクロールして上部が出るのは、クマをCTAへ誘導する
    // 仕様どおりの動き（CLAUDE.md はこのスクロールを block:"nearest" で行うと定めている）。
    // 到達時と混同すると、正しい挙動を不具合として報告してしまう（2026-08-23 に実測して切り分け）。
    const arrived = after.step && after.step !== before.step;
    if (arrived && after.headTop !== null && after.headTop < 0 && headHidden === null) {
      headHidden = `${after.step} 到達時 headTop=${after.headTop}`;
    }
    // 選択した直後は、クマが現在ステップ内（＝次のCTA側）に居るべき
    if (acted.startsWith("choice") && after.kumaStepId !== after.step && after.kumaStepId !== "none" && kumaLost === null) {
      kumaLost = `${after.step}: クマが ${after.kumaStepId} に取り残された`;
    }
    if (after.step === "step06" || after.step === "step-last") break;
  }
  seen.length ? pass(`${lp} ステップ遷移`, seen.join(" → ")) : fail(`${lp} ステップ遷移`, "1歩も進まない");
  headHidden ? fail(`${lp} ステップ到達時に上部見出しが見える`, headHidden) : pass(`${lp} ステップ到達時に上部見出しが見える`);
  kumaLost ? fail(`${lp} クマが次のCTAへ移動`, kumaLost) : pass(`${lp} クマが次のCTAへ移動`);

  const reached = await page.evaluate(probe);
  if (reached.step === "step06" || reached.step === "step-last") pass(`${lp} 最終ステップ到達`, reached.step);
  else fail(`${lp} 最終ステップ到達`, `止まった位置: ${reached.step || "不明"}`);

  // 最終ステップの残り（電話番号）を入れてから、送信CTAが押せる状態かを見る。
  // 送信そのものはGASを叩くので行わない。
  await advanceOnce(page);
  await page.waitForTimeout(400);
  const submit = await page.evaluate(() => {
    const vis = [...document.querySelectorAll(".js-form-group")].filter((e) => getComputedStyle(e).display !== "none");
    const cur = vis[vis.length - 1];
    const b = document.getElementById("step-last-button") || document.querySelector(".c-submit-button");
    if (!b) return { skip: true, why: "送信CTAを持たない構成" };
    // 送信CTAがまだ到達していないステップの中にある構成（dk_lp参照実装のstep-last等）は
    // 「無効のまま」ではなく「未到達」。誤検知にしない。
    if (cur && !cur.contains(b)) return { skip: true, why: `送信CTAは${(b.closest(".js-form-group") || {}).id || "別ステップ"}側（未到達）` };
    const tel = document.querySelector('input[name="your-tel"]');
    return {
      ok: !b.classList.contains("is-disable"),
      why: `is-disable のまま (tel="${tel ? tel.value : "?"}")`
    };
  });
  if (submit.skip) pass(`${lp} 送信ボタン有効`, submit.why);
  else submit.ok ? pass(`${lp} 送信ボタン有効`) : fail(`${lp} 送信ボタン有効`, submit.why);

  // 7b) 携帯以外の番号を弾くか（固定電話03 / IP電話050）。
  // 電話番号は唯一の連絡手段なので、固定電話が通ると商談が作れないリードが生まれる。
  // 4実装とも isValidTel(/^0[6789]0[0-9]{8}$/) を持つが、正規表現の緩め直しは
  // レビューで気づきにくいのでここで実際に入力して確かめる。
  // 有効な番号のあと（＝上の送信ボタン検査のあと）に無効な番号で終える順にして、
  // 妥当な番号を入れたまま自動送信に流れる経路を踏まない。
  if (!submit.skip) {
    const telGate = await page.evaluate(async () => {
      const input = document.querySelector('input[name="your-tel"]');
      const btn = document.getElementById("step-last-button") || document.querySelector(".c-submit-button");
      if (!input || !btn) return { skip: true, why: "電話入力/送信CTAが無い構成" };
      const type = (v) => {
        input.value = v;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      };
      const wait = () => new Promise((r) => setTimeout(r, 120));
      const bad = [];
      for (const v of ["0312345678", "05011112222"]) {
        type(v);
        await wait();
        if (!btn.classList.contains("is-disable")) bad.push(v);
      }
      type("");
      await wait();
      return { bad };
    });
    if (telGate.skip) pass(`${lp} 携帯以外の番号を弾く`, telGate.why);
    else telGate.bad.length === 0
      ? pass(`${lp} 携帯以外の番号を弾く`)
      : fail(`${lp} 携帯以外の番号を弾く`, `通ってしまう: ${telGate.bad.join(", ")}`);
  }

  // 7c) 送信データが本当にZapier/GASへ出ていくか（リードが消える事故の直接検査）。
  // 実際の送信先へは page.route で到達させず、発生したかだけを数える。
  // form要素にsubmitリスナーを張っていた頃は、外部スクリプトのDOM差し替え後に
  // ステップ遷移だけ生きて送信がゼロになっていた（2026-08-23 実測で発見）。
  if (!submit.skip) {
    const posted = await page.evaluate(async () => {
      const form = document.querySelector(".wpcf7-form");
      if (!form) return { skip: true, why: "フォームが無い構成" };
      const set = (n, v) => {
        const el = form.querySelector(`[name="${n}"]`);
        if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("blur", { bubbles: true })); }
      };
      set("your-last-name", "検証"); set("your-first-name", "一郎"); set("your-tel", "09055512345");
      await new Promise((r) => setTimeout(r, 250));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 500));
      return {};
    });
    if (posted.skip) pass(`${lp} 送信データがZapier/GASへ出る`, posted.why);
    else (mirrorHits.zapier > 0 && mirrorHits.gas > 0)
      ? pass(`${lp} 送信データがZapier/GASへ出る`, `Zapier=${mirrorHits.zapier} GAS=${mirrorHits.gas}`)
      : fail(`${lp} 送信データがZapier/GASへ出る`, `Zapier=${mirrorHits.zapier} GAS=${mirrorHits.gas}（リードが消える）`);
  }

  // 8) 予約枠の先読みは「予約カレンダーが残っている nenshu-shindan 系」だけ
  if (!lp.includes("nenshu-shindan")) {
    bookingReqs.length === 0
      ? pass(`${lp} 予約枠JSONを読まない`)
      : fail(`${lp} 予約枠JSONを読まない`, bookingReqs.join(", "));
  } else if (lp.includes("nenshu-shindan-v2")) {
    // v2系は step06 到達で先読みする（app-v2.js）。ここが落ちたら削りすぎ。
    bookingReqs.length > 0
      ? pass(`${lp} 予約枠JSONを先読みする`)
      : fail(`${lp} 予約枠JSONを先読みする`, "step06に着いても先読みされない");
  }

  pageErrors.length === 0 ? pass(`${lp} JSエラーなし`) : fail(`${lp} JSエラーなし`, pageErrors.slice(0, 3).join(" / "));
  localMisses.length === 0 ? pass(`${lp} ローカル404なし`) : fail(`${lp} ローカル404なし`, localMisses.slice(0, 3).join(", "));

  await ctx.close();
}

const findings = [];
function note(lp, device, kind, detail) { findings.push({ lp, device, kind, detail }); }

/** ページ内をすべて実測する。返すのは「事故になる要素」だけ */
const measure = () => {
  const vw = window.innerWidth;
  const out = { overflow: [], smallTap: [], smallFont: [], docWidth: document.documentElement.scrollWidth };

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
    if (tappable && (r.height < 44 || r.width < 44)) {
      out.smallTap.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height) });
    }

    // ③ 入力欄の文字サイズ（16px未満はiOSで自動ズーム）
    if (el.matches('input:not([type="hidden"]), select, textarea')) {
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
      if (m.docWidth > d.width + 1) note(lp, d.name, "横スクロール", `${where}: 文書幅 ${m.docWidth}px > 画面幅 ${d.width}px`);
      for (const o of m.overflow) note(lp, d.name, "はみ出し", `${where}: ${o.el} (right=${o.right} > ${d.width})`);
      for (const t of m.smallTap) note(lp, d.name, "タップ領域", `${where}: ${t.el} が ${t.w}×${t.h}px（44px未満）`);
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
const LPS = lpIdx >= 0 ? args.slice(lpIdx + 1) : ["/denkikouji/", "/sekoukanri/", "/denkikouji-v2/", "/sekoukanri-v2/"];

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
