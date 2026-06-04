#!/usr/bin/env node
/**
 * thanks-v2 リリース前静的チェック（ネットワーク不要）
 * Usage: node scripts/check-thanks-v2-release.mjs
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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const html = read("thanks-v2/index.html");

const requiredStrings = [
  ["thanks-v2-shared.js?v=2", "shared v2"],
  ["thanks-license-profile.js?v=2", "license profile v2"],
  ["thanks-page-context.js?v=17", "context v17"],
  ["thanks-section-visuals.js?v=2", "section visuals v2"],
  ["thanks-page.css?v=31", "css v31"],
  ["thanks-booking-bootstrap.js?v=15", "booking bootstrap v15 defer"],
  ["thanks-booking-custom.js?v=26", "booking custom v26 defer"],
  ["thanks-job-preview.js?v=14", "job preview v14 lazy"],
  ["thanks-v2-deferred.js?v=5", "deferred bundle v5"],
  ["t-license-badge", "license badge"],
  ["t-sec-head", "section illustration head"],
  ["t-hero__objections", "objection-killing pills"],
  ["t-cal__micro", "calendar reassurance microcopy"],
  ["t-hero__steps", "hero step list layout"],
  ["t-hero__cta", "hero primary booking CTA"],
  ["t-flow-diagram", "flow diagram html ja"],
  ["t-proof-strip", "social proof before calendar"],
  ["t-cal--primary", "calendar primary emphasis"],
  ["id=\"t-future\"", "未来セクション（折りたたみ）"],
  ["data-story-id", "転職ストーリー"],
  ["cvr-story-mount", "ストーリーマウント"],
  ["非公開求人の全文", "非公開求人全文表記"],
  ["LINEで全文を受け取る", "LINE CTA"],
  ["概要</strong>を見る", "plain language hero step"],
  ["いま日時を選ぶ", "outcome-focused CTA"],
  ["見るだけOK", "低ハードル文言"]
];

requiredStrings.forEach(([needle, label]) => {
  html.includes(needle) ? pass("HTML", label) : fail("HTML", `missing ${label}`);
});

const forbidden = [
  ["thanks-calendar.css", "calendar css link（page.cssに統合）"],
  ["thanks-testimonial-stories.json\" as=\"fetch\"", "stories preload（遅延取得）"],
  ["thanks-job-previews.json\" as=\"fetch\"", "job previews preload（ビューポート近傍で取得）"],
  ["thanks-gtm.js", "gtm 単体（bundle化）"],
  ["本登録", "本登録表記"],
  ["仮登録完了", "仮登録表記（登録完了に統一）"],
  [/プレビュー/, "プレビュー表記"]
];
forbidden.forEach(([needle, label]) => {
  const hit = typeof needle === "string" ? html.includes(needle) : needle.test(html);
  hit ? fail("HTML禁止", label) : pass("HTML禁止", `${label} なし`);
});

const storyIds = (html.match(/data-story-id="/g) || []).length;
storyIds === 8 ? pass("ストーリー", "8 cards") : fail("ストーリー", `count=${storyIds}`);

if (exists("assets/data/thanks-testimonial-stories.json")) {
  const stories = JSON.parse(read("assets/data/thanks-testimonial-stories.json"));
  const keys = Object.keys(stories.stories || {});
  keys.length === 8 ? pass("stories.json", "8 entries") : fail("stories.json", `count=${keys.length}`);
} else {
  fail("stories.json", "missing file");
}

if (exists("assets/data/booking-slots.json")) {
  const slots = JSON.parse(read("assets/data/booking-slots.json"));
  const now = Date.now();
  const future = (slots.slots || []).filter((s) => new Date(s.start).getTime() > now);
  slots.staff_count === 4 ? pass("booking-slots", "staff_count=4") : fail("booking-slots", `staff=${slots.staff_count}`);
  future.length > 0 ? pass("booking-slots", `future slots=${future.length}`) : fail("booking-slots", "no future slots");
} else {
  fail("booking-slots.json", "missing");
}

[
  "assets/js/thanks-v2-shared.js",
  "assets/js/thanks-v2-deferred.js",
  "assets/js/thanks-page-context.js",
  "assets/js/thanks-section-visuals.js",
  "assets/js/thanks-license-profile.js",
  "assets/data/thanks-license-profiles.json"
].forEach((f) => (exists(f) ? pass("asset", f) : fail("asset", `missing ${f}`)));

const licenseProfiles = JSON.parse(read("assets/data/thanks-license-profiles.json"));
const profileIds = Object.keys(licenseProfiles.profiles || {});
profileIds.length >= 10
  ? pass("license-profiles", `${profileIds.length} profiles`)
  : fail("license-profiles", `count=${profileIds.length}`);

["denki_2", "kentiku_1", "sekoukanri_lp"].forEach((id) => {
  exists(`thanks-v2/p/${id}/index.html`)
    ? pass("license-page", `thanks-v2/p/${id}/`)
    : fail("license-page", `missing thanks-v2/p/${id}/`);
});

const licenseJs = read("assets/js/thanks-license-profile.js");
licenseJs.includes("thanks_profile_ready")
  ? pass("license-profile.js", "profile ready event")
  : fail("license-profile.js", "missing thanks_profile_ready");

const pageCss = read("assets/css/thanks-page.css");
pageCss.includes("thanks-calendar merged")
  ? pass("css", "calendar merged into page.css")
  : fail("css", "calendar not merged");
pageCss.includes("visuals v26")
  ? pass("css", "visuals v26 section icons")
  : fail("css", "visuals v26 block missing");

const testimonials = read("assets/js/thanks-testimonials.js");
testimonials.includes("limitVisibleTestimonials")
  ? pass("testimonials", "collapse extra stories after 3")
  : fail("testimonials", "limitVisibleTestimonials missing");

const jobPreview = read("assets/js/thanks-job-preview.js");
jobPreview.includes("t-job-card__facts") &&
  jobPreview.includes("resolveSalaryBand")
  ? pass("job-preview", "job facts cards (area / salary band)")
  : fail("job-preview", "job facts cards missing");
jobPreview.includes("IntersectionObserver")
  ? pass("job-preview", "lazy load near viewport")
  : fail("job-preview", "IntersectionObserver lazy load missing");

const deploy = read(".github/workflows/deploy.yml");
deploy.includes("build-thanks-v2-deferred.mjs")
  ? pass("deploy", "deferred bundle build step")
  : fail("deploy", "add build-thanks-v2-deferred.mjs to deploy.yml");
deploy.includes("sync-thanks-v2-mirrors.mjs")
  ? pass("deploy", "mirrors + license pages sync step")
  : fail("deploy", "add sync-thanks-v2-mirrors.mjs to deploy.yml");

const failed = results.filter((r) => !r.ok);
console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
process.exit(failed.length ? 1 : 0);
