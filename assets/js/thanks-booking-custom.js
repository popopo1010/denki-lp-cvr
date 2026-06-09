/**
 * 独自予約UI: 3日分の空き枠を表示 → タップで予約 → GAS → スプシ + Slack
 */
(function () {
  var GAS_URL = window.LP_BOOKING_GAS_URL || (window.dkThanks && window.dkThanks.GAS_URL) || "";
  var section = document.getElementById("t-calendar");
  var mount = document.getElementById("booking-slot-root");
  if (!section || !mount || !GAS_URL) {
    if (section) section.style.display = "none";
    return;
  }

  var tel = "";
  var name = "";
  var lp = "thanks";
  if (window.dkThanks) {
    if (window.dkThanks.captureTelNameFromQs) window.dkThanks.captureTelNameFromQs();
    tel = window.dkThanks.getTel ? window.dkThanks.getTel() : "";
    name = window.dkThanks.getName ? window.dkThanks.getName() : "";
  } else {
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get("_tel")) {
        sessionStorage.setItem("_tel", qs.get("_tel"));
        tel = qs.get("_tel");
      }
      if (qs.get("_name")) {
        sessionStorage.setItem("_name", qs.get("_name"));
        name = qs.get("_name");
      }
      if (!tel) tel = sessionStorage.getItem("_tel") || "";
      if (!name) name = sessionStorage.getItem("_name") || "";
    } catch (e) {}
    if (!name) {
      var m = document.cookie.match(/(^| )user-name=([^;]+)/);
      if (m) name = decodeURIComponent(m[2]).trim();
    }
  }
  try {
    lp = sessionStorage.getItem("_lp") || lp;
  } catch (eLp) {}
  var hasTel = !!tel;

  var BOOKING_DONE_KEY = "dk_booking_done";

  function pushDL(event, extra) {
    var dk = window.dkThanks;
    if (dk && dk.pushDL) {
      dk.pushDL(event, extra);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    var payload = { event: event, page_type: "thanks" };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        payload[k] = extra[k];
      });
    }
    window.dataLayer.push(payload);
  }

  function renderDoneHtml(info) {
    return (
      '<div class="t-booking-done t-booking-done--hero">' +
      '<p class="t-booking-done__title">お電話の日時を確保しました</p>' +
      "<p class=\"t-booking-done__when\"><strong>" +
      info.day_label +
      " " +
      info.time_label +
      "</strong> 開始</p>" +
      '<p class="t-booking-done__sub">' +
      (info.staff_name
        ? "この時間に<strong>" + info.staff_name + "</strong>より<strong>お電話</strong>します（10分）"
        : "この時間に担当より<strong>お電話</strong>します（10分）") +
      "</p>" +
      '<p class="t-booking-done__next">お電話後、合う<strong>非公開求人の全文</strong>をお送りします</p>' +
      '<a href="https://lin.ee/PzFJp7H" class="t-booking-done__line" target="_blank" rel="noopener">' +
      '<span class="t-booking-done__line-main">LINEで全文を受け取る</span>' +
      '<span class="t-booking-done__line-sub">30秒 · 無料</span></a>' +
      "</div>"
    );
  }

  function revealLineStep(info) {
    document.body.classList.remove("is-awaiting-booking");
    document.body.classList.add("is-booked");
    section.classList.add("t-cal--booked");

    if (window.dkThanksExpandCalendar) {
      window.dkThanksExpandCalendar({ scroll: false });
    }
    var toggleBtn = document.getElementById("t-cal-toggle");
    if (toggleBtn) toggleBtn.hidden = true;

    var headTitle = section.querySelector(".t-cal__head h3");
    if (headTitle) headTitle.textContent = "お電話の日時を確保しました";

    var calBody = section.querySelector(".t-cal__body");
    if (calBody) {
      calBody.querySelectorAll(".t-cal__sub, .t-cal__note").forEach(function (el) {
        el.style.display = "none";
      });
    }

    var contact = document.querySelector(".t-contact");
    if (contact) contact.style.display = "none";

    var line = document.getElementById("line-section");
    if (line) {
      line.classList.add("t-line--revealed");
      var badge = line.querySelector(".t-line__badge") || document.getElementById("line-section-badge");
      var h3 = line.querySelector("h3");
      var sub = line.querySelector(".t-line__sub");
      if (badge) badge.textContent = "【今すぐ】案内を受け取る";
      if (h3) h3.innerHTML = "全文の受け取り・追加案内は<strong>LINE</strong>でも";
      if (sub)
        sub.innerHTML =
          "お電話のあと、<strong>非公開求人の全文</strong>や追加案内をLINEでも受け取れます。<strong>見るだけOK</strong> · 30秒";
      setTimeout(function () {
        line.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 450);
    }

    if (typeof window.dkThanksUnlockLine === "function") {
      window.dkThanksUnlockLine();
    }
    try {
      document.dispatchEvent(new CustomEvent("thanks_line_unlocked"));
    } catch (eEv) {}

    var stepBooking = document.querySelector('[data-step="booking"]');
    var stepLine = document.querySelector('[data-step="line"]');
    if (stepBooking) {
      stepBooking.classList.remove("is-cur");
      stepBooking.classList.add("is-done");
    }
    if (stepLine) stepLine.classList.add("is-cur");

    var heroRoot =
      document.getElementById("thanks-hero-sub") ||
      document.querySelector(".t-hero__body");
    if (heroRoot) {
      heroRoot.innerHTML =
        '<p class="t-hero__lead">日時を確保しました</p>' +
        '<p class="t-hero__route">次は<strong>LINE</strong>で全文の受取口（30秒）。お電話でプロと条件をすり合わせ、合う求人をご紹介します。</p>';
    }

    pushDL("thanks_line_step_revealed", {
      booking_tool: "custom",
      booking_day: info.day_label || "",
      booking_time: info.time_label || "",
      registration_step: "booking_done"
    });
    pushDL("thanks_booking_recommended_complete", {
      booking_tool: "custom",
      booking_day: info.day_label || "",
      booking_time: info.time_label || ""
    });
  }

  function capturePreBookingUi() {
    var line = document.getElementById("line-section");
    var headTitle = section.querySelector(".t-cal__head h3");
    var heroRoot =
      document.getElementById("thanks-hero-sub") ||
      document.querySelector(".t-hero__body");
    var contact = document.querySelector(".t-contact");
    var badge = line ? line.querySelector(".t-line__badge") : null;
    return {
      headTitle: headTitle ? headTitle.textContent : "",
      heroHtml: heroRoot ? heroRoot.innerHTML : "",
      contactDisplay: contact ? contact.style.display : "",
      lineClassName: line ? line.className : "",
      lineBadge: badge ? badge.textContent : "",
      lineH3: line && line.querySelector("h3") ? line.querySelector("h3").innerHTML : "",
      lineSub: line && line.querySelector(".t-line__sub") ? line.querySelector(".t-line__sub").innerHTML : "",
      stepBookingClass: (document.querySelector('[data-step="booking"]') || {}).className || "",
      stepLineClass: (document.querySelector('[data-step="line"]') || {}).className || ""
    };
  }

  function revertOptimisticBooking(ui) {
    if (!ui) return;
    try {
      sessionStorage.removeItem(BOOKING_DONE_KEY);
    } catch (eRm) {}

    document.body.classList.remove("is-booked", "is-line-unlocked");
    document.body.classList.add("is-awaiting-booking", "is-line-locked");
    section.classList.remove("t-cal--booked");

    var headTitle = section.querySelector(".t-cal__head h3");
    if (headTitle) headTitle.textContent = ui.headTitle;

    var calBody = section.querySelector(".t-cal__body");
    if (calBody) {
      calBody.querySelectorAll(".t-cal__sub, .t-cal__note").forEach(function (el) {
        el.style.display = "";
      });
    }

    var contact = document.querySelector(".t-contact");
    if (contact) contact.style.display = ui.contactDisplay;

    var line = document.getElementById("line-section");
    if (line) {
      line.className = ui.lineClassName;
      var badge = line.querySelector(".t-line__badge") || document.getElementById("line-section-badge");
      var h3 = line.querySelector("h3");
      var sub = line.querySelector(".t-line__sub");
      if (badge) badge.textContent = ui.lineBadge;
      if (h3) h3.innerHTML = ui.lineH3;
      if (sub) sub.innerHTML = ui.lineSub;
    }

    var stepBooking = document.querySelector('[data-step="booking"]');
    var stepLine = document.querySelector('[data-step="line"]');
    if (stepBooking) stepBooking.className = ui.stepBookingClass;
    if (stepLine) stepLine.className = ui.stepLineClass;

    var heroRoot =
      document.getElementById("thanks-hero-sub") ||
      document.querySelector(".t-hero__body");
    if (heroRoot && ui.heroHtml) heroRoot.innerHTML = ui.heroHtml;

    if (typeof window.dkThanksRelockLine === "function") {
      window.dkThanksRelockLine();
    }
  }

  function applyBookedState(info, skipSave) {
    mount.innerHTML = renderDoneHtml(info);
    if (!skipSave) {
      try {
        sessionStorage.setItem(BOOKING_DONE_KEY, JSON.stringify(info));
      } catch (e) {}
    }
    revealLineStep(info);
  }

  document.body.classList.add("thanks-flow");

  var savedRaw = null;
  try {
    savedRaw = sessionStorage.getItem(BOOKING_DONE_KEY);
  } catch (e) {}
  if (savedRaw) {
    try {
      applyBookedState(JSON.parse(savedRaw), true);
      return;
    } catch (e2) {}
  }

  document.body.classList.add("is-awaiting-booking");

  var wrap = document.querySelector(".t-cal__widget-wrap");
  if (wrap) wrap.style.display = "none";

  var visibleDays = Number(window.BOOKING_VISIBLE_DAYS) || 3;
  var fetchDays = Number(window.BOOKING_FETCH_DAYS) || 14;
  var dayOffset = 0;
  var allSlots = [];
  var selected = null;

  function bookSlotViaJsonp(payload, onDone) {
    var cb = "lpBookingBook_" + Date.now();
    window[cb] = function (res) {
      try {
        delete window[cb];
      } catch (e1) {}
      var script = document.getElementById("booking-book-jsonp");
      if (script && script.parentNode) script.parentNode.removeChild(script);
      onDone(res);
    };

    var jobIntent = "";
    var jobFocus = "";
    var userPref = "";
    try {
      jobIntent = sessionStorage.getItem("dk_job_intent") || "";
      jobFocus = sessionStorage.getItem("dk_job_focus_title") || "";
      var profRaw = sessionStorage.getItem("dk_lead_profile");
      if (profRaw) {
        var prof = JSON.parse(profRaw);
        userPref = (prof && prof.pref) || "";
      }
    } catch (e0) {}

    var q = [
      "action=book",
      "_event=book_slot",
      "calendar_start=" + encodeURIComponent(payload.start),
      "calendar_end=" + encodeURIComponent(payload.end),
      "calendar_guest_name=" + encodeURIComponent(payload.name),
      "your-tel=" + encodeURIComponent(payload.tel),
      "_lp=" + encodeURIComponent(payload.lp),
      "_page=" + encodeURIComponent(payload.page),
      "job_intent=" + encodeURIComponent(jobIntent),
      "job_focus_title=" + encodeURIComponent(jobFocus),
      "user_pref=" + encodeURIComponent(userPref),
      "callback=" + encodeURIComponent(cb)
    ];
    if (payload.staff_id) {
      q.splice(q.length - 1, 0, "calendar_staff_id=" + encodeURIComponent(payload.staff_id));
    }
    q = q.join("&");

    var script = document.createElement("script");
    script.id = "booking-book-jsonp";
    script.src = GAS_URL + "?" + q;
    script.onerror = function () {
      onDone({ ok: false, error: "network" });
    };
    document.head.appendChild(script);
  }

  function groupByDay(slots) {
    var map = {};
    slots.forEach(function (s) {
      if (!map[s.day]) map[s.day] = { day: s.day, day_label: s.day_label, times: [] };
      map[s.day].times.push(s);
    });
    return Object.keys(map)
      .sort()
      .map(function (k) {
        return map[k];
      });
  }

  function render() {
    var days = groupByDay(allSlots);
    if (!days.length) {
      mount.innerHTML =
        '<p class="t-booking-empty">現在予約できる枠がありません。しばらくして再度お試しください。</p>';
      return;
    }

    if (dayOffset + visibleDays > days.length) {
      dayOffset = Math.max(0, days.length - visibleDays);
    }
    var slice = days.slice(dayOffset, dayOffset + visibleDays);

    var html = '<div class="t-booking-nav">';
    html +=
      '<button type="button" class="t-booking-nav__btn" id="booking-prev"' +
      (dayOffset <= 0 ? " disabled" : "") +
      ">前の3日</button>";
    html +=
      '<button type="button" class="t-booking-nav__btn" id="booking-next"' +
      (dayOffset + visibleDays >= days.length ? " disabled" : "") +
      ">次の3日</button>";
    html += "</div>";

    html += '<div class="t-booking-days">';
    slice.forEach(function (day) {
      html += '<div class="t-booking-day">';
      html += '<p class="t-booking-day__title">' + day.day_label + "</p>";
      html += '<div class="t-booking-day__slots">';
      day.times.forEach(function (slot) {
        var active =
          selected && selected.start === slot.start ? " is-selected" : "";
        html +=
          '<button type="button" class="t-booking-slot' +
          active +
          '" data-start="' +
          slot.start +
          '" data-end="' +
          slot.end +
          '">' +
          slot.time_label +
          "</button>";
      });
      html += "</div></div>";
    });
    html += "</div>";

    html += '<div class="t-booking-actions">';
    if (selected) {
      html +=
        '<p class="t-booking-selected">選択中: <strong>' +
        selected.day_label +
        " " +
        selected.time_label +
        "</strong></p>";
      html +=
        '<button type="button" class="t-booking-confirm" id="booking-confirm">この日時で10分だけ話を聞く（無料）</button>';
    } else {
      html += '<p class="t-booking-hint">希望の時間をタップしてください</p>';
    }
    if (!hasTel) {
      html +=
        '<p class="t-booking-hint" style="margin-top:8px">※ 確定後、担当がこの時間にお電話します。合わなければその場でお断りください。</p>';
    }
    html += "</div>";

    mount.innerHTML = html;

    mount.querySelectorAll(".t-booking-slot").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var start = btn.getAttribute("data-start");
        selected = allSlots.filter(function (s) {
          return s.start === start;
        })[0];
        render();
      });
    });

    var prev = document.getElementById("booking-prev");
    var next = document.getElementById("booking-next");
    if (prev) {
      prev.addEventListener("click", function () {
        dayOffset = Math.max(0, dayOffset - visibleDays);
        selected = null;
        render();
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        dayOffset = Math.min(
          Math.max(0, groupByDay(allSlots).length - visibleDays),
          dayOffset + visibleDays
        );
        selected = null;
        render();
      });
    }

    var confirm = document.getElementById("booking-confirm");
    if (confirm) {
      confirm.addEventListener("click", function () {
        if (!selected) return;
        if (!hasTel) {
          mount.insertAdjacentHTML(
            "beforeend",
            '<p class="t-booking-empty">電話番号が取得できません。LPの登録フォームから再度お進みください。</p>'
          );
          return;
        }
        confirm.disabled = true;
        var slotForBook = selected;
        var preUi = capturePreBookingUi();
        var optimisticInfo = {
          day_label: slotForBook.day_label,
          time_label: slotForBook.time_label,
          start: slotForBook.start,
          end: slotForBook.end,
          staff_name: ""
        };
        applyBookedState(optimisticInfo, true);

        bookSlotViaJsonp(
          {
            start: slotForBook.start,
            end: slotForBook.end,
            name: name,
            tel: tel,
            lp: lp,
            page: location.href,
            staff_id: slotForBook.staff_id || ""
          },
          function (res) {
            if (!res || !res.ok) {
              revertOptimisticBooking(preUi);
              selected = slotForBook;
              render();
              var errMsg =
                res && res.error === "slot_taken"
                  ? "この枠は直前で埋まりました。別の時間をお選びください。"
                  : "予約に失敗しました。時間をおいて再度お試しください。";
              mount.insertAdjacentHTML(
                "beforeend",
                '<p class="t-booking-empty">' + errMsg + "</p>"
              );
              return;
            }

            var bookingInfo = {
              day_label: slotForBook.day_label,
              time_label: slotForBook.time_label,
              start: slotForBook.start,
              end: slotForBook.end,
              staff_name: (res && res.calendar_staff_name) || ""
            };
            applyBookedState(bookingInfo, false);
            pushDL("calendar_booked", { booking_tool: "custom" });
          }
        );
      });
    }
  }

  function applySlots(slots) {
    allSlots = slots || [];
    dayOffset = 0;
    selected = null;
    render();
  }

  function showSlotsError() {
    mount.innerHTML =
      '<p class="t-booking-empty">空き枠の取得に失敗しました。時間をおいて再度お試しください。</p>' +
      '<button type="button" class="t-booking-retry" id="booking-retry">再読み込み</button>';
    var retry = document.getElementById("booking-retry");
    if (retry) {
      retry.addEventListener("click", function () {
        allSlots = [];
        selected = null;
        try {
          sessionStorage.removeItem(window.BOOKING_SLOTS_CACHE_KEY || "dk_booking_slots_cache");
        } catch (e0) {}
        window.__dkBookingSlotsPromise = null;
        window.__dkBookingSlotsInflight = null;
        loadSlots();
      });
    }
  }

  function bookingSkeletonHtml() {
    return (
      '<div class="t-booking-skeleton">' +
      '<p class="t-booking-loading" style="margin-bottom:8px">空き枠を表示しています…</p>' +
      '<div class="t-booking-skeleton__days">' +
      '<div class="t-booking-skeleton__day"></div>' +
      '<div class="t-booking-skeleton__day"></div>' +
      '<div class="t-booking-skeleton__day"></div>' +
      "</div></div>"
    );
  }

  function showLoadingShell() {
    if (
      !mount.querySelector(".t-booking-skeleton") &&
      !mount.querySelector(".t-booking-day")
    ) {
      mount.innerHTML = bookingSkeletonHtml();
    }
  }

  function loadSlots() {
    showLoadingShell();

    var cached =
      window.dkBookingSlotsReadCache && window.dkBookingSlotsReadCache();
    if (cached && cached.slots && cached.slots.length) {
      applySlots(cached.slots);
    }

    var promise =
      window.__dkBookingSlotsPromise ||
      (window.dkBookingSlotsFetch ? window.dkBookingSlotsFetch(false) : null);

    if (promise) {
      promise
        .then(function (data) {
          if (data && data.slots && data.slots.length) {
            applySlots(data.slots);
            return;
          }
          if (allSlots.length) return;
          return window.dkBookingSlotsFetch
            ? window.dkBookingSlotsFetch(true)
            : null;
        })
        .then(function (retryData) {
          if (retryData && retryData.slots && retryData.slots.length) {
            applySlots(retryData.slots);
          } else if (!allSlots.length) {
            showSlotsError();
          }
        })
        .catch(function () {
          if (!allSlots.length) showSlotsError();
        });
    } else if (!allSlots.length) {
      showSlotsError();
    }

    window.addEventListener("dk-booking-slots-updated", function (ev) {
      if (selected || !ev.detail || !ev.detail.slots || !ev.detail.slots.length) {
        return;
      }
      applySlots(ev.detail.slots);
    });
  }

  var slotsMounted = false;
  function ensureBookingUi() {
    if (slotsMounted) return;
    slotsMounted = true;
    if (window.dkThanksEnsureBookingSlots) window.dkThanksEnsureBookingSlots();
    loadSlots();
  }
  window.dkThanksMountBooking = ensureBookingUi;
  document.addEventListener("thanks_calendar_expand", ensureBookingUi);

  var calPanel = document.getElementById("t-cal-panel");
  if (calPanel && !calPanel.hidden) {
    ensureBookingUi();
  }
})();
