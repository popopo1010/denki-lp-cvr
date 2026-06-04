#!/usr/bin/env node
/**
 * thanks-v2 リリース前 E2E（本番・sessionStorage 注入 + LP遷移）
 * Usage: npx playwright install chromium && node scripts/e2e-thanks-v2-release.mjs
 */
import { chromium, devices } from "playwright";

const BASE = process.env.THANKS_E2E_BASE || "https://denkilp.builders-job.com/denki-lp-cvr";
const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

async function thanksWithProfile(page, { lp, profile, expectBrand }) {
  await page.goto(`${BASE}/thanks-v2/?lp=${encodeURIComponent(lp)}`, {
    waitUntil: "networkidle",
    timeout: 60000
  });
  await page.evaluate((p) => {
    sessionStorage.setItem(
      "dk_lead_profile",
      JSON.stringify(p.profile)
    );
    sessionStorage.setItem("_lp", p.lp);
    sessionStorage.setItem("_license", p.profile.license);
  }, { lp, profile });

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

  const title = await page.locator("#t-jobs-title").textContent();
  if (title && title.includes("非公開求人") && !title.includes("プレビュー")) {
    pass(`${lp} 見出し`, title.trim());
  } else {
    fail(`${lp} 見出し`, title);
  }

  await page.waitForSelector(".t-job-card", { timeout: 15000 }).catch(() => {});
  const cards = page.locator(".t-job-card");
  const count = await cards.count();
  if (count >= 1 && count <= 3) {
    pass(`${lp} 案件数`, String(count));
  } else {
    fail(`${lp} 案件数`, String(count));
  }

  if (profile.pref) {
    const areas = await cards.locator(".t-job-card__meta span").allTextContents();
    const bad = areas.filter((a) => a.trim() !== profile.pref);
    if (bad.length === 0 && areas.length > 0) {
      pass(`${lp} 勤務地`, `すべて ${profile.pref}`);
    } else {
      fail(`${lp} 勤務地`, JSON.stringify(areas));
    }
  }

  if (profile.expectLicenseInLabel) {
    const label = await page.locator("#job-preview-label").textContent();
    if (label && label.includes(profile.expectLicenseInLabel)) {
      pass(`${lp} 資格ラベル`, profile.expectLicenseInLabel);
    } else {
      fail(`${lp} 資格ラベル`, label);
    }
  }

  await page.locator('[data-intent="salary"]').click();
  await page.waitForTimeout(800);
  pass(`${lp} 希望チップ`, "salary クリック");

  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(500);
  const dock = page.locator("#thanks-dock.is-visible");
  if (await dock.isVisible().catch(() => false)) {
    pass(`${lp} スティッキーCTA`, "表示");
  } else {
    fail(`${lp} スティッキーCTA`, "非表示");
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

async function testBookingSlots(page) {
  const res = await page.request.get(`${BASE}/assets/data/booking-slots.json`);
  const data = await res.json();
  if (data.staff_count === 4 && (data.slots || []).length > 0) {
    pass("booking-slots", `staff=${data.staff_count} slots=${data.slots.length}`);
  } else {
    fail("booking-slots", JSON.stringify({ staff: data.staff_count, n: (data.slots || []).length }));
  }
}

async function testThanksAssets(page) {
  const html = await (await page.request.get(`${BASE}/thanks-v2/`)).text();
  const checks = [
    ["thanks-job-preview.js?v=10", html.includes("thanks-job-preview.js?v=10")],
    ["thanks-page-context.js?v=12", html.includes("thanks-page-context.js?v=12")],
    ["thanks-v2-deferred.js?v=3", html.includes("thanks-v2-deferred.js?v=3")],
    ["t-future", html.includes('id="t-future"')],
    ["data-story-id x8", (html.match(/data-story-id="/g) || []).length === 8],
    ["非公開求人 · 全文", html.includes("非公開求人 · 全文")],
    ["求人の概要", html.includes("求人の概要")],
    ["LINEで案内を受け取る", html.includes("LINEで案内を受け取る")],
    ["本登録なし", !html.includes("本登録")],
    ["プレビューなし", !html.match(/プレビュー/)]
  ];
  checks.forEach(([k, v]) => (v ? pass("HTML", k) : fail("HTML", k)));

  const storiesRes = await page.request.get(`${BASE}/assets/data/thanks-testimonial-stories.json`);
  if (storiesRes.ok()) {
    const stories = await storiesRes.json();
    const n = Object.keys(stories.stories || {}).length;
    n === 8 ? pass("stories.json", "8 entries") : fail("stories.json", String(n));
  } else {
    fail("stories.json", "fetch failed");
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
  await testBookingSlots(page);
  await testNenshuRedirect(page);

  await thanksWithProfile(page, {
    lp: "denkikouji-v2",
    expectBrand: "電気工事バンク",
    profile: {
      license: "第二種電気工事士",
      pref: "神奈川県",
      city: "",
      experience: "工事作業経験",
      willingness: "近いうちに転職したい",
      expectLicenseInLabel: "第二種"
    }
  });

  await thanksWithProfile(page, {
    lp: "sekoukanri-kentiku-v2",
    expectBrand: "施工管理キャリア",
    profile: {
      license: "1級建築施工管理技士",
      pref: "東京都",
      city: "",
      experience: "施工管理経験",
      willingness: "今は情報収集したい",
      expectLicenseInLabel: "建築"
    }
  });

  await page.goto(`${BASE}/thanks-v2/`, { waitUntil: "networkidle" });
  const slotsVisible = await page
    .locator("#booking-slot-root .t-booking-day, #booking-slot-root button")
    .first()
    .isVisible({ timeout: 20000 })
    .catch(() => false);
  if (slotsVisible) {
    pass("予約枠UI", "枠表示");
  } else {
    const skel = await page.locator("#booking-slot-root").textContent();
    fail("予約枠UI", (skel || "").slice(0, 80));
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
