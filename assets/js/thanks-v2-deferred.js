/** thanks-v2 deferred bundle — edit parts in assets/js/, then: node scripts/build-thanks-v2-deferred.mjs */
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

  // shared.js の委譲計測が hero / section / dock / 予約完了カードの全LINEリンクで発火する
  document.addEventListener("thanks_line_cta_click", notifyLineClick);
  var lineBtn = document.getElementById("line-cta");
  if (lineBtn) lineBtn.addEventListener("click", notifyLineClick);
})();

/**
 * thanks-v2: 登録資格 / LP slug からプロファイルを解決し、ページを資格別に最適化
 */
(function () {
  "use strict";

  var DATA_URL =
    (window.dkThanks && window.dkThanks.assetUrl
      ? window.dkThanks.assetUrl("data/thanks-license-profiles.json")
      : null) || "../assets/data/thanks-license-profiles.json";
  var dk = window.dkThanks || {};

  function readLicense() {
    try {
      var lic = sessionStorage.getItem("_license") || "";
      if (lic) return lic.trim();
    } catch (e1) {}
    try {
      var raw = sessionStorage.getItem("dk_lead_profile");
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.license) return String(p.license).trim();
      }
    } catch (e2) {}
    return "";
  }

  function readLpSlug() {
    if (dk.getLpSlug) return dk.getLpSlug();
    try {
      return sessionStorage.getItem("_lp") || "";
    } catch (e) {
      return "";
    }
  }

  function readProfileHint() {
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get("dk_profile")) return qs.get("dk_profile");
    } catch (e0) {}
    var m = location.pathname.match(/\/thanks-v2\/p\/([^/]+)\/?/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function licenseMatches(license, patterns) {
    if (!license || !patterns || !patterns.length) return false;
    var lic = String(license);
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (!p) continue;
      if (lic === p) return true;
      if (p.length >= 3 && (lic.indexOf(p) >= 0 || p.indexOf(lic) >= 0)) return true;
    }
    return false;
  }

  function resolveProfile(data) {
    var profiles = data.profiles || {};
    var fallbackId = data.fallback_profile || "denki_lp";
    var hint = readProfileHint();
    if (hint && profiles[hint]) return profiles[hint];

    var license = readLicense();
    var slug = readLpSlug();
    var keys = Object.keys(profiles);
    var i;

    for (i = 0; i < keys.length; i++) {
      if (licenseMatches(license, profiles[keys[i]].license_match)) {
        return profiles[keys[i]];
      }
    }

    for (i = 0; i < keys.length; i++) {
      var slugs = profiles[keys[i]].lp_slugs || [];
      if (slug && slugs.indexOf(slug) >= 0) return profiles[keys[i]];
    }

    return profiles[fallbackId] || profiles.denki_lp;
  }

  function applyDom(profile) {
    if (!profile) return;
    document.documentElement.setAttribute("data-thanks-profile", profile.id || "");
    if (profile.label) {
      document.documentElement.setAttribute("data-thanks-license", profile.label);
    }

    var tTitle = document.querySelector(".cvr-testimonials__title");
    var tLead = document.querySelector(".cvr-testimonials__lead");
    if (tTitle && profile.testimonials_title) tTitle.textContent = profile.testimonials_title;
    if (tLead && profile.testimonials_lead) tLead.innerHTML = profile.testimonials_lead;

    var jobsTitle = document.getElementById("t-jobs-title");
    if (jobsTitle && profile.jobs_title) jobsTitle.textContent = profile.jobs_title;

    var jobsLead = document.querySelector(".t-jobs__lead");
    if (jobsLead && profile.comparison_line) {
      var base =
        "登録内容に合う求人の概要を、先にお見せします。";
      jobsLead.innerHTML =
        base +
        profile.comparison_line +
        "。全文は<strong>10分の電話後</strong>にお送りします。";
    }

    window.dkThanksLicenseProfile = profile;
    try {
      document.dispatchEvent(
        new CustomEvent("thanks_profile_ready", { detail: profile })
      );
    } catch (eEv) {}
  }

  function boot(data) {
    var profile = resolveProfile(data);
    applyDom(profile);
    window.__dkThanksProfileReady = true;
    return profile;
  }

  window.dkThanksWhenProfileReady = function (fn) {
    if (window.dkThanksLicenseProfile) {
      fn(window.dkThanksLicenseProfile);
      return;
    }
    document.addEventListener("thanks_profile_ready", function handler(ev) {
      document.removeEventListener("thanks_profile_ready", handler);
      fn((ev && ev.detail) || window.dkThanksLicenseProfile);
    });
  };

  function loadProfile() {
    var load = dk.fetchJson
      ? dk.fetchJson("data/thanks-license-profiles.json")
      : fetch(DATA_URL, { credentials: "same-origin", cache: "default" }).then(
          function (res) {
            return res.ok ? res.json() : null;
          }
        );
    load
      .then(function (data) {
        if (data) boot(data);
      })
      .catch(function () {});
  }

  loadProfile();
})();

