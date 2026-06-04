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
