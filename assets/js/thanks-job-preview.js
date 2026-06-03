/**
 * サンクス: 資格マッチの求人プレビュー（見たいテンション → 話したい導線）
 */
(function () {
  var root = document.getElementById("job-preview-root");
  if (!root) return;

  var DATA_URL = "../assets/data/thanks-job-previews.json";
  var INTENT_KEY = "dk_job_intent";

  function pushDL(event, extra) {
    window.dataLayer = window.dataLayer || [];
    var payload = { event: event, page_type: "thanks-v2" };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        payload[k] = extra[k];
      });
    }
    window.dataLayer.push(payload);
  }

  function readLicense() {
    try {
      return (sessionStorage.getItem("_license") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function pickGroup(data, license) {
    var groups = data.groups || [];
    var lic = license || "";
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var keys = g.match || [];
      for (var j = 0; j < keys.length; j++) {
        if (lic.indexOf(keys[j]) >= 0 || keys[j].indexOf(lic) >= 0) {
          return g;
        }
      }
    }
    return data.fallback || null;
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCards(group) {
    var jobs = (group && group.jobs) || [];
    var html = "";
    jobs.slice(0, 3).forEach(function (job, idx) {
      var tags = (job.tags || [])
        .map(function (t) {
          return '<span class="t-job-card__tag">' + esc(t) + "</span>";
        })
        .join("");
      html +=
        '<article class="t-job-card" data-job-index="' +
        idx +
        '" tabindex="0" role="button">' +
        '<span class="t-job-card__badge">非公開含む</span>' +
        '<h4 class="t-job-card__title">' +
        esc(job.title) +
        "</h4>" +
        '<p class="t-job-card__meta"><span>' +
        esc(job.area) +
        "</span> · <strong>" +
        esc(job.salary) +
        "</strong></p>" +
        '<div class="t-job-card__tags">' +
        tags +
        "</div>" +
        '<p class="t-job-card__lock">※ 社名・詳細は<strong>本登録後</strong>に表示</p>' +
        "</article>";
    });
    return html;
  }

  function bindScroll(selector, eventName) {
    document.querySelectorAll(selector).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = btn.getAttribute("data-scroll-target");
        var el = target ? document.querySelector(target) : null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        pushDL(eventName, { scroll_target: target || "" });
      });
    });
  }

  function bindIntentChips() {
    var saved = "";
    try {
      saved = sessionStorage.getItem(INTENT_KEY) || "";
    } catch (e1) {}
    document.querySelectorAll(".t-jobs__intent-btn").forEach(function (btn) {
      if (btn.getAttribute("data-intent") === saved) {
        btn.classList.add("is-active");
      }
      btn.addEventListener("click", function () {
        var intent = btn.getAttribute("data-intent") || "";
        document.querySelectorAll(".t-jobs__intent-btn").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        try {
          sessionStorage.setItem(INTENT_KEY, intent);
        } catch (e2) {}
        pushDL("thanks_job_intent_select", { job_intent: intent });
      });
    });
  }

  function bindJobCards() {
    root.querySelectorAll(".t-job-card").forEach(function (card) {
      function activate() {
        pushDL("thanks_job_card_click", {
          job_index: card.getAttribute("data-job-index") || ""
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

  function mountVoice(group) {
    var voiceEl = document.getElementById("job-preview-voice");
    if (!voiceEl || !group || !group.voice) return;
    voiceEl.textContent = group.voice;
    voiceEl.hidden = false;
  }

  function mountLabel(group, license, data) {
    var labelEl = document.getElementById("job-preview-label");
    if (!labelEl) return;
    var label = (group && group.label) || data.default_license_label || "電気工事士";
    if (license) {
      labelEl.innerHTML =
        "ご登録の「<strong>" +
        esc(license) +
        "</strong>」に近い<strong>非公開求人</strong>の一例です";
    } else {
      labelEl.innerHTML =
        "<strong>" + esc(label) + "</strong>向けの非公開求人の一例です";
    }
  }

  fetch(DATA_URL)
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var license = readLicense();
      var group = pickGroup(data, license) || data.fallback;
      mountLabel(group, license, data);
      mountVoice(group);
      root.innerHTML = renderCards(group);
      bindJobCards();
      bindIntentChips();
      bindScroll("[data-scroll-target]", "thanks_job_preview_cta");
      pushDL("thanks_job_preview_view", {
        license: license || "unknown",
        preview_count: Math.min(3, (group.jobs || []).length)
      });
    })
    .catch(function () {
      root.innerHTML =
        '<p class="t-jobs__error">求人プレビューを読み込めませんでした。下の日時選択からご相談ください。</p>';
    });
})();
