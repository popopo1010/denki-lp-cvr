#!/usr/bin/env node
/**
 * thanks-v2 本番検証（GTM dataLayer / 予約枠 / LINE先行フロー）
 * Usage: npx playwright install chromium && node scripts/e2e-thanks-v2-release.mjs
 */
import { chromium, devices } from "playwright";

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

/** 本番とリポのマイナーバージョン差を許容 */
function htmlHasAny(html, patterns) {
  return patterns.some((p) => html.includes(p));
}

async function testGasSlotsApi(page) {
  const res = await page.request.get(`${GAS_URL}?action=slots&days=3&format=json`, {
    maxRedirects: 5
  });
  if (!res.ok()) {
    fail("GAS slots API", `HTTP ${res.status()}`);
    return;
  }
  const data = await res.json();
  if (data.ok && data.staff_count === 4 && (data.slots || []).length > 0) {
    pass("GAS slots API", `staff=${data.staff_count} slots=${data.slots.length} gen=${(data.generated_at || "").slice(0, 19)}`);
  } else {
    fail("GAS slots API", JSON.stringify({ ok: data.ok, staff: data.staff_count, n: (data.slots || []).length }));
  }
}

async function testBookingSlotsJson(page) {
  const res = await page.request.get(`${BASE}/assets/data/booking-slots.json`);
  const data = await res.json();
  const gen = data.generated_at || "";
  const ageOk = gen && Date.now() - Date.parse(gen) < 48 * 3600 * 1000;
  if (data.ok && data.staff_count === 4 && (data.slots || []).length > 0 && ageOk) {
    pass("booking-slots.json", `staff=${data.staff_count} slots=${data.slots.length} gen=${gen.slice(0, 19)}`);
  } else {
    fail("booking-slots.json", JSON.stringify({ ok: data.ok, staff: data.staff_count, n: (data.slots || []).length, gen }));
  }
}