/**
 * thanks-v2: セクション見出し・資格バッジ・ステップ／チップのアイコン
 */
(function () {
  "use strict";

  var LICENSE_ILLUS = {
    denki:
      '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#eef2fa"/><path d="M26 8L16 26h7l-3 14 14-22h-8l4-10z" fill="#f59e0b" stroke="#d97706" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    denki_sekou:
      '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#eef2fa"/><rect x="14" y="12" width="20" height="26" rx="3" fill="#fff" stroke="#314c85" stroke-width="1.5"/><path d="M18 18h12M18 23h12M18 28h8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/><path d="M30 10l-6 8h4l-2 10 8-12h-5l1-6z" fill="#f59e0b"/></svg>',
    denki_shunin:
      '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#eef2fa"/><circle cx="24" cy="22" r="10" fill="none" stroke="#314c85" stroke-width="2"/><path d="M24 12v4M24 28v4M16 22h-4M32 22h4" stroke="#314c85" stroke-width="2" stroke-linecap="round"/><path d="M26 8L18 22h5l-2 12 11-16h-6l0-10z" fill="#f59e0b"/></svg>',
    kentiku:
      '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#eef2fa"/><path d="M12 34V18l12-8 12 8v16" fill="#fff" stroke="#314c85" stroke-width="1.5" stroke-linejoin="round"/><path d="M18 34v-8h4v8M26 34v-12h4v12" fill="#cbd5e1"/></svg>',
    doboku:
      '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#eef2fa"/><path d="M10 32h28" stroke="#64748b" stroke-width="2" stroke-linecap="round"/><path d="M14 32l4-14h12l4 14" fill="#fff" stroke="#314c85" stroke-width="1.5" stroke-linejoin="round"/><circle cx="20" cy="32" r="3" fill="#f59e0b"/></svg>',
    sekoukanri:
      '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#e8f5e9"/><path d="M16 32c0-6 3.5-10 8-10s8 4 8 10" fill="#fff" stroke="#1b5e20" stroke-width="1.5"/><path d="M20 22h8l2 6H18l2-6z" fill="#2e7d32"/><rect x="17" y="14" width="14" height="6" rx="2" fill="#1b5e20"/></svg>'
  };

  var INTENT_ICONS = {
    salary:
      '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#eef2fa"/><text x="10" y="14" text-anchor="middle" font-size="11" font-weight="800" fill="#314c85">¥</text></svg>',
    area:
      '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 2C7 8 4 9 4 13a6 6 0 0 0 12 0c0-4-3-5-6-11z" fill="#eef2fa" stroke="#314c85" stroke-width="1.2"/><circle cx="10" cy="13" r="2" fill="#314c85"/></svg>',
    stable:
      '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="3" y="8" width="14" height="9" rx="2" fill="#eef2fa" stroke="#314c85" stroke-width="1.2"/><path d="M6 8V6a4 4 0 0 1 8 0v2" fill="none" stroke="#314c85" stroke-width="1.2"/></svg>',
    private:
      '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2" fill="#eef2fa" stroke="#314c85" stroke-width="1.2"/><path d="M7 9V7a3 3 0 0 1 6 0v2" fill="none" stroke="#314c85" stroke-width="1.2"/><circle cx="10" cy="13" r="1.5" fill="#314c85"/></svg>'
  };

  var STEP_ICONS = [
    '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="3" y="2" width="14" height="16" rx="2" fill="#fff" stroke="#314c85" stroke-width="1.2"/><path d="M6 7h8M6 10h8M6 13h5" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="5" y="3" width="10" height="14" rx="2" fill="#ecfdf5" stroke="#059669" stroke-width="1.2"/><path d="M8 14h4" stroke="#059669" stroke-width="1.5" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="3" y="4" width="14" height="11" rx="2" fill="#f0fdf4" stroke="#06c755" stroke-width="1.2"/><path d="M6 9h8M6 12h5" stroke="#16a34a" stroke-width="1.2" stroke-linecap="round"/></svg>'
  ];

  function visualKeyFromProfile(profile) {
    if (profile.visual_key) return profile.visual_key;
    var id = profile.id || "";
    if (id.indexOf("denki_sekou") === 0) return "denki_sekou";
    if (id.indexOf("denki_shunin") === 0) return "denki_shunin";
    if (id.indexOf("kentiku") === 0) return "kentiku";
    if (id.indexOf("doboku") === 0) return "doboku";
    if (id.indexOf("sekoukanri") === 0) return "sekoukanri";
    if (profile.job_family === "sekoukanri") return "sekoukanri";
    return "denki";
  }

  function applyLicenseBadge(profile) {
    var badge = document.getElementById("thanks-license-badge");
    var icon = document.getElementById("thanks-license-icon");
    var label = document.getElementById("thanks-license-label");
    if (!badge || !profile) return;
    var key = visualKeyFromProfile(profile);
    if (icon) icon.innerHTML = LICENSE_ILLUS[key] || LICENSE_ILLUS.denki;
    if (label) label.textContent = profile.label || "登録資格向け";
    badge.hidden = false;
    badge.classList.add("is-ready");
  }

  function decorateHeroSteps() {
    var steps = document.querySelectorAll(".t-hero__steps li");
    steps.forEach(function (li, i) {
      if (li.querySelector(".t-hero__step-icon")) return;
      var icon = document.createElement("span");
      icon.className = "t-hero__step-icon";
      icon.innerHTML = STEP_ICONS[i] || STEP_ICONS[0];
      var text = document.createElement("span");
      text.className = "t-hero__step-text";
      while (li.firstChild) {
        text.appendChild(li.firstChild);
      }
      li.appendChild(icon);
      li.appendChild(text);
    });
  }

  function decorateIntentButtons() {
    document.querySelectorAll(".t-jobs__intent-btn[data-intent]").forEach(function (btn) {
      if (btn.querySelector(".t-jobs__intent-icon")) return;
      var key = btn.getAttribute("data-intent");
      var icon = document.createElement("span");
      icon.className = "t-jobs__intent-icon";
      icon.innerHTML = INTENT_ICONS[key] || INTENT_ICONS.salary;
      btn.insertBefore(icon, btn.firstChild);
    });
  }

  function decorateJobCards() {
    var cardIcon =
      '<span class="t-job-card__icon" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="1" width="12" height="14" rx="1.5" fill="#eef2fa" stroke="#314c85" stroke-width="1"/><path d="M5 5h6M5 8h6" stroke="#94a3b8" stroke-width="1" stroke-linecap="round"/></svg></span>';
    document.querySelectorAll(".t-job-card").forEach(function (card) {
      if (card.querySelector(".t-job-card__icon")) return;
      card.insertAdjacentHTML("afterbegin", cardIcon);
    });
  }

  function init() {
    decorateHeroSteps();
    decorateIntentButtons();
    decorateJobCards();
    if (window.dkThanksWhenProfileReady) {
      window.dkThanksWhenProfileReady(applyLicenseBadge);
    } else if (window.dkThanksLicenseProfile) {
      applyLicenseBadge(window.dkThanksLicenseProfile);
    }
  }

  document.addEventListener("thanks_profile_ready", function (ev) {
    applyLicenseBadge((ev && ev.detail) || window.dkThanksLicenseProfile);
  });

  document.addEventListener("thanks_job_preview_refresh", decorateJobCards);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.dkThanksSectionVisuals = {
    decorateHeroSteps: decorateHeroSteps,
    STEP_ICONS: STEP_ICONS
  };
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

  function storyParagraphs(story) {
    if (story.paragraphs && story.paragraphs.length) {
      return story.paragraphs;
    }
    var text = (story.text || "").trim();
    if (!text) return [];
    if (text.indexOf("\n") >= 0) {
      return text
        .split(/\n+/)
        .map(function (p) {
          return p.trim();
        })
        .filter(Boolean);
    }
    return [text];
  }

  function renderStory(story) {
    if (!story) return "";
    var needs = (story.needs || [])
      .map(function (n) {
        return '<span class="cvr-story__need">' + esc(n) + "</span>";
      })
      .join("");
    var paras = storyParagraphs(story)
      .map(function (p) {
        return '<p class="cvr-story__para">' + esc(p) + "</p>";
      })
      .join("");
    return (
      '<div class="cvr-story">' +
      '<p class="cvr-story__lead-label">転職の背景・ニーズ</p>' +
      '<div class="cvr-story__needs">' +
      needs +
      "</div>" +
      '<div class="cvr-story__text">' +
      paras +
      "</div>" +
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

  function readUserLicense() {
    if (window.dkThanks && window.dkThanks.readLeadProfile) {
      return window.dkThanks.readLeadProfile().license || "";
    }
    if (window.dkThanksLicenseProfile && window.dkThanksLicenseProfile.label) {
      return window.dkThanksLicenseProfile.label;
    }
    try {
      return sessionStorage.getItem("_license") || "";
    } catch (e0) {
      return "";
    }
  }

  function scoreLicenseMatch(cardLicenses, userLicense) {
    if (!userLicense) return 0;
    var user = String(userLicense).toLowerCase();
    var parts = String(cardLicenses || "")
      .split(",")
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(Boolean);
    var best = 0;
    parts.forEach(function (part) {
      if (!part) return;
      if (user === part) best = Math.max(best, 14);
      else if (user.indexOf(part) >= 0 || part.indexOf(user) >= 0) {
        best = Math.max(best, 10);
      } else if (part.indexOf("電気") >= 0 && user.indexOf("電気") >= 0) {
        best = Math.max(best, 6);
      } else if (part.indexOf("施工管理") >= 0 && user.indexOf("施工管理") >= 0) {
        best = Math.max(best, 6);
      }
    });
    return best;
  }

  function pickSocialTestimonialCard(profile) {
    var cards = Array.from(
      document.querySelectorAll(".cvr-testimonial[data-story-id]")
    ).filter(function (card) {
      return card.style.display !== "none";
    });
    if (!cards.length) return null;

    if (profile && profile.featured_story) {
      var featured = cards.find(function (card) {
        return card.getAttribute("data-story-id") === profile.featured_story;
      });
      if (featured) return featured;
    }

    var userLic = (profile && profile.label) || readUserLicense();
    var bestScore = 0;
    var bestCard = null;
    cards.forEach(function (card) {
      var score = scoreLicenseMatch(card.getAttribute("data-license") || "", userLic);
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    });
    if (bestCard) return bestCard;

    var family =
      (window.dkThanksContext && window.dkThanksContext.family) ||
      document.documentElement.getAttribute("data-thanks-family") ||
      "denki";
    var fallbackId = family === "sekoukanri" ? "nw" : "sm";
    return (
      cards.find(function (card) {
        return card.getAttribute("data-story-id") === fallbackId;
      }) || cards[0]
    );
  }

  function applySocialStrip(profile) {
    var strip = document.getElementById("thanks-social-strip");
    if (!strip) return;

    var card = pickSocialTestimonialCard(profile);
    if (!card) return;

    var avatarSrc = card.querySelector(".cvr-testimonial__avatar img");
    var avatarEl = strip.querySelector(".t-social-strip__avatar");
    if (avatarEl && avatarSrc && avatarSrc.getAttribute("src")) {
      avatarEl.src = avatarSrc.getAttribute("src");
    }

    var nameEl = card.querySelector(".cvr-testimonial__name");
    var roleEl = card.querySelector(".cvr-testimonial__role");
    var metaEl = strip.querySelector(".t-social-strip__meta");
    if (metaEl && nameEl) {
      var roleText = roleEl ? roleEl.textContent.trim() : "";
      metaEl.innerHTML =
        "<strong>" +
        esc(nameEl.textContent.trim()) +
        "</strong>" +
        (roleText ? " · " + esc(roleText) : "");
    }

    var teaserEl = card.querySelector(".cvr-testimonial__teaser");
    var quoteEl = strip.querySelector(".t-social-strip__quote");
    if (quoteEl && teaserEl) {
      var quote = teaserEl.textContent.trim();
      if (quote.charAt(0) !== "「") quote = "「" + quote;
      if (quote.slice(-1) !== "」") quote = quote + "」";
      quoteEl.textContent = quote;
    }

    var storyId = card.getAttribute("data-story-id") || "";
    var linkEl = strip.querySelector(".t-social-strip__link");
    if (linkEl && storyId) {
      linkEl.href = "#t-testi";
      linkEl.setAttribute("data-story-target", storyId);
    }
    strip.setAttribute("data-story-id", storyId);
  }

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
    applySocialStrip(profile);
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
    } else {
      applySocialStrip(null);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTestimonials);
  } else {
    initTestimonials();
  }
})();

