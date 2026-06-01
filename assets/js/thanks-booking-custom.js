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
    tel = sessionStorage.getItem("_tel") || "";
    name = sessionStorage.getItem("_name") || "";
    lp = sessionStorage.getItem("_lp") || lp;
  } catch (e) {}
  if (!name) {
    var m = document.cookie.match(/(^| )user-name=([^;]+)/);
    if (m) name = decodeURIComponent(m[2]).trim();
  }
  if (!tel) {
    section.style.display = "none";
    return;
  }

  var wrap = document.querySelector(".t-cal__widget-wrap");
  if (wrap) wrap.style.display = "none";

  var visibleDays = Number(window.BOOKING_VISIBLE_DAYS) || 3;
  var fetchDays = Number(window.BOOKING_FETCH_DAYS) || 14;
  var dayOffset = 0;
  var allSlots = [];
  var selected = null;

  function postBook(body) {
    var blob = new Blob([body], {
      type: "application/x-www-form-urlencoded;charset=UTF-8"
    });
    if (navigator.sendBeacon && navigator.sendBeacon(GAS_URL, blob)) return;
    fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      body: body
    }).catch(function () {});
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
        confirm.disabled = true;
        confirm.textContent = "予約中...";

        var p = new URLSearchParams();
        p.append("_event", "book_slot");
        p.append("calendar_start", selected.start);
        p.append("calendar_end", selected.end);
        p.append("calendar_guest_name", name);
        p.append("your-tel", tel);
        p.append("_lp", lp);
        p.append("_page", location.href);
        postBook(p.toString());

        mount.innerHTML =
          '<div class="t-booking-done">' +
          "<p><strong>予約を受け付けました</strong></p>" +
          "<p>" +
          selected.day_label +
          " " +
          selected.time_label +
          " 開始</p>" +
          '<p class="t-booking-done__sub">担当者よりご連絡します</p>' +
          "</div>";

        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: "calendar_booked",
          page_type: "thanks",
          booking_tool: "custom"
        });
      });
    }
  }

  function loadSlots() {
    mount.innerHTML = '<p class="t-booking-loading">空き枠を読み込み中...</p>';
    var cb = "lpBookingSlots_" + Date.now();
    window[cb] = function (res) {
      try {
        delete window[cb];
      } catch (e2) {}
      var script = document.getElementById("booking-slots-jsonp");
      if (script && script.parentNode) script.parentNode.removeChild(script);

      if (!res || !res.ok) {
        mount.innerHTML =
          '<p class="t-booking-empty">空き枠の取得に失敗しました。時間をおいて再度お試しください。</p>';
        return;
      }
      allSlots = res.slots || [];
      dayOffset = 0;
      selected = null;
      render();
    };

    var script = document.createElement("script");
    script.id = "booking-slots-jsonp";
    script.src =
      GAS_URL +
      "?action=slots&days=" +
      encodeURIComponent(String(fetchDays)) +
      "&callback=" +
      encodeURIComponent(cb);
    script.onerror = function () {
      mount.innerHTML =
        '<p class="t-booking-empty">空き枠の取得に失敗しました。</p>';
    };
    document.head.appendChild(script);
  }

  loadSlots();
})();
