/** thanks-v2 deferred bundle — edit parts in assets/js/, then: node scripts/build-thanks-v2-deferred.mjs */
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

/**
 * LINE CTA クリック → GAS へ sendBeacon（Slack/スプシ連携用）
 */
(function () {
  "use strict";
  var dk = window.dkThanks || {};
  var GAS_URL = dk.GAS_URL || window.LP_BOOKING_GAS_URL || "";
  if (!GAS_URL) return;

  var tel = dk.getTel ? dk.getTel() : "";
  var lineNotifiedOnce = false;

  function notifyLineClick() {
    if (lineNotifiedOnce || !tel) return;
    lineNotifiedOnce = true;
    var p = new URLSearchParams();
    p.append("_event", "line_click");
    p.append("your-tel", tel);
    var lpId = "thanks";
    try {
      lpId =
        sessionStorage.getItem("_lp") ||
        new URLSearchParams(location.search).get("lp") ||
        lpId;
    } catch (e2) {}
    p.append("_lp", lpId);
    p.append("_page", location.href);
    var body = p.toString();
    var blob = new Blob([body], {
      type: "application/x-www-form-urlencoded;charset=UTF-8"
    });
    if (!(navigator.sendBeacon && navigator.sendBeacon(GAS_URL, blob))) {
      fetch(GAS_URL, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        body: body
      }).catch(function () {});
    }
  }

  var lineBtn = document.getElementById("line-cta");
  if (lineBtn) lineBtn.addEventListener("click", notifyLineClick);
})();

