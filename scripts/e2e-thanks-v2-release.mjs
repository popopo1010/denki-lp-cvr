#!/usr/bin/env node
/**
 * thanks-v2 本番検証（GTM dataLayer / LINE先行フロー）
 * Usage: npx playwright install chromium && node scripts/e2e-thanks-v2-release.mjs
 *
 * 2026-08-20 全面更新: 2026-06-23のLINE一本化（予約カレンダー撤去）以前の期待値の
 * まま放置されていたため現行仕様へ更新。JSの ?v= 期待値はハードコードせず
 * リポジトリの thanks-v2/index.html から動的に導出する（陳腐化の再発防止）。
 * 予約バックエンド（GAS/booking-slots.json）はLINE経由運用の残置のため
 * 情報表示（warn）のみで合否に含めない。
 */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.THANKS_E2E_BASE || "https://denkilp.builders-job.com/denki-lp-cvr";
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}
function warn(name, detail) {
  // 合否に含めない情報表示（予約バックエンドの残置分など）
  console.log(`⚠ ${name}${detail ? `: ${detail}` : ""}`);
}

/** リポジトリの thanks-v2/index.html から現行の ?v= つきJS参照を導出する */
function repoThanksJsRefs() {
  const html = readFileSync(
    fileURLToPath(new URL("../thanks-v2/index.html", import.meta.url)),
    "utf-8"
  );
  return [...new Set(html.match(/thanks-[a-z0-9-]+\.js\?v=\d+/g) || [])];
}

async function testGasSlotsApi(page) {
  // 予約バックエンドはLINE経由運用向けの残置（ページ未読込）。疎通の情報表示のみ
  try {
    const res = await page.request.get(`${GAS_URL}?action=slots&days=3&format=json`, {
      maxRedirects: 5
    });
    if (!res.ok()) return warn("GAS slots API(残置)", `HTTP ${res.status()}`);
    const data = await res.json();
    warn("GAS slots API(残置)", `ok=${data.ok} staff=${data.staff_count} slots=${(data.slots || []).length}`);
  } catch (e) {
    warn("GAS slots API(残置)", String(e).slice(0, 80));
  }
}

async function testBookingSlotsJson(page) {
  // 同上（残置バックエンドの鮮度は合否に含めない）
  try {
    const res = await page.request.get(`${BASE}/assets/data/booking-slots.json`);
    const data = await res.json();
    warn("booking-slots.json(残置)", `ok=${data.ok} n=${(data.slots || []).length} gen=${(data.generated_at || "").slice(0, 19)}`);
  } catch (e) {
    warn("booking-slots.json(残置)", String(e).slice(0, 80));
  }
}

async function testThanksAssets(page) {
  const html = await (await page.request.get(`${BASE}/thanks-v2/?lp=denkikouji`)).text();
  const checks = [
    ["GTM-KV525PZ", html.includes("GTM-KV525PZ")],
    // JSの ?v= はリポジトリの thanks-v2/index.html と完全一致すること（配信取り残しの検知）
    ...repoThanksJsRefs().map((ref) => [ref, html.includes(ref)]),
    ["LINEで求人全文を受け取る", html.includes("LINEで求人全文を受け取る")],
    ["非公開求人の全文", html.includes("非公開求人の全文")],
    ["line-gate-msg", html.includes('id="line-gate-msg"')],
    ["line-section", html.includes('id="line-section"')],
    // LINE一本化（2026-06-23）: カレンダー・予約UI・予約JSはページに存在しないこと
    ["カレンダー非存在", !html.includes('id="t-calendar"') && !html.includes("t-cal__toggle")],
    ["予約UI非存在", !html.includes("booking-slot-root") && !html.includes("10分相談枠")],
    ["予約JS未読込", !html.includes("thanks-booking-custom.js")],
    ["本登録なし", !html.includes("本登録")]
  ];
  checks.forEach(([k, v]) => (v ? pass("HTML", k) : fail("HTML", k)));

  const storiesRes = await page.request.get(`${BASE}/assets/data/thanks-testimonial-stories.json`);
  if (storiesRes.ok()) {
    const stories = await storiesRes.json();
    const n = Object.keys(stories.stories || {}).length;
    n >= 1 ? pass("stories.json", `${n} entries`) : fail("stories.json", String(n));
  } else {
    fail("stories.json", "fetch failed");
  }
}

