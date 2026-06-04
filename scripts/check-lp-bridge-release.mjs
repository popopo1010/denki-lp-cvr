#!/usr/bin/env node
/**
 * LP → thanks-v2 → GAS/Slack ブリッジのリリース前静的チェック
 * Usage: node scripts/check-lp-bridge-release.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mustInclude(rel, needles, label) {
  const src = read(rel);
  for (const n of needles) {
    if (!src.includes(n)) {
      fail(label || rel, `missing: ${n}`);
      return false;
    }
  }
  pass(label || rel, needles.length + " tokens");
  return true;
}

const gasUrl =
  "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";

const bridgeNeedles = [
  gasUrl,
  "dk_job_intent",
  "dk_lead_profile",
  'sessionStorage.setItem("_tel"',
  "prewarmThanksBookingSlots",
  "THANKS_V2_PATH",
  "dk_lp_lead_v1"
];

mustInclude("assets/js/app-v2.js", [...bridgeNeedles, "postTo(GAS_URL"], "app-v2.js");
mustInclude("assets/js/app.js", [...bridgeNeedles, "postTo(GAS_URL"], "app.js");

const dkNeedles = [
  gasUrl,
  "initFormMirrors",
  "persistThanksBridgeSession",
  "CVR_ASSETS_BASE",
  "dk_job_intent",
  'storageSet("_tel"',
  "prewarmThanksBookingSlots"
];
mustInclude("dk_lp/denkikouji/assets/js/main.js", dkNeedles, "dk_lp denkikouji main.js");
mustInclude("dk_lp/sekokanri/assets/js/main.js", dkNeedles, "dk_lp sekokanri main.js");

for (const mirror of ["WPLP/assets/js/app-v2.js", "自前LP/assets/js/app-v2.js"]) {
  const a = read("assets/js/app-v2.js");
  const b = read(mirror);
  if (a === b) pass("mirror", `${mirror} === canonical`);
  else fail("mirror", `${mirror} differs from assets/js/app-v2.js`);
}

for (const mirror of ["WPLP/assets/js/app.js", "自前LP/assets/js/app.js"]) {
  const a = read("assets/js/app.js");
  const b = read(mirror);
  if (a === b) pass("mirror", `${mirror} === canonical`);
  else fail("mirror", `${mirror} differs from assets/js/app.js`);
}

const booking = read("assets/js/thanks-booking-custom.js");
booking.includes("your-tel=") && booking.includes("book_slot")
  ? pass("thanks-booking-custom.js", "tel + book_slot")
  : fail("thanks-booking-custom.js", "booking payload");

read("assets/js/thanks-booking-config.js").includes('THANKS_BOOKING_MODE = "custom"')
  ? pass("thanks-booking-config.js", "custom mode")
  : fail("thanks-booking-config.js", "not custom mode");

const failed = results.filter((r) => !r.ok);
console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
process.exit(failed.length ? 1 : 0);