(function () {
  var STORIES_URL =
    (window.dkThanks && window.dkThanks.assetUrl
      ? window.dkThanks.assetUrl("data/thanks-testimonial-stories.json")
      : null) || "../assets/data/thanks-testimonial-stories.json";
  var storiesCache = null;
  var storiesPromise = null;

  function setOpen(wrap, open) {
    var btn = wrap.querySelector(".cvr-testimonial__toggle");
    var body = wrap.querySelector(".cvr-testimonial__body");
    if (!btn || !body) return;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    body.hidden = !open;
    wrap.classList.toggle("is-open", open);
  }

  function esc(s) {
    var dk = window.dkThanks;
    if (dk && dk.esc) return dk.esc(s);
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderStory(story) {
    if (!story) return "";
    var needs = (story.needs || [])
      .map(function (n) {
        return '<span class="cvr-story__need">' + esc(n) + "</span>";
      })
      .join("");
    return (
      '<div class="cvr-story">' +
      '<p class="cvr-story__lead-label">転職の背景・ニーズ</p>' +
      '<div class="cvr-story__needs">' +
      needs +
      "</div>" +
      '<p class="cvr-story__text">' +
      esc(story.text) +
      "</p>" +
      "</div>"
    );
  }

  function mountStories(stories) {
    if (!stories) return;
    document.querySelectorAll(".cvr-testimonial[data-story-id]").forEach(function (card) {
      var id = card.getAttribute("data-story-id");
      var mount = card.querySelector(".cvr-story-mount");
      var story = stories[id];
      if (!mount || !story || mount.dataset.storyMounted) return;
      mount.innerHTML = renderStory(story);
      mount.dataset.storyMounted = "1";
    });
  }

  function loadStories() {
    if (storiesCache) return Promise.resolve(storiesCache);
    if (storiesPromise) return storiesPromise;
    storiesPromise = fetch(STORIES_URL, { credentials: "same-origin", cache: "default" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        storiesCache = (json && json.stories) || null;
        return storiesCache;
      })
      .catch(function () {
        return null;
      });
    return storiesPromise;
  }

  function ensureStoriesMounted() {
    return loadStories().then(function (stories) {
      if (stories) mountStories(stories);
      return stories;
    });
  }

  document.querySelectorAll(".cvr-testimonial__more").forEach(function (wrap) {
    var btn = wrap.querySelector(".cvr-testimonial__toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var opening = btn.getAttribute("aria-expanded") !== "true";
      if (opening) {
        ensureStoriesMounted().finally(function () {
          setOpen(wrap, true);
        });
        return;
      }
      setOpen(wrap, false);
    });
  });

  function applyLicenseProfile(profile) {
    var root = document.querySelector(".cvr-testimonials--rich");
    if (!root || !profile) return;

    var cards = Array.from(root.querySelectorAll(".cvr-testimonial"));
    var byStory = {};
    cards.forEach(function (card) {
      byStory[card.getAttribute("data-story-id")] = card;
    });

    cards.forEach(function (card) {
      card.style.display = "";
      card.classList.remove("cvr-testimonial--featured", "cvr-testimonial--match");
    });

    (profile.hidden_stories || []).forEach(function (id) {
      if (byStory[id]) byStory[id].style.display = "none";
    });

    var order = [];
    if (profile.featured_story) order.push(profile.featured_story);
    (profile.story_order || []).forEach(function (id) {
      if (order.indexOf(id) === -1) order.push(id);
    });

    var anchor =
      root.querySelector(".cvr-testimonials__filter") ||
      root.querySelector(".cvr-testimonials__summary");

    order.forEach(function (id) {
      var card = byStory[id];
      if (!card || card.style.display === "none") return;
      if (id === profile.featured_story) {
        card.classList.add("cvr-testimonial--featured");
      }
      card.classList.add("cvr-testimonial--match");
      if (anchor) {
        anchor.insertAdjacentElement("afterend", card);
        anchor = card;
      }
    });

    cards.forEach(function (card) {
      if (card.style.display === "none") return;
      if (order.indexOf(card.getAttribute("data-story-id")) >= 0) return;
      if (anchor) {
        anchor.insertAdjacentElement("afterend", card);
        anchor = card;
      }
    });

    var filterNote = root.querySelector(".cvr-testimonials__filter");
    if (!filterNote) {
      filterNote = document.createElement("p");
      filterNote.className = "cvr-testimonials__filter";
      var summary = root.querySelector(".cvr-testimonials__summary");
      if (summary) summary.insertAdjacentElement("afterend", filterNote);
      else root.insertBefore(filterNote, cards[0] || null);
    }
    filterNote.textContent =
      "ご登録の「" + (profile.label || "資格") + "」に近い事例を先に表示しています";
    filterNote.hidden = !profile.label;

    limitVisibleTestimonials(root);
  }

  function limitVisibleTestimonials(root) {
    if (!root) return;
    root.querySelectorAll(".cvr-testimonials__more-btn").forEach(function (b) {
      b.remove();
    });
    root.querySelectorAll(".cvr-testimonial--extra").forEach(function (c) {
      c.classList.remove("cvr-testimonial--extra");
    });
    var visible = Array.from(root.querySelectorAll(".cvr-testimonial")).filter(function (c) {
      return c.style.display !== "none";
    });
    if (visible.length <= 3) return;
    var hiddenCount = visible.length - 3;
    visible.forEach(function (card, i) {
      if (i >= 3) card.classList.add("cvr-testimonial--extra");
    });
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cvr-testimonials__more-btn";
    btn.textContent = "他の体験談を見る（" + hiddenCount + "件）";
    btn.addEventListener("click", function () {
      visible.forEach(function (c) {
        c.classList.remove("cvr-testimonial--extra");
      });
      btn.remove();
    });
    root.appendChild(btn);
  }

  function initTestimonials() {
    if (window.dkThanksWhenProfileReady) {
      window.dkThanksWhenProfileReady(applyLicenseProfile);
    } else if (window.dkThanksLicenseProfile) {
      applyLicenseProfile(window.dkThanksLicenseProfile);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTestimonials);
  } else {
    initTestimonials();
  }
})();

/**
 * thanks-v2: スマホUX（フロー表示・スティッキーCTA・予約→LINEゲート）
 */
