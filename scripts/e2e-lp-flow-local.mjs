#!/usr/bin/env node
/**
 * LPフォームのローカル回帰E2E（本番不要・CIで回す）
 *
 * CLAUDE.md に「頻出バグ」として積み上がっている再発クラスを、実ブラウザで毎回踏み直す。
 *   1. FVが表示される（2026-07-08 FV非表示インシデント: opacity:0のまま出ない）
 *   2. 選択したらクマ(.cvr-kuma)が次のCTAへ移動する（再発多数）
 *   3. ステップ上部（STEP表示/タイトル）が画面外に隠れない（2026-07-05〜）
 *   4. 最後まで進んで送信ボタンが押せる（「選択しても進めない」= フォームが死ぬ）
 *   5. 外部スクリプトがフォームDOMを差し替えても自己修復する（2026-07-10）
 *   6. 遅延ステップ(steps-lazy.html)の取得に失敗しても次のクリックで復旧する
 *   7. window load 前のクリックでも進む（デッドクリック）
 *   8. 予約枠JSON(54KB)を予約を使わないLPで読まない（2026-08-22 QA）
 *
 * 注意: ローカルにはWPテーマCSS(WAF 403)が無いため、見た目の崩れはここでは検出できない。
 * 表示に関わる変更は STG のスマホ実機確認が必須（CLAUDE.md）。ここが見るのは「動作」。
 *
 * 使い方: node scripts/e2e-lp-flow-local.mjs [--lp /denkikouji/ ...]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// ポートは既定で自動採番（並行実行やCIでの取り合いを避ける）。固定したいときは E2E_PORT。
const PORT = Number(process.env.E2E_PORT || 0);
let BASE = "http://127.0.0.1";

const DEFAULT_LPS = [
  "/denkikouji/",        // app.js + steps-lazy
  "/sekoukanri/",        // app.js + step01 複数選択(自動遷移)
  "/denkikouji-v2/",     // app-v2.js（ステップ同梱）
  "/sekoukanri-v2/"      // app-v2.js + 施工管理step01
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

const results = [];
const pass = (name, detail) => { results.push({ ok: true, name }); console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`); };
const fail = (name, detail) => { results.push({ ok: false, name, detail }); console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`); };

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, BASE);
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      let file = join(ROOT, p);
      const s = await stat(file).catch(() => null);
      if (s && s.isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => {
    BASE = `http://127.0.0.1:${server.address().port}`;
    resolve(server);
  }));
}

/** 外部ホスト（WPテーマ/GTM/住所API等）はローカルから到達できないので中断する */
async function blockExternal(page) {
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    return route.abort();
  });
}

/** 現在表示中のステップと、その上部見出し・クマ・CTAの位置を取る */
const probe = () => ({
  step: (() => {
    const vis = [...document.querySelectorAll(".js-form-group")].filter((e) => getComputedStyle(e).display !== "none");
    return vis.length ? vis[vis.length - 1].id : "";
  })(),
  headTop: (() => {
    const vis = [...document.querySelectorAll(".js-form-group")].filter((e) => getComputedStyle(e).display !== "none");
    const cur = vis[vis.length - 1];
    if (!cur) return null;
    const head = cur.querySelector(".c-step, .c-title01, .meta-fv__title");
    return head ? Math.round(head.getBoundingClientRect().top) : null;
  })(),
  opacity: (() => {
    const vis = [...document.querySelectorAll(".js-form-group")].filter((e) => getComputedStyle(e).display !== "none");
    const cur = vis[vis.length - 1];
    return cur ? getComputedStyle(cur).opacity : null;
  })(),
  kumaStepId: (() => {
    // 表示中のクマだけを見る。LPによってはステップごとにアイコン要素を持っており
    // （dk_lp参照実装）、document先頭の非表示アイコンを拾うと誤検知になる。
    const all = [...document.querySelectorAll(".cvr-kuma, .js-fixed-icon")];
    const k = all.find((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed") || all[0];
    const g = k && k.closest(".js-form-group");
    return g ? g.id : (k ? "detached" : "none");
  })(),
  kumaToCta: (() => {
    const all = [...document.querySelectorAll(".cvr-kuma, .js-fixed-icon")];
    const k = all.find((e) => e.offsetParent !== null) || all[0];
    if (!k) return null;
    const g = k.closest(".js-form-group");
    if (!g) return null;
    const cta = g.querySelector(".js-next-button:not(.is-disable), #submit-button");
    if (!cta) return null;
    const kr = k.getBoundingClientRect();
    const cr = cta.getBoundingClientRect();
    return Math.round(Math.abs(kr.bottom - cr.top));
  })()
});

/** 表示中のステップを1つ進める。進めたら true */
async function advanceOnce(page) {
  const before = await page.evaluate(probe);
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
  const after = await page.evaluate(probe);
  return { acted, before, after };
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
  await blockExternal(page);
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

/** 5) 外部スクリプトによるフォームDOM差し替えからの自己修復 */
async function runSelfHeal(browser, devices, lp) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ja-JP" });
  const page = await ctx.newPage();
  await blockExternal(page);
  await page.goto(BASE + lp, { waitUntil: "load" });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.dataLayer = window.dataLayer || []; });
  // LandingHub等の最適化ツールがやること: フォームを丸ごと複製で差し替える
  const swapped = await page.evaluate(() => {
    const form = document.querySelector(".wpcf7-form");
    if (!form) return false;
    form.replaceWith(form.cloneNode(true));
    return true;
  });
  if (!swapped) { fail(`${lp} DOM差し替え後の自己修復`, "フォームが見つからない"); await ctx.close(); return; }
  const { after } = await advanceOnce(page);
  const healed = await page.evaluate(() =>
    (window.dataLayer || []).some((d) => d && d.error_type === "form_group_reinit"));
  if (after.step && after.step !== "step-first") pass(`${lp} DOM差し替え後も進む`, `→ ${after.step}${healed ? "（自己修復を計測済み）" : ""}`);
  else fail(`${lp} DOM差し替え後も進む`, `止まった: ${after.step}`);
  await ctx.close();
}

