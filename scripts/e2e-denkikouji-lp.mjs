#!/usr/bin/env node
/**
 * denkikouji LP 本番スモーク（送信ボタン・dataLayer）
 */
import { chromium, devices } from "playwright";

const BASE = process.env.LP_E2E_BASE || "https://denkilp.builders-job.com/denki-lp-cvr";
const results = [];

function pass(n, d) {
  results.push({ ok: true, name: n, detail: d });
  console.log(`✓ ${n}${d ? `: ${d}` : ""}`);
}
function fail(n, d) {
  results.push({ ok: false, name: n, detail: d });
  console.error(`✗ ${n}${d ? `: ${d}` : ""}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ...devices["iPhone 13"], locale: "ja-JP" });

  const lpHtml = await (await page.request.get(`${BASE}/denkikouji/`)).text();
  if (lpHtml.includes("cvr-boost-denkikouji.css?v20260715")) {
    pass("本番 CSS", "v20260715");
  } else if (lpHtml.match(/cvr-boost-denkikouji\.css\?v202[0-9]+/)) {
    fail("本番 CSS", "v20260715 未反映（デプロイ待ち）");
  } else {
    fail("本番 CSS", "cache buster 不明");
  }

  await page.goto(`${BASE}/denkikouji/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#step-first .p-firstButton", { timeout: 15000 }).catch(() => {});

  const fvH = await page.evaluate(() => {
    const btn = document.querySelector("#step-first .p-firstButton");
    if (!btn) return 0;
    const h = Math.round(btn.getBoundingClientRect().height);
    const min = parseInt(getComputedStyle(btn).minHeight, 10) || 0;
    return Math.max(h, min);
  });
  fvH >= 68 ? pass("FV CTA 高さ", `${fvH}px`) : fail("FV CTA 高さ", `${fvH}px (min期待68)`);

  await page.evaluate(async () => {
    const mount = document.getElementById("lazy-steps-mount");
    if (!mount || !mount.dataset.lazySrc) return;
    const res = await fetch(mount.dataset.lazySrc);
    const html = await res.text();
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    mount.replaceWith(tpl.content);
    if (window.__lpBindLazySteps) window.__lpBindLazySteps();
  });

  await page.goto(`${BASE}/thanks-v2/?lp=denkikouji`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    sessionStorage.setItem("dk_lp_lead_v1", JSON.stringify({ lp: "denkikouji", ts: Date.now() }));
    sessionStorage.setItem("_tel", "09012345678");
    sessionStorage.setItem("_name", "テスト太郎");
  });

  await page.goto(`${BASE}/denkikouji/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const mount = document.getElementById("lazy-steps-mount");
    if (!mount?.dataset.lazySrc) return;
    const res = await fetch(mount.dataset.lazySrc);
    const tpl = document.createElement("template");
    tpl.innerHTML = (await res.text()).trim();
    mount.replaceWith(tpl.content);
    if (window.__lpBindLazySteps) window.__lpBindLazySteps();
    const step06 = document.getElementById("step06");
    if (step06) {
      document.querySelectorAll(".js-page-body").forEach((el) => {
        el.style.display = el.id === "step06" ? "block" : "none";
      });
      document.body.classList.add("lp-form-step", "lp-input-step");
    }
  });

  const submit = await page.evaluate(() => {
    const input = document.getElementById("submit-button");
    const text = document.querySelector(".c-submit-button__text span");
    if (!input || !text) return { ok: false, reason: "missing elements" };
    const inputStyle = getComputedStyle(input);
    const visibleSubmit =
      inputStyle.fontSize === "0px" ||
      parseFloat(inputStyle.fontSize) === 0 ||
      inputStyle.opacity === "0";
    return {
      ok: visibleSubmit && text.textContent.includes("あなたに合う求人を見る"),
      label: text.textContent,
      fontSize: inputStyle.fontSize,
      opacity: inputStyle.opacity
    };
  });

  if (submit.ok) {
    pass("送信ボタン", "二重表示なし");
  } else {
    fail("送信ボタン", JSON.stringify(submit));
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
