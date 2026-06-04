/**
 * サンクス: 資格・登録希望・プレビュー選択に合わせた求人表示
 */
(function () {
  var root = document.getElementById("job-preview-root");
  if (!root) return;

  var DATA_URL =
    (window.dkThanks && window.dkThanks.assetUrl
      ? window.dkThanks.assetUrl("data/thanks-job-previews.json")
      : null) || "../assets/data/thanks-job-previews.json";
  var INTENT_KEY = "dk_job_intent";
  var PROFILE_KEY = "dk_lead_profile";

  var previewData = null;
  var activeGroup = null;
  var regionByPref = {};

  function pushDL(event, extra) {
    var dk = window.dkThanks;
    if (dk && dk.pushDL) {
      dk.pushDL(event, extra);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    var payload = { event: event, page_type: "thanks-v2" };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        payload[k] = extra[k];
      });
    }
    window.dataLayer.push(payload);
  }

  function readProfile() {
    var profile = {
      license: "",
      pref: "",
      city: "",
      experience: "",
      willingness: "",
      intent: ""
    };
    try {
      var raw = sessionStorage.getItem(PROFILE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          profile.license = String(parsed.license || "").trim();
          profile.pref = String(parsed.pref || "").trim();
          profile.city = String(parsed.city || "").trim();
          profile.experience = String(parsed.experience || "").trim();
          profile.willingness = String(parsed.willingness || "").trim();
        }
      }
    } catch (e1) {}
    if (!profile.license) {
      try {
        profile.license = (sessionStorage.getItem("_license") || "").trim();
      } catch (e2) {}
    }
    if (
      !profile.license &&
      window.dkThanksLicenseProfile &&
      window.dkThanksLicenseProfile.label
    ) {
      profile.license = window.dkThanksLicenseProfile.label;
    }
    try {
      profile.intent = sessionStorage.getItem(INTENT_KEY) || "";
    } catch (e3) {}
    profile.region = regionByPref[profile.pref] || "";
    return profile;
  }

  function getLpFamily() {
    if (
      window.dkThanksLicenseProfile &&
      window.dkThanksLicenseProfile.job_family
    ) {
      return window.dkThanksLicenseProfile.job_family;
    }
    if (window.dkThanksContext && window.dkThanksContext.family) {
      return window.dkThanksContext.family;
    }
    var dk = window.dkThanks;
    if (dk && dk.getLpSlug && dk.getJobFamily) {
      return dk.getJobFamily(dk.getLpSlug());
    }
    var slug = "";
    try {
      slug = sessionStorage.getItem("_lp") || "";
      var qs = new URLSearchParams(location.search).get("lp");
      if (qs) slug = qs;
    } catch (e0) {}
    slug = String(slug).toLowerCase();
    if (
      slug.indexOf("sekoukanri") >= 0 ||
      slug.indexOf("kentiku") >= 0 ||
      slug.indexOf("doboku") >= 0 ||
      slug.indexOf("denkisekou") >= 0
    ) {
      return "sekoukanri";
    }
    return "denki";
  }

  function licenseMatches(lic, key) {
    if (!lic || !key) return false;
    if (lic === key) return true;
    if (key.length < 3) return false;
    return lic.indexOf(key) >= 0 || key.indexOf(lic) >= 0;
  }

  function resolveFallback(data, family) {
    var fb =
      (data.fallbacks && data.fallbacks[family]) ||
      data.fallback ||
      null;
    if (fb && (!fb.jobs || !fb.jobs.length) && data.fallbacks) {
      fb = data.fallbacks.denki || data.fallbacks.sekoukanri || fb;
    }
    return fb;
  }

  function pickGroup(data, license) {
    var lic = license || "";
    var best = null;
    var bestScore = 0;
    (data.groups || []).forEach(function (g) {
      (g.match || []).forEach(function (key) {
        if (!licenseMatches(lic, key)) return;
        var score = key.length;
        if (score > bestScore) {
          bestScore = score;
          best = g;
        }
      });
    });
    if (best) return best;
    return resolveFallback(data, getLpFamily());
  }

  function formatSalary(job) {
    if (job.salary) return job.salary;
    var min = job.salary_min;
    var max = job.salary_max;
    if (min && max) return "年収" + min + "〜" + max + "万円";
    if (min) return "年収" + min + "万円〜";
    if (max) return "年収〜" + max + "万円";
    return "年収応相談";
  }

  function jobMatchesPref(job, profile) {
    if (!profile.pref) return 0;
    var prefs = job.prefs || [];
    for (var i = 0; i < prefs.length; i++) {
      if (prefs[i] === profile.pref) return 14;
      if (prefs[i].indexOf(profile.pref) >= 0 || profile.pref.indexOf(prefs[i]) >= 0) {
        return 12;
      }
    }
    if (job.area && job.area.indexOf(profile.pref) >= 0) return 11;
    if (profile.city && job.area && job.area.indexOf(profile.city) >= 0) return 9;
    if (profile.region && job.region === profile.region) return 8;
    if (profile.region && job.area && job.area.indexOf(profile.region) >= 0) return 6;
    return 0;
  }

  function scoreJob(job, profile) {
    var score = 0;
    score += jobMatchesPref(job, profile);

    var intent = profile.intent || "";
    var intents = job.intents || [];
    var traits = job.traits || [];

    if (intent && intents.indexOf(intent) >= 0) score += 10;

    if (intent === "salary") {
      score += (job.salary_min || 0) * 0.02;
      if (traits.indexOf("high_salary") >= 0) score += 6;
    }
    if (intent === "stable") {
      if (traits.indexOf("weekend_off") >= 0) score += 6;
      if (traits.indexOf("low_ot") >= 0) score += 5;
      if (traits.indexOf("direct_commute") >= 0) score += 3;
    }
    if (intent === "private") {
      if (traits.indexOf("private") >= 0) score += 9;
      var tags = job.tags || [];
      if (tags.join(" ").indexOf("非公開") >= 0) score += 4;
    }
    if (intent === "area") {
      score += jobMatchesPref(job, profile) > 0 ? 4 : 0;
    }

    if (profile.willingness.indexOf("近いうち") >= 0) {
      score += (job.salary_min || 0) * 0.01;
      if (traits.indexOf("high_salary") >= 0) score += 3;
    }
    if (profile.willingness.indexOf("情報収集") >= 0) {
      if (traits.indexOf("weekend_off") >= 0) score += 4;
      if (traits.indexOf("low_ot") >= 0) score += 4;
    }
    if (profile.experience.indexOf("未経験") >= 0) {
      if (traits.indexOf("beginner_ok") >= 0) score += 7;
    }

    return score;
  }

  function rankJobs(group, profile) {
    var jobs = (group && group.jobs) ? group.jobs.slice() : [];
    if (profile.pref) {
      var inPref = [];
      var other = [];
      jobs.forEach(function (job) {
        if (jobMatchesPref(job, profile) > 0) inPref.push(job);
        else other.push(job);
      });
      jobs = inPref.length ? inPref.concat(other) : jobs;
    }
    jobs.sort(function (a, b) {
      return scoreJob(b, profile) - scoreJob(a, profile);
    });
    return jobs.slice(0, 3);
  }

  /** カード表示用：登録都道府県があればそちらのみ（サンプル案件の他県名は出さない） */
  function formatDisplayArea(profile, job) {
    if (profile.pref) return profile.pref;
    return job.area || profile.region || "";
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

  function buildLabel(profile, data) {
    var labelEl = document.getElementById("job-preview-label");
    if (!labelEl) return;
    var parts = [];
    if (profile.pref) parts.push(profile.pref);
    var intentLabels = (data && data.intent_labels) || {};
    if (profile.intent && intentLabels[profile.intent]) {
      parts.push(intentLabels[profile.intent]);
    } else if (profile.willingness.indexOf("近いうち") >= 0) {
      parts.push("比較意欲高め");
    }
    var defaultLic =
      (window.dkThanksLicenseProfile && window.dkThanksLicenseProfile.label) ||
      (window.dkThanksContext &&
        window.dkThanksContext.brand &&
        window.dkThanksContext.brand.defaultLicense) ||
      (previewData && previewData.default_license_label) ||
      "電気工事士";
    var lic = profile.license || (activeGroup && activeGroup.label) || defaultLic;
    if (!parts.length) {
      labelEl.innerHTML =
        "「<strong>" +
        esc(lic) +
        "</strong>」で、<strong>現職と比べられる選択肢</strong>の輪郭（全文はお電話後）";
      return;
    }
    labelEl.innerHTML =
      "<strong>" +
      esc(parts.join("・")) +
      "</strong>で比較したい方向性 — <strong>" +
      esc(lic) +
      "</strong>向け（全文はヒアリング後）";
  }

  function teaserHeadline(job, profile) {
    var traits = job.traits || [];
    var tags = (job.tags || []).join(" ");
    if (traits.indexOf("high_salary") >= 0 || tags.indexOf("高待遇") >= 0) {
      return "非公開 · 年収を軸に現職と比べられる枠";
    }
    if (traits.indexOf("weekend_off") >= 0 || traits.indexOf("low_ot") >= 0) {
      return "非公開 · 残業・休日を軸に比較できる枠";
    }
    if (traits.indexOf("private") >= 0 || tags.indexOf("非公開") >= 0) {
      return "サイト非掲載 · 現職と並べて比較できる枠";
    }
    if (profile.pref) {
      return "非公開 · " + profile.pref + "で比較材料になる枠";
    }
    return "非公開 · 現職と比べられる選択肢";
  }

  function teaserCompareAxis(job) {
    var traits = job.traits || [];
    var axes = [];
    if (traits.indexOf("high_salary") >= 0) axes.push("年収");
    if (traits.indexOf("weekend_off") >= 0) axes.push("休日");
    if (traits.indexOf("low_ot") >= 0) axes.push("残業");
    if (traits.indexOf("direct_commute") >= 0) axes.push("通勤");
    if (!axes.length) axes.push("条件");
    return "比較軸: " + axes.join(" · ");
  }

  function renderCards(jobs, profile) {
    var html = "";
    jobs.forEach(function (job, idx) {
      var tags = (job.tags || [])
        .slice(0, 2)
        .map(function (t) {
          return '<span class="t-job-card__tag">' + esc(t) + "</span>";
        })
        .join("");
      html +=
        '<article class="t-job-card" data-job-index="' +
        idx +
        '" data-job-title="' +
        esc(teaserHeadline(job, profile)) +
        '" tabindex="0" role="button">' +
        '<span class="t-job-card__badge">非公開</span>' +
        '<h4 class="t-job-card__title">' +
        esc(teaserHeadline(job, profile)) +
        "</h4>" +
        '<p class="t-job-card__meta"><span>' +
        esc(teaserCompareAxis(job)) +
        "</span></p>" +
        '<div class="t-job-card__tags">' +
        tags +
        "</div>" +
        '<p class="t-job-card__lock">社名・年収・条件の<strong>全文</strong>は<strong>10分のお電話後</strong>にご案内 — 現職と並べて比較できます</p>' +
        "</article>";
    });
    return html;
  }

  function refreshPreview(reason) {
    if (!previewData || !activeGroup) return;
    var profile = readProfile();
    var jobs = rankJobs(activeGroup, profile);
    buildLabel(profile, previewData);
    root.innerHTML = renderCards(jobs, profile);
    bindJobCards();
    pushDL("thanks_job_preview_refresh", {
      reason: reason || "init",
      job_intent: profile.intent || "",
      user_pref: profile.pref || "",
      preview_count: jobs.length
    });
    try {
      document.dispatchEvent(
        new CustomEvent("thanks_job_preview_refresh", { detail: { reason: reason } })
      );
    } catch (eEv) {}
  }

  function bindScroll() {
    document.querySelectorAll("[data-scroll-target]").forEach(function (btn) {
      if (btn._boundScroll) return;
      btn._boundScroll = true;
      btn.addEventListener("click", function () {
        var target = btn.getAttribute("data-scroll-target");
        var el = target ? document.querySelector(target) : null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        pushDL("thanks_job_preview_cta", { scroll_target: target || "" });
      });
    });
  }

  function bindIntentChips() {
    document.querySelectorAll(".t-jobs__intent-btn").forEach(function (btn) {
      if (btn._boundIntent) return;
      btn._boundIntent = true;
      btn.addEventListener("click", function () {
        var intent = btn.getAttribute("data-intent") || "";
        document.querySelectorAll(".t-jobs__intent-btn").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        try {
          sessionStorage.setItem(INTENT_KEY, intent);
        } catch (e1) {}
        pushDL("thanks_job_intent_select", { job_intent: intent });
        refreshPreview("intent");
      });
    });
    var profile = readProfile();
    if (profile.intent) {
      document.querySelectorAll(".t-jobs__intent-btn").forEach(function (btn) {
        btn.classList.toggle(
          "is-active",
          btn.getAttribute("data-intent") === profile.intent
        );
      });
    }
  }

  function bindJobCards() {
    root.querySelectorAll(".t-job-card").forEach(function (card) {
      function activate() {
        var title = card.getAttribute("data-job-title") || "";
        try {
          sessionStorage.setItem("dk_job_focus_title", title);
        } catch (e0) {}
        pushDL("thanks_job_card_click", {
          job_index: card.getAttribute("data-job-index") || "",
          job_title: title
        });
        var cal = document.getElementById("t-calendar");
        if (cal) cal.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      card.addEventListener("click", activate);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  function mountVoice(group, profile) {
    var voiceEl = document.getElementById("job-preview-voice");
    if (!voiceEl) return;
    var text = (group && group.voice) || "";
    if (profile.pref && text) {
      text = profile.pref + "エリアの方も — " + text;
    }
    voiceEl.textContent = text;
    voiceEl.hidden = !text;
  }

  function bootPreview(data) {
    previewData = data;
    regionByPref = (data && data.pref_regions) || {};
    var profile = readProfile();
    activeGroup =
      pickGroup(data, profile.license) || resolveFallback(data, getLpFamily());
    mountVoice(activeGroup, profile);
    bindIntentChips();
    bindScroll();
    refreshPreview("init");
    pushDL("thanks_job_preview_view", {
      license: profile.license || "unknown",
      user_pref: profile.pref || "",
      willingness: profile.willingness || "",
      job_intent: profile.intent || ""
    });
  }

  function loadPreview() {
    fetch(DATA_URL)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (window.dkThanksWhenProfileReady) {
          window.dkThanksWhenProfileReady(function () {
            bootPreview(data);
          });
        } else {
          bootPreview(data);
        }
      })
      .catch(function () {
        root.innerHTML =
          '<p class="t-jobs__error">案件の表示に失敗しました。下の日時からご相談いただけます。</p>';
      });
  }

  loadPreview();
})();