/**
 * thanks-v2: スマホUX（フロー表示・スティッキーCTA・LINE一本化）
 * 日程調整カレンダー（③予約）は廃止。日程調整は登録後のLINEで実施するため、
 * thanks ページの主アクションは LINE 登録のみ。
 */
(function () {
  "use strict";

  var dock = document.getElementById("thanks-dock");
  var body = document.body;
  var lineCta = document.getElementById("line-cta");
  var dockLine = document.getElementById("thanks-dock-line");
  var lineBadge = document.getElementById("line-section-badge");

  function hasLineClicked() {
    if (window.dkThanks && window.dkThanks.hasLineClicked) {
      return window.dkThanks.hasLineClicked();
    }
    try {
      return sessionStorage.getItem("dk_line_clicked") === "1";
    } catch (e) {
      return false;
    }
  }

  function bindScrollTriggers(root) {
    (root || document).querySelectorAll("[data-scroll-target]").forEach(function (btn) {
      if (btn._dkScrollBound) return;
      btn._dkScrollBound = true;
      btn.addEventListener("click", function () {
        var el = document.querySelector(btn.getAttribute("data-scroll-target"));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // LINE一本化: クリック済みなら受け取り口の開設完了を表示（CTAは出し続ける）
  function applyLineClickedUi() {
    if (!hasLineClicked()) return;
    body.classList.add("is-line-clicked");
    if (lineBadge) {
      lineBadge.textContent = "② 開設済み — 全文はお電話後に届きます";
    }
    var next = document.getElementById("line-next-step");
    if (next) next.hidden = false;
    var stepLine = document.querySelector('[data-step="line"]');
    if (stepLine) {
      stepLine.classList.remove("is-cur");
      stepLine.classList.add("is-done");
    }
    updateDock();
  }

  function updateDock() {
    if (!dock) return;
    dock.hidden = false;
    body.classList.add("is-dock-visible");
    // LINEが唯一のCVのため、ドックのLINE CTAは常時表示し続ける
    if (dockLine) dockLine.hidden = false;
    dock.classList.add("is-visible");
  }

  bindScrollTriggers(document);
  if (dock) {
    bindScrollTriggers(dock);
    if (lineCta && dockLine) dockLine.href = lineCta.href;
  }

  document.addEventListener("thanks_line_cta_click", applyLineClickedUi);
  applyLineClickedUi();
  updateDock();

  document.addEventListener("thanks_job_preview_refresh", updateDock);
})();
