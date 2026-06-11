#!/usr/bin/env node
/**
 * step04 郵便番号エラーフォールバックのローカル検証
 * Usage: node scripts/verify-zip-error-local.mjs
 * 前提: python3 -m http.server 8080 をリポジトリ直下で起動済み
 *       playwright はローカル node_modules かグローバルから解決
 */
const pw = await import("playwright").catch(() => import("/opt/node22/lib/node_modules/playwright/index.mjs"));
const { chromium, devices } = pw;

const BASE = process.env.LP_E2E_BASE || "http://localhost:8080";
const results = [];
const pass = (n, d) => { results.push(true); console.log(`✓ ${n}${d ? `: ${d}` : ""}`); };
const fail = (n, d) => { results.push(false); console.error(`✗ ${n}${d ? `: ${d}` : ""}`); };

// zipMode: "not_found" → results:null / "ok" → 東京都千代田区 / "abort" → 接続失敗
let zipMode = "not_found";

async function openZipStep(page) {
  await page.goto(`${BASE}/denkikouji/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".wpcf7-form")?.dataset.stepDelegated === "1");
  await page.evaluate(() => {
    const first = document.getElementById("step-first");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "js-step-button";
    btn.dataset.pageTo = "step04";
    first.appendChild(btn);
    btn.click();
  });
  await page.waitForSelector("#step04.is-step-active #zip", { timeout: 10000 });
}

function zipState(page) {
  return page.evaluate(() => ({
    noticeText: document.getElementById("zip-notice").textContent,
    noticeVisible: getComputedStyle(document.getElementById("zip-notice")).display !== "none",
    noticeColor: getComputedStyle(document.getElementById("zip-notice")).color,
    accordionOpen: document.getElementById("select-box-accordion").open,
    btnDisabled: document.getElementById("step04-next-button").classList.contains("is-disable"),
    events: (window.dataLayer || []).filter((e) => e.event === "zip_lookup_error").map((e) => e.zip_error_reason),
  }));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ...devices["iPhone 13"], locale: "ja-JP" });

  await page.route("https://zipcloud.ibsnet.co.jp/**", (route) => {
    if (zipMode === "abort") return route.abort();
    const body = zipMode === "ok"
      ? { results: [{ address1: "東京都", address2: "千代田区", address3: "" }] }
      : { results: null };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("https://geoapi.heartrails.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ response: { location: [{ city: "千代田区" }] } }) }));

  // 0. ステップ遷移で form_step が送信される（v1の委譲ハンドラ経由）
  await openZipStep(page);
  const steps = await page.evaluate(() =>
    (window.dataLayer || []).filter((e) => e.event === "form_step").map((e) => e.step_name));
  steps.includes("step04") ? pass("form_step(step04) 計測", JSON.stringify(steps)) : fail("form_step未送信", JSON.stringify(steps));

  // 1. 存在しない郵便番号 → 赤字エラー + ボタン無効 + アコーディオン自動オープン + 計測
  await page.locator("#zip").fill("0000000");
  await page.waitForTimeout(300);
  let s = await zipState(page);
  s.noticeVisible && s.noticeText === "該当する住所が見つかりません"
    ? pass("存在しない番号でエラー表示", s.noticeText)
    : fail("存在しない番号でエラー表示", JSON.stringify(s));
  s.noticeColor === "rgb(216, 50, 55)" ? pass("エラーは赤字") : fail("エラー色", s.noticeColor);
  s.btnDisabled ? pass("次へボタン無効（住所欠損で進めない）") : fail("ボタンが有効のまま");
  s.accordionOpen ? pass("手動選択アコーディオン自動オープン") : fail("アコーディオン閉じたまま");
  s.events.includes("not_found") ? pass("zip_lookup_error(not_found) 計測") : fail("dataLayer未送信", JSON.stringify(s.events));
  await page.screenshot({ path: "/tmp/zip-error-not-found.png" });

  // 2. 正しい番号に入れ直し → エラー解消 + ボタン有効
  zipMode = "ok";
  await page.locator("#zip").fill("");
  await page.locator("#zip").fill("1000001");
  await page.waitForTimeout(300);
  s = await zipState(page);
  !s.noticeVisible ? pass("正しい番号でエラー消滅") : fail("エラー残存", s.noticeText);
  !s.btnDisabled ? pass("正しい番号でボタン有効") : fail("ボタン無効のまま");

  // 3. API障害 → 案内は出すがCVは止めない（ボタン有効のまま）
  zipMode = "abort";
  await openZipStep(page);
  await page.locator("#zip").fill("1000001");
  await page.waitForTimeout(300);
  s = await zipState(page);
  s.noticeVisible && s.noticeText === "住所を取得できませんでした"
    ? pass("API障害で案内表示", s.noticeText)
    : fail("API障害で案内表示", JSON.stringify(s));
  !s.btnDisabled ? pass("API障害でもボタン有効（CV阻害なし）") : fail("API障害でボタン無効");
  s.accordionOpen ? pass("API障害でも手動選択へ誘導") : fail("アコーディオン閉じたまま");
  s.events.includes("api_error") ? pass("zip_lookup_error(api_error) 計測") : fail("dataLayer未送信", JSON.stringify(s.events));
  await page.screenshot({ path: "/tmp/zip-error-api-fail.png" });

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n--- ${results.length - failed}/${results.length} passed ---`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