(function () {
  "use strict";

  var dock = document.getElementById("thanks-dock");
  var flowItems = document.querySelectorAll(".t-flow__item");
  var body = document.body;
  var lineCta = document.getElementById("line-cta");
  var dockLine = document.getElementById("thanks-dock-line");
  var dockBook = document.getElementById("thanks-dock-book");
  var lineGateMsg = document.getElementById("line-gate-msg");
  var lineBadge = document.getElementById("line-section-badge");

  function scrollToTarget(sel) {
    var el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindScrollTriggers(root) {
    (root || document).querySelectorAll("[data-scroll-target]").forEach(function (btn) {
      if (btn._dkScrollBound) return;
      btn._dkScrollBound = true;
      btn.addEventListener("click", function () {
        scrollToTarget(btn.getAttribute("data-scroll-target"));
      });
    });
  }

  function isLineUnlocked() {
    return (
      body.classList.contains("is-booked") ||
      body.classList.contains("is-line-unlocked")
    );
  }

  function onLockedLineClick(e) {
    if (isLineUnlocked()) return;
    e.preventDefault();
    e.stopPropagation();
    scrollToTarget("#t-calendar");
    if (lineGateMsg) {
      lineGateMsg.classList.add("is-nudge");
      setTimeout(function () {
        lineGateMsg.classList.remove("is-nudge");
      }, 1200);
    }
  }

  function lockLineStep() {
    if (isLineUnlocked()) return;
    body.classList.add("is-line-locked");
    if (lineCta) {
      lineCta.setAttribute("aria-disabled", "true");
      lineCta.addEventListener("click", onLockedLineClick, true);
    }
    if (dockLine) {
      dockLine.setAttribute("aria-disabled", "true");
      dockLine.hidden = true;
    }
    if (dockBook) dockBook.hidden = false;
  }

  function unlockLineStep() {
    body.classList.remove("is-line-locked");
    body.classList.add("is-line-unlocked");
    if (lineCta) {
      lineCta.removeAttribute("aria-disabled");
      lineCta.removeEventListener("click", onLockedLineClick, true);
    }
    if (lineBadge) lineBadge.textContent = "③ 今すぐ — 全文の受取口";
    if (dockLine) {
      dockLine.hidden = false;
      dockLine.removeAttribute("aria-disabled");
    }
    if (dockBook) dockBook.hidden = true;
  }

  window.dkThanksUnlockLine = unlockLineStep;
  window.dkThanksRelockLine = lockLineStep;

  function updateDock() {
    if (!dock) return;
    dock.classList.add("is-visible");
    dock.hidden = false;
    body.classList.add("is-dock-visible");
  }

  function updateFlowActive() {
    if (!flowItems.length) return;
    var sections = [
      { id: "t-jobs-preview", step: "1" },
      { id: "t-calendar", step: "2" },
      { id: "line-section", step: "3" }
    ];
    var scrollY = (window.scrollY || 0) + 120;
    var current = sections[0].step;
    sections.forEach(function (s) {
      var el = document.getElementById(s.id);
      if (el && el.offsetTop <= scrollY) current = s.step;
    });
    flowItems.forEach(function (item) {
      var step = item.getAttribute("data-step");
      item.classList.toggle("is-active", step === current);
      item.classList.toggle(
        "is-done",
        step && parseInt(step, 10) < parseInt(current, 10)
      );
    });
  }

  function onScroll() {
    updateDock();
    updateFlowActive();
  }

  bindScrollTriggers(document);
  if (dock) {
    bindScrollTriggers(dock);
    if (lineCta && dockLine) {
      dockLine.href = lineCta.href;
      dockLine.addEventListener("click", function (e) {
        if (!isLineUnlocked()) {
          onLockedLineClick(e);
          return;
        }
        lineCta.click();
      });
    }
  }

  flowItems.forEach(function (item) {
    item.addEventListener("click", function (e) {
      var href = item.getAttribute("href");
      if (!href || href.charAt(0) !== "#") return;
      if (href === "#line-section" && !isLineUnlocked()) {
        e.preventDefault();
        scrollToTarget("#t-calendar");
        return;
      }
      e.preventDefault();
      scrollToTarget(href);
    });
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("thanks_line_unlocked", unlockLineStep);
  if (body.classList.contains("is-booked")) {
    unlockLineStep();
  } else {
    lockLineStep();
  }
  onScroll();

  document.addEventListener("thanks_job_preview_refresh", onScroll);
})();
