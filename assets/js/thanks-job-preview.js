/**
 * サンクス: 資格・登録希望・プレビュー選択に合わせた求人表示
 */
(function () {
  var root = document.getElementById("job-preview-root");
  var heroRoot = document.getElementById("job-preview-hero");
  if (!root && !heroRoot) return;

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

  function normalizeBandLabels(raw) {
    var labels = raw || {};
    return {
      high: labels.high || "相場より高め",
      mid: labels.mid || "相場程度",
      low: labels.low || "相場よりちょい安め"
    };
  }

  function salaryBandLabels(data) {
    return normalizeBandLabels((data && data.salary_band_labels) || {});
  }

  function getIntentBandLabels(data, intent) {
    var byIntent = (data && data.intent_band_labels) || {};
    if (intent && byIntent[intent]) return normalizeBandLabels(byIntent[intent]);
    return salaryBandLabels(data);
  }

  function getMarketMid(data, group) {
    var byGrade = (data && data.market_mid_by_grade) || {};
    var label = (group && group.label) || "";
    var keys = Object.keys(byGrade);
    for (var i = 0; i < keys.length; i++) {
      if (label.indexOf(keys[i]) >= 0) return byGrade[keys[i]];
    }
    var family = getLpFamily();
    var byFamily = (data && data.market_mid_by_family) || {};
    return byFamily[family] || byFamily.denki || 520;
  }

  function bandFromRatio(ratio, labels) {
    if (ratio >= 1.06) return { key: "high", label: labels.high };
    if (ratio <= 0.94) return { key: "low", label: labels.low };
    return { key: "mid", label: labels.mid };
  }

  function resolveSalaryBand(job, data, group, labelsOverride) {
    var labels = labelsOverride || salaryBandLabels(data);
    if (job.salary_band && labels[job.salary_band]) {
      return { key: job.salary_band, label: labels[job.salary_band] };
    }
    var min = job.salary_min;
    var max = job.salary_max;
    if (!min && !max) return { key: "mid", label: labels.mid };
    var mid = ((min || max) + (max || min)) / 2;
    var market = getMarketMid(data, group);
    return bandFromRatio(mid / market, labels);
  }

  function resolveLocationBand(job, profile, labels) {
    if (job.location_band && labels[job.location_band]) {
      return { key: job.location_band, label: labels[job.location_band] };
    }
    var traits = job.traits || [];
    var prefScore = jobMatchesPref(job, profile);
    if (prefScore >= 11) return { key: "high", label: labels.high };
    if (prefScore >= 6) return { key: "mid", label: labels.mid };
    if (traits.indexOf("direct_commute") >= 0 || traits.indexOf("low_ot") >= 0) {
      return { key: "low", label: labels.low };
    }
    return { key: "mid", label: labels.mid };
  }

  function resolveJobBands(job, data, group, profile) {
    var intent = profile.intent || "";
    if (intent === "area") {
      var areaLabels = getIntentBandLabels(data, "area");
      var stableLabels = getIntentBandLabels(data, "stable");
      return {
        areaBand: resolveLocationBand(job, profile, areaLabels),
        salaryBand: resolveSalaryBand(job, data, group, stableLabels)
      };
    }
    var salaryLabels = getIntentBandLabels(data, intent);
    return {
      areaBand: null,
      salaryBand: resolveSalaryBand(job, data, group, salaryLabels)
    };
  }

  function formatSalaryRange(job) {
    var min = job.salary_min;
    var max = job.salary_max;
    if (min && max) return min + "〜" + max + "万円";
    if (min) return min + "万円〜";
    if (max) return "〜" + max + "万円";
    return "";
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
        "」向けの<strong>求人概要</strong>（全文はお電話後）";
      return;
    }
    labelEl.innerHTML =
      "<strong>" +
      esc(parts.join("・")) +
      "</strong>で比較したい方向性 — <strong>" +
      esc(lic) +
      "</strong>向け（全文はヒアリング後）";
  }

  function jobDisplayTitle(job) {
    return String(job.title || job.duty || "求人案件").trim();
  }

  function renderOneCard(job, idx, profile, opts) {
    opts = opts || {};
    var title = jobDisplayTitle(job);
    var area = formatDisplayArea(profile, job);
    var bands = resolveJobBands(job, previewData, activeGroup, profile);
    var range = formatSalaryRange(job);
    var areaDd = esc(area || "要ヒアリング");
    if (bands.areaBand) {
      areaDd +=
        ' <span class="t-job-card__band t-job-card__band--' +
        esc(bands.areaBand.key) +
        '">（' +
        esc(bands.areaBand.label) +
        "）</span>";
    }
    var salaryDd =
      esc(bands.salaryBand.label) +
      (range
        ? ' <span class="t-job-card__range">（' + esc(range) + "）</span>"
        : "");
    var tags = (job.tags || [])
      .slice(0, 2)
      .map(function (t) {
        return '<span class="t-job-card__tag">' + esc(t) + "</span>";
      })
      .join("");
    var heroClass = opts.hero ? " t-job-card--hero" : "";
    var lockCopy = opts.hero
      ? "社名・詳細条件の<strong>全文</strong>は<strong>10分のお電話後</strong>"
      : "社名・詳細条件の<strong>全文</strong>は<strong>10分のお電話後</strong> — 現職と並べて比較できます";
    return (
      '<article class="t-job-card' +
      heroClass +
      '" data-job-index="' +
      idx +
      '" data-job-title="' +
      esc(title) +
      '" tabindex="0" role="button">' +
      '<span class="t-job-card__badge">非公開</span>' +
      '<p class="t-job-card__kicker">仕事内容</p>' +
      '<h4 class="t-job-card__title">' +
      esc(title) +
      "</h4>" +
      '<dl class="t-job-card__facts">' +
      '<div class="t-job-card__fact t-job-card__fact--area">' +
      "<dt>勤務地</dt><dd>" +
      areaDd +
      "</dd></div>" +
      '<div class="t-job-card__fact t-job-card__fact--salary">' +
      "<dt>年収</dt><dd class=\"is-" +
      esc(bands.salaryBand.key) +
      '">' +
      salaryDd +
      "</dd></div>" +
      "</dl>" +
      '<div class="t-job-card__tags">' +
      tags +
      "</div>" +
      '<p class="t-job-card__lock">' +
      lockCopy +
      "</p>" +
      "</article>"
    );
  }

  function renderCards(jobs, profile, startIndex) {
    var base = startIndex || 0;
    var html = "";
    jobs.forEach(function (job, i) {
      html += renderOneCard(job, base + i, profile, {});
    });
    return html;
  }

  function updateHeroMoreLink(restCount) {
    var moreEl = document.querySelector(".t-hero__more");
    if (!moreEl) return;
    if (restCount <= 0) {
      moreEl.hidden = true;
      return;
    }
    moreEl.hidden = false;
    var link = moreEl.querySelector("a");
    if (link) {
      link.textContent = "他" + restCount + "件も下に表示しています";
    }
  }

  function updateJobsSectionTitle(restCount) {
    var titleEl = document.getElementById("t-jobs-title");
    if (!titleEl) return;
    if (restCount <= 0) {
      titleEl.textContent = "気になる方は日時を選ぶだけ";
      return;
    }
    titleEl.textContent =
      "残り" + restCount + "件も、同じ形式で比べられます";
  }

  function refreshPreview(reason) {
    if (!previewData || !activeGroup) return;
    var profile = readProfile();
    var jobs = rankJobs(activeGroup, profile);
    buildLabel(profile, previewData);

    if (heroRoot) {
      heroRoot.setAttribute("aria-busy", "false");
      if (jobs[0]) {
        heroRoot.innerHTML = renderOneCard(jobs[0], 0, profile, { hero: true });
      } else {
        heroRoot.innerHTML =
          '<p class="t-hero-gift__empty">あなた向けの概要を準備しています…</p>';
      }
    }

    var rest = jobs.slice(1);
    updateHeroMoreLink(rest.length);
    updateJobsSectionTitle(rest.length);

    if (root) {
      if (rest.length) {
        root.innerHTML = renderCards(rest, profile, 1);
      } else {
        root.innerHTML =
          '<p class="t-jobs__rest-note">上の1件をご確認ください。気になる方は下の日時から。</p>';
      }
    }

    bindJobCards();
    pushDL("thanks_job_preview_refresh", {
      reason: reason || "init",
      job_intent: profile.intent || "",
      user_pref: profile.pref || "",
      preview_count: jobs.length,
      hero_gift: jobs.length > 0 ? 1 : 0
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
    var cards = [];
    if (heroRoot) {
      cards = cards.concat(Array.prototype.slice.call(heroRoot.querySelectorAll(".t-job-card")));
    }
    if (root) {
      cards = cards.concat(Array.prototype.slice.call(root.querySelectorAll(".t-job-card")));
    }
    cards.forEach(function (card) {
      if (card._boundJobCard) return;
      card._boundJobCard = true;
      function activate() {
        var title = card.getAttribute("data-job-title") || "";
        try {
          sessionStorage.setItem("dk_job_focus_title", title);
        } catch (e0) {}
        pushDL("thanks_job_card_click", {
          job_index: card.getAttribute("data-job-index") || "",
          job_title: title,
          hero_card: card.classList.contains("t-job-card--hero") ? 1 : 0
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
        if (heroRoot) {
          heroRoot.setAttribute("aria-busy", "false");
          heroRoot.innerHTML =
            '<p class="t-hero-gift__empty">概要の表示に失敗しました</p>';
        }
        if (root) {
          root.innerHTML =
            '<p class="t-jobs__error">案件の表示に失敗しました。下の日時からご相談いただけます。</p>';
        }
      });
  }

  function startPreviewLoad() {
    var section = document.getElementById("t-jobs-preview");
    var target = section || root || heroRoot;
    if (section && section.classList.contains("t-jobs--first")) {
      loadPreview();
      return;
    }
    if (!("IntersectionObserver" in window)) {
      loadPreview();
      return;
    }
    var obs = new IntersectionObserver(
      function (entries) {
        if (!entries[0] || !entries[0].isIntersecting) return;
        obs.disconnect();
        loadPreview();
      },
      { rootMargin: "280px 0px 0px 0px", threshold: 0.01 }
    );
    obs.observe(target);
  }

  startPreviewLoad();
})();