/** 6) steps-lazy.html の取得失敗からの復旧 */
async function runLazyRecovery(browser, devices, lp) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ja-JP" });
  const page = await ctx.newPage();
  let aborted = 0;
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (!u.startsWith(BASE)) return route.abort();
    if (u.includes("steps-lazy.html") && aborted < 1) { aborted++; return route.abort(); }
    return route.continue();
  });
  await page.goto(BASE + lp, { waitUntil: "load" });
  await page.waitForTimeout(600);
  let step = "";
  for (let i = 0; i < 22; i++) {
    const { acted, after } = await advanceOnce(page);
    step = after.step;
    if (acted === "stuck" || acted === "no-step") break;
    if (step === "step04" || step === "step06") break;
  }
  if (aborted && (step === "step03" || step === "step04" || step === "step06")) {
    pass(`${lp} 遅延ステップ取得失敗から復旧`, `到達: ${step}`);
  } else if (!aborted) {
    pass(`${lp} 遅延ステップ取得失敗から復旧`, "遅延ステップ無し（対象外）");
  } else {
    fail(`${lp} 遅延ステップ取得失敗から復旧`, `止まった: ${step}`);
  }
  await ctx.close();
}

/** 7) window load 前のクリックでも進む（デッドクリック） */
async function runEarlyClick(browser, devices, lp) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ja-JP" });
  const page = await ctx.newPage();
  // 「DOMContentLoaded 済み・load 未了」の窓を確実に作る。
  // 外部リソース(WPテーマCSS/画像)の中断をわざと遅らせると、その間 window load は来ない。
  // goto の waitUntil だけに頼るとローカル配信が速すぎて load 後にクリックしてしまい、
  // 判定が「デッドクリック」と「検証できていない」の間で揺れる（2026-08-23 に実測）。
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    await new Promise((r) => setTimeout(r, 4000));
    return route.abort().catch(() => {});
  });
  await page.goto(BASE + lp, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForFunction(() => document.readyState !== "loading", null, { timeout: 15000 }).catch(() => {});
  await page.waitForSelector("#step-first .js-radio-button, #step-first .p-firstButton, #step-first .meta-fv__cta", { timeout: 10000 }).catch(() => {});
  const state = await page.evaluate(() => document.readyState);
  const clicked = await page.evaluate(() => {
    const b = document.querySelector("#step-first .js-radio-button, #step-first .p-firstButton, #step-first .meta-fv__cta");
    if (!b) return false;
    b.click();
    return true;
  });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(probe);
  if (!clicked) fail(`${lp} load前クリック`, "FVボタンが無い");
  else if (state === "complete") fail(`${lp} load前クリック`, "load後になってしまい検証できていない");
  else if (after.step && after.step !== "step-first") pass(`${lp} load前クリック`, `→ ${after.step} (readyState=${state})`);
  else fail(`${lp} load前クリック`, `step-firstのまま（デッドクリック / readyState=${state}）`);
  await ctx.close();
}

/** playwright はリポジトリ直下・グローバルのどちらに入っていても拾う */
async function loadPlaywright() {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.PLAYWRIGHT_MODULE_PATH,
    "playwright",
    "/opt/node22/lib/node_modules/playwright",
    "/usr/lib/node_modules/playwright"
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 次の候補へ */ }
  }
  throw new Error("playwright が見つからない（npm i --no-save playwright を実行するか PLAYWRIGHT_MODULE_PATH を指定）");
}

async function main() {
  const args = process.argv.slice(2);
  const lps = args.includes("--lp") ? args.slice(args.indexOf("--lp") + 1) : DEFAULT_LPS;
  const { chromium, devices } = await loadPlaywright();
  const server = await startServer();
  const launch = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launch.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const browser = await chromium.launch(launch);
  try {
    for (const lp of lps) await runLp(browser, devices, lp);
    await runSelfHeal(browser, devices, lps[0]);
    await runLazyRecovery(browser, devices, lps[0]);
    for (const lp of lps) await runEarlyClick(browser, devices, lp);
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
