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
        "登録内容に合いそうな<strong>比較軸</strong>だけ、先にお見せします。社名・年収・条件の<strong>全文は載せていません</strong> — ";
      jobsLead.innerHTML =
        base +
        profile.comparison_line +
        "。「全文、見て現職と比べたい」と思ったら、<strong>10分のお電話</strong>で十分です。";
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

  fetch(DATA_URL, { credentials: "same-origin", cache: "default" })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (data) boot(data);
    })
    .catch(function () {});
})();
