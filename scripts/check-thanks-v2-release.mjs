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
  ["thanks-v2-shared.js?v=3", "shared v3 early page events"],
  ["thanks-page-context.js?v=27", "context v27 benefit-first hero"],
  ["thanks-page.css?v=46", "css v46 preview story copy pass"],
  ["t-hero__eyebrow", "hero gift eyebrow"],
  ["fonts.googleapis.com/css2?family=Noto+Sans+JP", "noto font"],
  ["rel=\"preload\" as=\"style\"", "non-blocking font preload"],
  ["thanks-booking-bootstrap.js?v=17", "booking bootstrap v17 lazy slots"],
  ["thanks-booking-custom.js?v=31", "booking custom v31 benefit CTA"],
  ["thanks-job-preview.js?v=17", "job preview v17 family json"],
  ["thanks-v2-deferred.js?v=7", "deferred bundle v7 expanded"],
  ["job-preview-hero", "hero gift card mount"],
  ["thanks-hero-gift-line", "hero gift line id"],
  ["t-hero--gift", "gift-first hero layout"],
  ["t-social-strip", "social proof strip"],
  ["thanks-social-meta", "social strip profile mount"],
  ["t-cal__toggle", "calendar collapse toggle"],
  ["id=\"t-cal-panel\"", "calendar collapse panel"],
  ["登録ありがとうございます", "thanks header copy"],
  ["3件、届きました", "benefit hero headline"],
  ["t-trust--footer", "trust bar in footer"],
  ["t-license-badge", "license badge"],
  ["t-sec-head", "section illustration head"],
  ["t-hero__reassure", "major-category objection one-liner"],
  ["当社では当てはまりません", "hero reassure copy"],
  ["t-cal__micro", "calendar reassurance microcopy"],
  ["t-hero--compact", "compact hero layout"],
  ["thanks-hero-title", "hero title id for name personalization"],
  ["残り2件も", "jobs section rest title"],
  ["あと1ステップ", "calendar benefit step label"],
  ["希望条件を伝える日時を選ぶ", "calendar benefit headline"],
  ["t-jobs--first", "jobs section after social strip"],
  ["1回だけ", "outbound call reassurance"],
  ["しつこい勧誘はありません", "no hard-sell outbound copy"],
  ["t-cal--primary", "calendar primary emphasis"],
  ["id=\"t-future\"", "未来セクション（折りたたみ）"],
  ["これから相談する方へ", "preview-experience testimonials title"],
  ["data-story-id=\"nw\"", "career inventory preview story"],
  ["cvr-story-mount", "ストーリーマウント"],
  ["非公開求人の全文", "非公開求人全文表記"],
  ["LINEで全文を受け取る", "LINE CTA"],
  ["希望条件を伝えて、最適な求人を受け取る", "benefit-first primary CTA"],
  ["プレミアム案内", "premium offer subcopy"],
  ["見るだけOK", "低ハードル文言"],
];

requiredStrings.forEach(([needle, label]) => {
  html.includes(needle) ? pass("HTML", label) : fail("HTML", `missing ${label}`);
});

