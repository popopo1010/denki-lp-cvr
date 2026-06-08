/**
 * thanks-v2 GTM（dk_lp main.js と同じ qualified / conversion ルール）
 */
(function () {
  var dk = window.dkThanks || {};
  var LEAD_SESSION_KEY = "dk_lp_lead_v1";
  var LEAD_SESSION_TTL_MS = 30 * 60 * 1000;
  var CONVERSION_FIRED_KEY = "dk_lp_conversion_fired";

  function pushDL(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }

  function isQualified() {
    try {
      var raw = sessionStorage.getItem(LEAD_SESSION_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      return !!(data && data.lp && Date.now() - data.ts < LEAD_SESSION_TTL_MS);
    } catch (e) {
      return false;
    }
  }

  function getLpSlug() {
    if (dk.getLpSlug) {
      var slug = dk.getLpSlug();
      return slug || "unknown";
    }
    return "unknown";
  }

  var qualified = isQualified();
  var lpSlug = getLpSlug();

  pushDL({
    event: "thanks_page_view",
    lp_slug: lpSlug,
    thanks_qualified: qualified,
    page_location: location.href,
    page_path: location.pathname,
    page_type: "thanks-v2"
  });

  // 既存 GTM GA4 タグ（thanks_pageview）との互換
  pushDL({
    event: "thanks_pageview",
    lp_slug: lpSlug,
    thanks_qualified: qualified,
    page_location: location.href,
    page_path: location.pathname,
    page_type: "thanks-v2"
  });

  pushDL({ event: "form_complete", page_type: "thanks-v2" });

  pushDL({
    event: "thanks_provisional_registration",
    lp_slug: lpSlug,
    thanks_qualified: qualified,
    page_type: "thanks-v2"
  });

  if (qualified) {
    try {
      if (!sessionStorage.getItem(CONVERSION_FIRED_KEY)) {
        sessionStorage.setItem(CONVERSION_FIRED_KEY, "1");
        pushDL({
          event: "lead_conversion",
          lp_slug: lpSlug,
          conversion_source: "lp_form"
        });
      }
    } catch (e3) {}
  }

  function onLineClick() {
    var payload = {
      lp_slug: lpSlug,
      thanks_qualified: qualified,
      registration_step: "line_friend_add",
      page_type: "thanks-v2"
    };
    pushDL(Object.assign({ event: "thanks_line_click" }, payload));
    pushDL(Object.assign({ event: "thanks_full_registration_click" }, payload));
  }

  document
    .querySelectorAll('a[href*="lin.ee"], a[href*="line.me"], #line-cta')
    .forEach(function (link) {
      link.addEventListener("click", onLineClick);
    });
})();
