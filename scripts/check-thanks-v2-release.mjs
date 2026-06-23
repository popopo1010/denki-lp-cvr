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
  ["thanks-v2-shared.js?v=8", "shared v8 line click delegation + position"],
  ["thanks-page-context.js?v=27", "context v27 benefit-first hero"],
  ["thanks-page.css?v=56", "css v56 line-first hero CTA"],
  ["t-hero__eyebrow", "hero gift eyebrow"],
  ["fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700", "noto font 400+700"],
  ["rel=\"preload\" as=\"style\"", "non-blocking font preload"],
  ["thanks-job-preview.js?v=20", "job preview v20 intent auto + LINE CTA"],
  ["thanks-v2-deferred.js?v=17", "deferred bundle v17 LINE一本化 dock + 簡素化"],
  ["job-preview-hero", "hero gift card mount"],
  ["thanks-hero-gift-line", "hero gift line id"],
  ["t-hero--gift", "gift-first hero layout"],
  ["t-social-strip", "social proof strip"],
  ["thanks-social-meta", "social strip profile mount"],
  ["登録ありがとうございます", "thanks header copy"],
  ["3件、届きました", "benefit hero headline"],
  ["t-trust--footer", "trust bar in footer"],
  ["t-license-badge", "license badge"],
  ["t-sec-head", "section illustration head"],
  ["t-hero__reassure", "major-category objection one-liner"],
  ["しつこい営業は", "hero reassure copy（簡素化）"],
  ["t-hero--compact", "compact hero layout"],
  ["thanks-hero-title", "hero title id for name personalization"],
  ["あなた向けの非公開求人", "jobs section title（簡素化）"],
  ["t-jobs--first", "jobs section after social strip"],
  ["これから相談する方へ", "preview-experience testimonials title"],
  ["data-story-id=\"nw\"", "career inventory preview story"],
  ["cvr-story-mount", "ストーリーマウント"],
  ["非公開求人の全文", "非公開求人全文表記"],
  ["LINEで求人全文を受け取る", "LINE一本化CTA（求人全文ベネフィット）"],
  ["data-line-position=\"jobs\"", "jobs LINE CTA（カレンダー撤去→LINE一本化）"],
  ["t-hero__cta-wrap", "hero inline CTA block"],
  ["id=\"line-cta-hero\"", "hero LINE CTA"],
  ["data-line-position=\"dock\"", "dock LINE CTA position attr"],
  ["data-line-position=\"section\"", "section LINE CTA position attr"],
  ["id=\"line-next-step\"", "LINE開設後の確認コピー"],
  ["② いま開設できます", "LINE section open badge"],
  ["LINEで日程を調整", "LINE日程調整コピー（カレンダー撤去後の導線）"],
  ["N.Wさん（38歳）", "social strip NW default"],
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
  ["id=\"t-calendar\"", "日程調整カレンダー（LINE一本化で撤去）"],
  ["thanks-booking-bootstrap.js", "予約bootstrap読込（カレンダー撤去）"],
  ["thanks-booking-custom.js", "予約UI読込（カレンダー撤去）"],
  ["id=\"booking-slot-root\"", "予約枠マウント（カレンダー撤去）"],
  ["t-cal__toggle", "カレンダー開閉トグル（撤去）"],
  ["id=\"thanks-dock-book\"", "ドック予約CTA（LINE一本化で撤去）"],
  ["日時を選んで、最適な求人を受け取る", "旧予約CTA（LINE一本化）"],
  ["t-jobs__intent", "比べたい軸チップ（簡素化で撤去）"],
  ["比べたい軸", "比較軸コピー（簡素化で撤去）"],
  ["id=\"t-future\"", "未来セクション（簡素化で撤去）"],
  ["相場より高くてもOK", "相場比較の不適切表記（候補者向け是正）"],
  ["10分だけ話を聞く", "removed talk-first CTA"],
  ["本登録", "本登録表記"],
  ["仮登録完了", "仮登録表記（登録完了に統一）"],
  ["t-proof-strip", "removed redundant proof strip"],
  ["予約後に開きます", "LINEロック表記（LINE先行フローで廃止）"],
  ["LINEで全文を受け取る", "旧LINE CTA（受け取り口コピーに統一）"],
  [/プレビュー/, "プレビュー表記"],
];
forbidden.forEach(([needle, label]) => {
  const hit = typeof needle === "string" ? html.includes(needle) : needle.test(html);
  hit ? fail("HTML禁止", label) : pass("HTML禁止", `${label} なし`);
});

