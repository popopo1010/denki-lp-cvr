#!/usr/bin/env node
/**
 * step06 携帯プレフィックス検証 + 満足度バッジのローカル検証（手動ツール）
 *
 * Usage: node scripts/verify-tel-badge-local.mjs
 *   サーバは自前で起動する（LP_E2E_BASE を渡せば既存サーバを使う）。
 *
 * CIには入れていない。理由: このスクリプトはバッジの色・文字サイズ・
 * 「利用者の94%が満足と回答 / 34,513人が利用中」という**具体的な数値コピー**まで
 * 固定しており、正当なコピー変更のたびにCIが赤くなるため。
 * 電話番号の入力検証（03/050を弾く）という機能面は
 * scripts/e2e-lp-flow-local.mjs の「携帯以外の番号を弾く」でCIが見ている。
 * こちらは見た目を目視前に数値で確かめたいときに手で叩く。
 */
import { spawn } from "node:child_process";
const pw = await import("playwright").catch(() => import("/opt/node22/lib/node_modules/playwright/index.mjs"));
const { chromium, devices } = pw;

let serverProc = null;
let BASE = process.env.LP_E2E_BASE || "";
if (!BASE) {
  const port = 8979;
  BASE = `http://127.0.0.1:${port}`;
  serverProc = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "ignore"
  });
  process.on("exit", () => serverProc && serverProc.kill());
  // 起動待ち（listen するまで数十ms）
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/denkikouji/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
}
const results = [];
const pass = (n, d) => { results.push(true); console.log(`✓ ${n}${d ? `: ${d}` : ""}`); };
const fail = (n, d) => { results.push(false); console.error(`✗ ${n}${d ? `: ${d}` : ""}`); };

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ...devices["iPhone 13"], locale: "ja-JP" });
  await page.goto(`${BASE}/denkikouji/`, { waitUntil: "domcontentloaded" });

  // 実コードパス（委譲クリック → ensureLazySteps → showPage）で step06 へ遷移
  // 初期化完了の目印。app.js は初期化済みグループに data-lp-inited を立てる
  // （2026-08-22 に判定本体は WeakSet へ移したが、この目印は互換で残している）。
  await page.waitForFunction(() => !!document.querySelector('.js-form-group[data-lp-inited="1"]'));
  await page.evaluate(() => {
    const first = document.getElementById("step-first");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "js-step-button";
    btn.dataset.pageTo = "step06";
    first.appendChild(btn);
    btn.click();
  });
  await page.waitForSelector('#step06.is-step-active input[name="your-tel"]', { timeout: 10000 });

  const tel = page.locator('input[name="your-tel"]');
  const errText = page.locator("#error-your-tel p");
  const errBox = page.locator("#error-your-tel");

  // 1. 固定電話(03)プレフィックス → 即時エラー + ボタン無効
  await tel.fill("0312345678");
  await page.waitForTimeout(100);
  const err1 = await errText.textContent();
  const vis1 = await errBox.isVisible();
  const notice1 = await page.locator("#tel-notice").isVisible();
  vis1 && err1.includes("090・080・070・060から始まる携帯番号")
    ? pass("03番号で即時エラー", err1)
    : fail("03番号で即時エラー", `visible=${vis1} text=${err1}`);
  !notice1 ? pass("エラー中はあと○桁カウンター非表示") : fail("カウンターが重複表示");
  const btnDisabled1 = await page.evaluate(() =>
    document.getElementById("step-last-button").classList.contains("is-disable"));
  btnDisabled1 ? pass("03番号で送信ボタン無効") : fail("03番号でも送信ボタン有効");

  // 2. 050(IP電話) → エラー
  await tel.fill("");
  await tel.fill("05011112222");
  await page.waitForTimeout(100);
  const vis2 = await errBox.isVisible();
  vis2 ? pass("050番号でエラー") : fail("050番号でエラーが出ない");

  // 3. 正しい携帯番号 → エラー消滅 + ボタン有効（自動送信前に確認）
  await tel.fill("");
  await tel.fill("09012345678");
  await page.waitForTimeout(100);
  const vis3 = await errBox.isVisible();
  const btnDisabled3 = await page.evaluate(() =>
    document.getElementById("step-last-button").classList.contains("is-disable"));
  !vis3 ? pass("090番号でエラー消滅") : fail("090番号でもエラー残存");
  !btnDisabled3 ? pass("090番号で送信ボタン有効") : fail("090番号でもボタン無効");

  // 4. 060/070/080 も有効
  for (const p3 of ["06011112222", "07011112222", "08011112222"]) {
    await tel.fill("");
    await tel.fill(p3);
    await page.waitForTimeout(50);
    const ok = await page.evaluate(() =>
      !document.getElementById("step-last-button").classList.contains("is-disable"));
    ok ? pass(`${p3.slice(0, 3)}番号で有効`) : fail(`${p3.slice(0, 3)}番号が無効扱い`);
  }

  // 5. 満足度バッジの表示
  const badge = await page.evaluate(() => {
    const el = document.querySelector(".cvr-cta-proof--badge");
    if (!el) return null;
    const s = getComputedStyle(el);
    const main = el.querySelector(".cvr-cta-proof__main strong");
    const r = el.getBoundingClientRect();
    const centered = Math.abs((window.innerWidth - r.right) - r.left) < 30;
    return {
      display: s.display, bg: s.backgroundColor, radius: s.borderRadius,
      strongSize: main ? getComputedStyle(main).fontSize : null,
      strongColor: main ? getComputedStyle(main).color : null,
      centered, text: el.textContent.replace(/\s+/g, " ").trim()
    };
  });
  if (!badge) fail("満足度バッジ", "要素なし");
  else {
    badge.display === "flex" && badge.radius === "8px"
      ? pass("バッジ描画", `${badge.bg} / ${badge.radius}`)
      : fail("バッジ描画", JSON.stringify(badge));
    badge.strongSize === "16px" && badge.strongColor === "rgb(255, 89, 102)"
      ? pass("満足度の数値が強調される", `${badge.strongSize} ${badge.strongColor}`)
      : fail("満足度の数値が強調される", `${badge.strongSize} ${badge.strongColor}`);
    badge.centered ? pass("バッジ中央寄せ") : fail("バッジ中央寄せ", "左右非対称");
    // 数値そのものは固定しない。満足度・利用者数は「事実確認が必要な情報」で、
    // オーナー確認のうえで変わる（実際 94% → 96.4% に変わっていて、
    // 2026-08-23 まで固定値を書いたこのスクリプトだけが古いまま落ちていた）。
    // ここでは「構造が残っているか」を見て、実数は目視できるよう出力する。
    /満足/.test(badge.text) && /利用中/.test(badge.text)
      ? pass("バッジ文言の構造", badge.text)
      : fail("バッジ文言の構造", badge.text);
    console.log(`  ※ 表示中の実数（要事実確認）: ${badge.text}`);
  }

  // 6. step06 スクリーンショット
  await page.screenshot({ path: "/tmp/step06-badge.png", fullPage: false });

  await browser.close();
  if (serverProc) serverProc.kill();
  const failed = results.filter((r) => !r).length;
  console.log(`\n--- ${results.length - failed}/${results.length} passed ---`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