async function testGtmDataLayer(page) {
  await page.goto(`${BASE}/thanks-v2/?lp=denkikouji&_tel=09012345678&_name=${encodeURIComponent("テスト太郎")}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await page.evaluate(() => {
    sessionStorage.setItem(
      "dk_lp_lead_v1",
      JSON.stringify({ lp: "denkikouji", ts: Date.now() })
    );
    sessionStorage.setItem("_lp", "denkikouji");
    sessionStorage.removeItem("dk_lp_conversion_fired");
    sessionStorage.removeItem("dk_booking_done");
  });
  await page.reload({ waitUntil: "networkidle" });

  const events = await page.evaluate(() => {
    return (window.dataLayer || [])
      .filter((e) => e && typeof e === "object" && e.event)
      .map((e) => ({
        event: e.event,
        thanks_qualified: e.thanks_qualified,
        lp_slug: e.lp_slug,
        conversion_source: e.conversion_source
      }));
  });

  const hasPageView = events.some((e) => e.event === "thanks_page_view");
  const leadCv = events.find((e) => e.event === "lead_conversion");
  if (hasPageView) {
    pass("dataLayer", "thanks_page_view");
  } else {
    fail("dataLayer", "thanks_page_view missing");
  }
  if (leadCv && leadCv.lp_slug === "denkikouji" && leadCv.conversion_source === "lp_form") {
    pass("dataLayer", "lead_conversion (qualified)");
  } else {
    fail("dataLayer", `lead_conversion: ${JSON.stringify(leadCv)}`);
  }

  const unqualified = await page.evaluate(async () => {
    sessionStorage.removeItem("dk_lp_lead_v1");
    sessionStorage.removeItem("dk_lp_conversion_fired");
    const before = (window.dataLayer || []).length;
    if (window.dkThanks && window.dkThanks.fireThanksPageEvents) {
      window.__dkThanksPageEventsFired = false;
      window.dkThanks.fireThanksPageEvents();
    }
    const after = (window.dataLayer || []).slice(before);
    return after.some((e) => e && e.event === "lead_conversion");
  });
  if (!unqualified) {
    pass("dataLayer", "直アクセスは lead_conversion なし");
  } else {
    fail("dataLayer", "直アクセスで lead_conversion が出た");
  }
}

async function testLineFlow(page) {
  // LINE一本化（2026-06-23）: thanksの主アクションはLINE登録のみ。
  // 旧・予約カレンダー/ドック切替のテストは撤去済みUIのため削除（2026-08-20）
  await page.goto(
    `${BASE}/thanks-v2/?lp=denkikouji&_tel=09012345678&_name=${encodeURIComponent("テスト太郎")}`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await page.evaluate(() => {
    sessionStorage.setItem("dk_lp_lead_v1", JSON.stringify({ lp: "denkikouji", ts: Date.now() }));
    sessionStorage.setItem("_lp", "denkikouji");
    sessionStorage.removeItem("dk_line_clicked");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load").catch(() => {});

  // LINEロック廃止: 最初からLINE CTAが有効であること
  const lineOpen = await page.evaluate(() => ({
    locked: document.body.classList.contains("is-line-locked"),
    ariaDisabled: document.getElementById("line-cta")?.getAttribute("aria-disabled"),
    heroLine: !!document.getElementById("line-cta-hero"),
    dockLineHidden: document.getElementById("thanks-dock-line")?.hidden,
    calendar: !!document.getElementById("t-calendar")
  }));
  if (!lineOpen.locked && !lineOpen.ariaDisabled && lineOpen.heroLine) {
    pass("LINE先行", "初期状態からLINE CTAが有効");
  } else {
    fail("LINE先行", JSON.stringify(lineOpen));
  }
  if (lineOpen.dockLineHidden === false) {
    pass("ドック初期状態", "LINE CTAが表示");
  } else {
    fail("ドック初期状態", JSON.stringify(lineOpen));
  }
  if (!lineOpen.calendar) {
    pass("カレンダーDOM非存在", "LINE一本化どおり");
  } else {
    fail("カレンダーDOM非存在", "t-calendar がDOMに存在する");
  }

  // LINEクリック → 計測イベントとクリック済みフラグ
  const lineClick = await page.evaluate(() => {
    const link = document.getElementById("line-cta");
    if (!link) return { ok: false, reason: "no link" };
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const ev = (window.dataLayer || []).filter((e) => e && e.event === "thanks_line_click").pop();
    return {
      ok: !!ev,
      position: ev && ev.line_cta_position,
      clickedFlag: sessionStorage.getItem("dk_line_clicked")
    };
  });
  if (lineClick.ok && lineClick.position === "section" && lineClick.clickedFlag === "1") {
    pass("dataLayer", `thanks_line_click (position=${lineClick.position})`);
  } else {
    fail("dataLayer", `thanks_line_click missing/incomplete (${JSON.stringify(lineClick)})`);
  }
}

async function thanksWithProfile(page, { lp, profile, expectBrand }) {
  await page.goto(`${BASE}/thanks-v2/?lp=${encodeURIComponent(lp)}`, {
    waitUntil: "networkidle",
    timeout: 60000
  });
  await page.evaluate(
    (p) => {
      sessionStorage.setItem("dk_lead_profile", JSON.stringify(p.profile));
      sessionStorage.setItem("_lp", p.lp);
      sessionStorage.setItem("_license", p.profile.license);
    },
    { lp, profile }
  );

  await page.reload({ waitUntil: "networkidle" });

  const expectFamily = expectBrand.includes("施工管理") ? "sekoukanri" : "denki";
  await page
    .waitForFunction(
      (f) => document.documentElement.getAttribute("data-thanks-family") === f,
      expectFamily,
      { timeout: 10000 }
    )
    .catch(() => {});

  const header = await page.locator("#thanks-header-text").textContent();
  if (header && header.includes(expectBrand)) {
    pass(`${lp} ブランド`, expectBrand);
  } else {
    fail(`${lp} ブランド`, `got: ${header}`);
  }

  await page.waitForSelector(".t-job-card", { timeout: 20000 }).catch(() => {});
  const count = await page.locator(".t-job-card").count();
  if (count >= 1 && count <= 3) {
    pass(`${lp} 案件数`, String(count));
  } else {
    fail(`${lp} 案件数`, String(count));
  }
}

async function testNenshuRedirect(page) {
  await page.goto(`${BASE}/nenshu-shindan-v2/sekoukanri/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  const dest = await page.evaluate(() => {
    if (typeof buildThanksUrl !== "function") {
      const path = location.pathname;
      if (path.includes("/nenshu-shindan-v2/") && !path.includes("/thanks")) {
        return path.replace(/\/[^/]+\/?$/, "/thanks/") + "?lp=nenshu";
      }
      return "unknown";
    }
    return buildThanksUrl();
  });
  if (dest.includes("nenshu-shindan-v2/thanks") && !dest.includes("thanks-v2")) {
    pass("年収診断v2 遷移先", dest);
  } else {
    fail("年収診断v2 遷移先", dest);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "ja-JP"
  });
  const page = await context.newPage();

  await testThanksAssets(page);
  await testGasSlotsApi(page);
  await testBookingSlotsJson(page);
  await testGtmDataLayer(page);
  await testLineFlow(page);
  await testNenshuRedirect(page);

  await thanksWithProfile(page, {
    lp: "denkikouji",
    expectBrand: "電気工事バンク",
    profile: {
      license: "第二種電気工事士",
      pref: "神奈川県",
      city: "",
      experience: "工事作業経験",
      willingness: "近いうちに転職したい"
    }
  });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length) {
    console.error("\nFailed:");
    failed.forEach((f) => console.error(`  - ${f.name}: ${f.detail || ""}`));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