// LINE一本化: LINEセクションが求人概要より上（フロー②=LINE）
html.indexOf('id="line-section"') > 0 &&
html.indexOf('id="line-section"') < html.indexOf('id="t-jobs-preview"')
  ? pass("HTML順序", "LINEセクションが求人概要より上（LINE一本化）")
  : fail("HTML順序", "LINEセクションが求人概要より下にある");

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

// 予約枠はthanksページから撤去（LINE一本化）。backendは残るがthanks-v2のリリース可否はslot鮮度に依存しない。
// staff_count はバックエンド整合のため確認、future slots はデプロイ時 sync-booking-slots.js が更新するため情報表示に留める。
if (exists("assets/data/booking-slots.json")) {
  const slots = JSON.parse(read("assets/data/booking-slots.json"));
  const now = Date.now();
  const future = (slots.slots || []).filter((s) => new Date(s.start).getTime() > now);
  slots.staff_count === 4 ? pass("booking-slots", "staff_count=4") : fail("booking-slots", `staff=${slots.staff_count}`);
  console.log(`ℹ booking-slots: future slots=${future.length}（thanksページからは撤去済み・デプロイ時に更新）`);
} else {
  console.log("ℹ booking-slots.json なし（thanksページからは撤去済み）");
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
!pageCss.includes(".t-flow {") && !pageCss.includes(".t-hero__merit {")
  ? pass("css", "removed dead flow/merit blocks")
  : fail("css", "dead css blocks remain");

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
sharedJs.includes("fetchJson") && sharedJs.includes("prefetchThanksData")
  ? pass("shared.js", "json prefetch cache")
  : fail("shared.js", "fetchJson / prefetchThanksData missing");
!sharedJs.includes("ensureBookingScripts")
  ? pass("shared.js", "booking js eager in html")
  : fail("shared.js", "lazy booking loader should be removed");

const mobileUx = read("assets/js/thanks-mobile-ux.js");
!mobileUx.includes("t-calendar") && !mobileUx.includes("dkThanksMountBooking")
  ? pass("mobile-ux", "カレンダー制御を撤去（LINE一本化）")
  : fail("mobile-ux", "カレンダー/予約マウントのコードが残っている");
!mobileUx.includes("is-line-locked") && !mobileUx.includes("onLockedLineClick")
  ? pass("mobile-ux", "LINEロック撤廃（LINE一本化）")
  : fail("mobile-ux", "LINEロックのコードが残っている");
mobileUx.includes("applyLineClickedUi") && mobileUx.includes("thanks_line_cta_click")
  ? pass("mobile-ux", "LINEクリック後のドックUI更新（LINE常時表示）")
  : fail("mobile-ux", "LINEクリック後のドック更新が見当たらない");

const licenseJs = read("assets/js/thanks-license-profile.js");
licenseJs.includes("thanks_profile_ready")
  ? pass("license-profile.js", "profile ready event")
  : fail("license-profile.js", "missing thanks_profile_ready");
licenseJs.includes("requestIdleCallback")
  ? fail("license-profile.js", "profile should not idle-defer")
  : pass("license-profile.js", "eager profile load");

const bootstrapJs = read("assets/js/thanks-booking-bootstrap.js");
bootstrapJs.includes("dkThanksEnsureBookingSlots")
  ? pass("booking-bootstrap", "lazy slot fetch gate")
  : fail("booking-bootstrap", "dkThanksEnsureBookingSlots missing");

const bookingCustom = read("assets/js/thanks-booking-custom.js");
bookingCustom.includes("dkThanksMountBooking")
  ? pass("booking-custom", "lazy booking UI mount")
  : fail("booking-custom", "dkThanksMountBooking missing");
bookingCustom.includes("thanks_slot_select") &&
  bookingCustom.includes("thanks_booking_confirm_click") &&
  bookingCustom.includes("thanks_booking_error")
  ? pass("booking-custom", "funnel events (slot select / confirm / error)")
  : fail("booking-custom", "funnel events missing");
!bookingCustom.includes("booking-tel") &&
  !bookingCustom.includes("電話番号が取得できません")
  ? pass("booking-custom", "thanksで電話番号を再要求しない（telなしでも予約可）")
  : fail("booking-custom", "tel入力UI / tel必須デッドエンドが残っている");
bookingCustom.includes("booking-asap") &&
  bookingCustom.includes("thanks_booking_asap_click")
  ? pass("booking-custom", "いますぐ希望ワンタップ確保 + 計測")
  : fail("booking-custom", "asapボタン/計測が見当たらない");
read("gas-recorder/booking-custom.js").includes('getScriptProp("BOOKING_LEAD_HOURS") || "0"')
  ? pass("gas", "BOOKING_LEAD_HOURS 既定0（いますぐ枠）")
  : fail("gas", "BOOKING_LEAD_HOURS 既定が0でない");

sharedJs.includes("bindThanksLineClicks")
  ? pass("shared.js", "line click bind in shared")
  : fail("shared.js", "bindThanksLineClicks missing");
sharedJs.includes("line_cta_position") && sharedJs.includes("dk_line_clicked")
  ? pass("shared.js", "line click position + clicked flag")
  : fail("shared.js", "line_cta_position / dk_line_clicked missing");

const deferred = read("assets/js/thanks-v2-deferred.js");
!deferred.includes("thanks_page_view")
  ? pass("deferred", "no duplicate page view in bundle")
  : fail("deferred", "gtm page view dup should be removed");
deferred.includes("applySocialStrip") &&
  deferred.includes("thanks_profile_ready")
  ? pass("deferred", "social strip + license profile (bundled)")
  : fail("deferred", "missing bundled thanks modules");
!deferred.includes("t-calendar") && !deferred.includes("dkThanksMountBooking")
  ? pass("deferred", "カレンダー制御なし（LINE一本化）")
  : fail("deferred", "deferred にカレンダー制御が残っている");

const jobPreview = read("assets/js/thanks-job-preview.js");
jobPreview.includes("thanks-job-previews-") && jobPreview.includes("resolveDataUrl")
  ? pass("job-preview", "family-scoped preview json")
  : fail("job-preview", "family preview fetch missing");
jobPreview.includes("fetchJson")
  ? pass("job-preview", "shared json cache reuse")
  : fail("job-preview", "fetchJson reuse missing");
jobPreview.includes("t-job-card__facts") &&
  jobPreview.includes("resolveSalaryBand")
  ? pass("job-preview", "job facts cards (area / salary band)")
  : fail("job-preview", "job facts cards missing");
jobPreview.includes("applyDefaultIntent") &&
  jobPreview.includes("thanks_job_intent_auto")
  ? pass("job-preview", "willingness intent auto-select")
  : fail("job-preview", "willingness intent auto-select missing");
jobPreview.includes("cta_location")
  ? pass("job-preview", "CTA location analytics")
  : fail("job-preview", "CTA location analytics missing");
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

// deploy.yml の Verify deployment が HTML の ?v= と一致しているか（過去にズレてデプロイ検証だけ落ちた）
const deployFlat = deploy.replace(/\\/g, "");
[
  ["thanks-v2-deferred.js", /thanks-v2-deferred\.js\?v=(\d+)/],
  ["thanks-job-preview.js", /thanks-job-preview\.js\?v=(\d+)/],
  ["thanks-page.css", /thanks-page\.css\?v=(\d+)/]
].forEach(([label, re]) => {
  const htmlV = (html.match(re) || [])[1];
  const deployV = (deployFlat.match(re) || [])[1];
  htmlV && htmlV === deployV
    ? pass("deploy-verify", `${label} v=${htmlV} 一致`)
    : fail("deploy-verify", `${label}: html v=${htmlV} / deploy.yml v=${deployV} 不一致`);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
process.exit(failed.length ? 1 : 0);