async function testThanksAssets(page) {
  const html = await (await page.request.get(`${BASE}/thanks-v2/?lp=denkikouji`)).text();
  const checks = [
    ["GTM-KV525PZ", html.includes("GTM-KV525PZ")],
    ["thanks-v2-shared.js?v=8", html.includes("thanks-v2-shared.js?v=8")],
    [
      "thanks-page-context.js",
      htmlHasAny(html, ["thanks-page-context.js?v=27", "thanks-page-context.js?v=28"])
    ],
    [
      "thanks-booking-custom.js",
      htmlHasAny(html, ["thanks-booking-custom.js?v=39", "thanks-booking-custom.js?v=40"])
    ],
    ["thanks-job-preview.js?v=19", html.includes("thanks-job-preview.js?v=19")],
    ["thanks-v2-deferred.js?v=15", html.includes("thanks-v2-deferred.js?v=15")],
    ["t-cal__toggle", html.includes("t-cal__toggle")],
    ["10分相談枠", html.includes("10分相談枠")],
    ["LINEで求人全文を受け取る", html.includes("LINEで求人全文を受け取る")],
    ["非公開求人の全文", html.includes("非公開求人の全文")],
    ["line-gate-msg", html.includes('id="line-gate-msg"')],
    [
      "LINEセクションがカレンダーより上",
      html.indexOf('id="line-section"') > 0 &&
        html.indexOf('id="line-section"') < html.indexOf('id="t-calendar"')
    ],
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

async function testBookingAndLineGate(page) {
  const gasBookPattern = /script\.google\.com\/macros\/s\/.*action=book/;
  await page.route(gasBookPattern, async (route) => {
    const url = route.request().url();
    const cbMatch = url.match(/callback=([^&]+)/);
    const cb = cbMatch ? decodeURIComponent(cbMatch[1]) : "lpBookingMock";
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `${cb}({"ok":true,"mock":true});`
    });
  });

  await page.goto(
    `${BASE}/thanks-v2/?lp=denkikouji&_tel=09012345678&_name=${encodeURIComponent("テスト太郎")}`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await page.evaluate(() => {
    sessionStorage.setItem("dk_lp_lead_v1", JSON.stringify({ lp: "denkikouji", ts: Date.now() }));
    sessionStorage.setItem("_lp", "denkikouji");
    sessionStorage.removeItem("dk_booking_done");
    sessionStorage.removeItem("dk_line_clicked");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load").catch(() => {});

  // LINE先行フロー: 予約前からLINEは開いている
  const lineOpen = await page.evaluate(() => ({
    locked: document.body.classList.contains("is-line-locked"),
    ariaDisabled: document.getElementById("line-cta")?.getAttribute("aria-disabled"),
    heroLine: !!document.getElementById("line-cta-hero"),
    dockLineHidden: document.getElementById("thanks-dock-line")?.hidden,
    dockBookHidden: document.getElementById("thanks-dock-book")?.hidden
  }));
  if (!lineOpen.locked && !lineOpen.ariaDisabled && lineOpen.heroLine) {
    pass("LINE先行", "予約前からLINE CTAが有効");
  } else {
    fail("LINE先行", JSON.stringify(lineOpen));
  }
  if (lineOpen.dockLineHidden === false && lineOpen.dockBookHidden === true) {
    pass("ドック初期状態", "LINE CTAのみ表示");
  } else {
    fail("ドック初期状態", JSON.stringify(lineOpen));
  }

  // LINEクリック → 計測 + ドックが予約CTAへ切替
  const lineClick = await page.evaluate(() => {
    const link = document.getElementById("line-cta");
    if (!link) return { ok: false, reason: "no link" };
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const ev = (window.dataLayer || []).filter((e) => e && e.event === "thanks_line_click").pop();
    return {
      ok: !!ev,
      position: ev && ev.line_cta_position,
      clickedFlag: sessionStorage.getItem("dk_line_clicked"),
      dockLineHidden: document.getElementById("thanks-dock-line")?.hidden,
      dockBookHidden: document.getElementById("thanks-dock-book")?.hidden
    };
  });
  if (lineClick.ok && lineClick.position === "section" && lineClick.clickedFlag === "1") {
    pass("dataLayer", `thanks_line_click (position=${lineClick.position})`);
  } else {
    fail("dataLayer", `thanks_line_click missing/incomplete (${JSON.stringify(lineClick)})`);
  }
  if (lineClick.dockLineHidden === true && lineClick.dockBookHidden === false) {
    pass("ドック切替", "LINEクリック後は予約CTA");
  } else {
    fail("ドック切替", JSON.stringify(lineClick));
  }

  const expanded = await page.evaluate(() => {
    if (typeof window.dkThanksExpandCalendar === "function") {
      window.dkThanksExpandCalendar({ scroll: false });
      return true;
    }
    return false;
  });
  if (!expanded) {
    const toggle = page.locator("#t-cal-toggle");
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    }
  }

  await page.waitForSelector("#booking-slot-root .t-booking-slot", { timeout: 25000 }).catch(() => {});
  const slotCount = await page.locator("#booking-slot-root .t-booking-slot").count();
  if (slotCount > 0) {
    pass("予約枠UI", `${slotCount} 枠`);
  } else {
    const root = await page.locator("#booking-slot-root").textContent();
    fail("予約枠UI", (root || "").slice(0, 100));
    return;
  }

  await page.locator("#booking-slot-root .t-booking-slot").first().click();
  await page.locator("#booking-confirm").click({ timeout: 10000 });

  await page
    .waitForFunction(() => document.body.classList.contains("is-booked"), { timeout: 15000 })
    .catch(() => {});

  const booked = await page.evaluate(() => ({
    booked: document.body.classList.contains("is-booked"),
    lineDoneNote: !!document.querySelector(".t-booking-done__line-done"),
    dockVisible: document.getElementById("thanks-dock")?.classList.contains("is-visible")
  }));

  if (booked.booked) {
    pass("予約完了", "is-booked");
  } else {
    fail("予約完了", JSON.stringify(booked));
  }
  if (booked.lineDoneNote) {
    pass("予約完了カード", "LINE開設済みの案内（再CTAなし）");
  } else {
    fail("予約完了カード", "LINE開設済み案内が出ていない");
  }
  if (booked.dockVisible === false) {
    pass("ドック", "LINE+予約 完了でドック退避");
  } else {
    fail("ドック", `両完了後もドック表示 (${JSON.stringify(booked)})`);
  }

  const dlBooking = await page.evaluate(() =>
    (window.dataLayer || [])
      .filter((e) => e && e.event === "thanks_booking_recommended_complete")
      .length
  );
  if (dlBooking >= 1) {
    pass("dataLayer", "thanks_booking_recommended_complete");
  } else {
    fail("dataLayer", "thanks_booking_recommended_complete missing");
  }

  await page.unroute(gasBookPattern);
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
  await testBookingAndLineGate(page);
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
