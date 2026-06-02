/**
 * Denki Suite — サービスサイト v3
 * - SP 固定 CTA
 * - 広告パラメータを CVR LP へ引き継ぎ
 * - GTM dataLayer（site_v3）
 */
(function () {
  "use strict";

  var UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "fbclid",
  ];

  var CVR_PATH_RE = /\/(denkikouji-v2|sekoukanri-denkisekou-v2)\//;

  function pushDataLayer(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }

  function pageView() {
    pushDataLayer({
      event: "ds_page_view",
      ds_brand: document.documentElement.getAttribute("data-brand") || "",
      ds_lp_id: window.__LP_ID || "",
      page_path: location.pathname,
    });
  }

  function mergeAdParamsIntoCvrLinks() {
    var incoming = new URLSearchParams(location.search);
    if (!incoming.toString()) return;

    document.querySelectorAll('a[href*="denkikouji-v2"], a[href*="sekoukanri-denkisekou-v2"]').forEach(function (link) {
      var url;
      try {
        url = new URL(link.getAttribute("href"), location.href);
      } catch (e) {
        return;
      }
      if (!CVR_PATH_RE.test(url.pathname)) return;

      UTM_KEYS.forEach(function (key) {
        var val = incoming.get(key);
        if (val) url.searchParams.set(key, val);
      });

      link.setAttribute("href", url.pathname + url.search);
    });
  }

  function trackCtaClicks() {
    document.addEventListener(
      "click",
      function (ev) {
        var anchor = ev.target && ev.target.closest ? ev.target.closest("a") : null;
        if (!anchor || !anchor.href) return;

        var isLine = anchor.classList.contains("ds-btn--line");
        var isPrimary = anchor.classList.contains("ds-btn--primary");
        var isCvr = CVR_PATH_RE.test(anchor.pathname || "");

        if (!isLine && !isPrimary && !isCvr) return;

        var url;
        try {
          url = new URL(anchor.href);
        } catch (e2) {
          return;
        }

        pushDataLayer({
          event: "ds_cta_click",
          ds_brand: document.documentElement.getAttribute("data-brand") || "",
          ds_lp_id: window.__LP_ID || "",
          ds_cta_type: isLine ? "line" : isPrimary ? "primary" : "cvr_link",
          link_url: url.pathname + url.search,
        });
      },
      true
    );
  }

  function initStickyCta() {
    var sticky = document.querySelector(".ds-sticky-cta");
    if (!sticky) return;

    var hero = document.querySelector(".ds-hero");
    var shown = false;

    function updateSticky() {
      var threshold = hero ? hero.offsetTop + hero.offsetHeight * 0.6 : 320;
      var shouldShow = window.scrollY > threshold;
      if (shouldShow === shown) return;
      shown = shouldShow;
      sticky.classList.toggle("is-visible", shouldShow);
      sticky.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    }

    window.addEventListener("scroll", updateSticky, { passive: true });
    updateSticky();
  }

  pageView();
  mergeAdParamsIntoCvrLinks();
  trackCtaClicks();
  initStickyCta();
})();
