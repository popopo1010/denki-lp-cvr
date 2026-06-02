/**
 * 独自予約UI: 3日分の空き枠を表示 → タップで予約 → GAS → スプシ + Slack
 */
(function () {
  var GAS_URL = window.LP_BOOKING_GAS_URL || "";
  var section = document.getElementById("t-calendar");
  var mount = document.getElementById("booking-slot-root");
  if (!section || !mount || !GAS_URL) {
    if (section) section.style.display = "none";
    return;
  }

  var tel = "";
  var name = "";
  var lp = "thanks";
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
    lp = sessionStorage.getItem("_lp") || lp;
  } catch (e) {}
  if (!name) {
    var m = document.cookie.match(/(^| )user-name=([^;]+)/);
    if (m) name = decodeURIComponent(m[2]).trim();
  }
  var hasTel = !!tel;

  var BOOKING_DONE_KEY = "dk_booking_done";

  function pushDL(event, extra) {
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
      '<p class="t-booking-done__title">ご予約完了</p>' +
      "<p class=\"t-booking-done__when\"><strong>" +
      info.day_label +
      " " +
      info.time_label +
      "</strong> 開始</p>" +
      '<p class="t-booking-done__sub">この時間に担当よりご連絡します</p>' +
      '<p class="t-booking-done__next">次は <strong>LINE友だち追加</strong>（30秒）をお願いします</p>' +
      "</div>"
    );
  }

  function revealLineStep(info) {
    document.body.classList.remove("is-awaiting-booking");
    document.body.classList.add("is-booked");
    section.classList.add("t-cal--booked");

    var headTitle = section.querySelector(".t-cal__head h3");
    if (headTitle) headTitle.textContent = "ご予約完了";

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
      var badge = line.querySelector(".t-line__badge");
      var h3 = line.querySelector("h3");
      var sub = line.querySelector(".t-line__sub");
      if (badge) badge.textContent = "次のステップ";
      if (h3) h3.innerHTML = "予約のあと、<strong>LINE</strong>で求人を受け取る";
      if (sub) sub.textContent = "面談前に非公開求人をお届けします（30秒で完了）";
      setTimeout(function () {
        line.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 450);
    }

    var stepBooking = document.querySelector('[data-step="booking"]');
    var stepLine = document.querySelector('[data-step="line"]');
    if (stepBooking) {
      stepBooking.classList.remove("is-cur");
      stepBooking.classList.add("is-done");
    }
    if (stepLine) stepLine.classList.add("is-cur");

    var heroP = document.querySelector(".t-hero p");
    if (heroP) {
      heroP.innerHTML =
        "面談日時のご予約ありがとうございます。<br>続いて<strong>LINE友だち追加</strong>をお願いします。";
    }

    pushDL("thanks_line_step_revealed", {
      booking_tool: "custom",
      booking_day: info.day_label || "",
      booking_time: info.time_label || ""
    });
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

    var q = [
      "action=book",
      "_event=book_slot",
      "calendar_start=" + encodeURIComponent(payload.start),
      "calendar_end=" + encodeURIComponent(payload.end),
      "calendar_guest_name=" + encodeURIComponent(payload.name),
      "your-tel=" + encodeURIComponent(payload.tel),
      "_lp=" + encodeURIComponent(payload.lp),
      "_page=" + encodeURIComponent(payload.page),
      "callback=" + encodeURIComponent(cb)
    ].join("&");

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
        '<button type="button" class="t-booking-confirm" id="booking-confirm">この日時で予約する</button>';
    } else {
      html += '<p class="t-booking-hint">希望の時間をタップしてください</p>';
    }
    if (!hasTel) {
      html +=
        '<p class="t-booking-hint" style="margin-top:8px">※ 予約確定にはLP登録時の電話番号が必要です</p>';
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
        confirm.textContent = "予約中...";

        bookSlotViaJsonp(
          {
            start: selected.start,
            end: selected.end,
            name: name,
            tel: tel,
            lp: lp,
            page: location.href
          },
          function (res) {
            if (!res || !res.ok) {
              confirm.disabled = false;
              confirm.textContent = "この日時で予約する";
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
              day_label: selected.day_label,
              time_label: selected.time_label,
              start: selected.start,
              end: selected.end
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
      '<p class="t-booking-empty">空き枠の取得に失敗しました。時間をおいて再度お試しください。</p>';
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
      promise.then(function (data) {
        if (data && data.slots && data.slots.length) {
          applySlots(data.slots);
        } else if (!allSlots.length) {
          showSlotsError();
        }
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

  loadSlots();
})();