const forbidden = [
  ["t-hero__merit", "removed hero merit grid"],
  ["t-flow-diagram", "removed flow diagram block"],
  ['class="t-flow"', "removed flow nav"],
  ["thanks-hero-stats", "removed hero stats grid"],
  ["t-hero__route", "removed hero route copy"],
  ["まず下の", "date-first hero route"],
  ["thanks-calendar.css", "calendar css link（page.cssに統合）"],
  ["thanks-testimonial-stories.json\" as=\"fetch\"", "stories preload（遅延取得）"],
  ["thanks-job-previews.json\" as=\"fetch\"", "job previews preload（ビューポート近傍で取得）"],
  ["thanks-gtm.js", "gtm 単体（bundle化）"],
  ["thanks-license-profile.js", "license profile 単体（deferred bundle化）"],
  ["thanks-section-visuals.js", "section visuals 単体（deferred bundle化）"],
  ["booking-slots.json\" as=\"fetch\"", "booking slots preload（カレンダー展開時取得）"],
  ["10分だけ話を聞く", "removed talk-first CTA"],
  ["本登録", "本登録表記"],
  ["仮登録完了", "仮登録表記（登録完了に統一）"],
  ["t-proof-strip", "removed redundant proof strip"],
  [/プレビュー/, "プレビュー表記"],
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
  keys.length === 8 && keys.includes("nw")
    ? pass("stories.json", "8 entries incl. nw preview")
    : fail("stories.json", `count=${keys.length} keys=${keys.join(",")}`);
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

pageCss.includes("t-cal__toggle")
  ? pass("css", "calendar collapse toggle styles")
  : fail("css", "t-cal__toggle styles missing");

const testimonials = read("assets/js/thanks-testimonials.js");
testimonials.includes("applySocialStrip")
  ? pass("testimonials", "license-matched social strip")
  : fail("testimonials", "applySocialStrip missing");
testimonials.includes("limitVisibleTestimonials")
  ? pass("testimonials", "collapse extra stories after 3")
  : fail("testimonials", "limitVisibleTestimonials missing");
testimonials.includes("cvr-story__para")
  ? pass("testimonials", "story paragraph breaks")
  : fail("testimonials", "cvr-story__para missing");

const sharedJs = read("assets/js/thanks-v2-shared.js");
sharedJs.includes("fireThanksPageEvents")
  ? pass("shared.js", "early thanks page events")
  : fail("shared.js", "fireThanksPageEvents missing");

const bootstrapJs = read("assets/js/thanks-booking-bootstrap.js");
bootstrapJs.includes("dkThanksEnsureBookingSlots")
  ? pass("booking-bootstrap", "lazy slot fetch gate")
  : fail("booking-bootstrap", "dkThanksEnsureBookingSlots missing");

const bookingCustom = read("assets/js/thanks-booking-custom.js");
bookingCustom.includes("dkThanksMountBooking")
  ? pass("booking-custom", "lazy booking UI mount")
  : fail("booking-custom", "dkThanksMountBooking missing");

const deferred = read("assets/js/thanks-v2-deferred.js");
deferred.includes("applySocialStrip") &&
  deferred.includes("dkThanksExpandCalendar") &&
  deferred.includes("thanks_profile_ready")
  ? pass("deferred", "social strip + calendar + license profile")
  : fail("deferred", "missing bundled thanks modules");

const jobPreview = read("assets/js/thanks-job-preview.js");
jobPreview.includes("thanks-job-previews-") && jobPreview.includes("resolveDataUrl")
  ? pass("job-preview", "family-scoped preview json")
  : fail("job-preview", "family preview fetch missing");
jobPreview.includes("t-job-card__facts") &&
  jobPreview.includes("resolveSalaryBand")
  ? pass("job-preview", "job facts cards (area / salary band)")
  : fail("job-preview", "job facts cards missing");
jobPreview.includes("IntersectionObserver")
  ? pass("job-preview", "lazy load near viewport")
  : fail("job-preview", "IntersectionObserver lazy load missing");

["denki", "sekoukanri"].forEach((family) => {
  exists(`assets/data/thanks-job-previews-${family}.json`)
    ? pass("job-previews", `family json ${family}`)
    : fail("job-previews", `missing thanks-job-previews-${family}.json`);
});

const deploy = read(".github/workflows/deploy.yml");
deploy.includes("build-thanks-job-previews-family.mjs")
  ? pass("deploy", "family job preview build step")
  : fail("deploy", "add build-thanks-job-previews-family.mjs to deploy.yml");
deploy.includes("build-thanks-v2-deferred.mjs")
  ? pass("deploy", "deferred bundle build step")
  : fail("deploy", "add build-thanks-v2-deferred.mjs to deploy.yml");
deploy.includes("sync-thanks-v2-mirrors.mjs")
  ? pass("deploy", "mirrors + license pages sync step")
  : fail("deploy", "add sync-thanks-v2-mirrors.mjs to deploy.yml");

const failed = results.filter((r) => !r.ok);
console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
process.exit(failed.length ? 1 : 0);
