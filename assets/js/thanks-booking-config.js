/**
 * サンクス予約モード
 * - "custom" … 独自予約（Googleカレンダー + GAS）
 * - "timerex" … TimeRex埋め込み（従来）
 */
window.THANKS_BOOKING_MODE = "custom";

/** GAS Web App（フォーム記録と同じURL） */
window.LP_BOOKING_GAS_URL =
  "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";

/** 画面上に並べる日数（3日表示） */
window.BOOKING_VISIBLE_DAYS = 3;

/** GASへ問い合わせる日数（短いほど応答が速い。3日表示+「次の3日」用に5日） */
window.BOOKING_FETCH_DAYS = 5;

/** 空き枠キャッシュ（sessionStorage） */
window.BOOKING_SLOTS_CACHE_KEY = "dk_booking_slots_cache";
window.BOOKING_SLOTS_CACHE_TTL_MS = 5 * 60 * 1000;

window.dkBookingSlotsReadCache = function () {
  try {
    var raw = sessionStorage.getItem(window.BOOKING_SLOTS_CACHE_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data || !data.slots || Date.now() - data.ts > window.BOOKING_SLOTS_CACHE_TTL_MS) {
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
};

window.dkBookingSlotsWriteCache = function (slots) {
  try {
    sessionStorage.setItem(
      window.BOOKING_SLOTS_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), slots: slots })
    );
  } catch (e2) {}
};

window.dkBookingSlotsFetch = function (force) {
  var GAS_URL = window.LP_BOOKING_GAS_URL || "";
  if (!GAS_URL) return Promise.resolve(null);

  if (!force) {
    var cached = window.dkBookingSlotsReadCache();
    if (cached) return Promise.resolve(cached);
  }

  if (!force && window.__dkBookingSlotsInflight) {
    return window.__dkBookingSlotsInflight;
  }

  var days = Number(window.BOOKING_FETCH_DAYS) || 5;
  window.__dkBookingSlotsInflight = new Promise(function (resolve) {
    var cb = "lpBookingSlotsPre_" + Date.now();
    var done = false;
    function finish(payload) {
      if (done) return;
      done = true;
      try {
        delete window[cb];
      } catch (e1) {}
      var script = document.getElementById("booking-slots-jsonp-pre");
      if (script && script.parentNode) script.parentNode.removeChild(script);
      window.__dkBookingSlotsInflight = null;

      if (payload && payload.ok && payload.slots) {
        window.dkBookingSlotsWriteCache(payload.slots);
        resolve({ ts: Date.now(), slots: payload.slots });
        return;
      }
      resolve(null);
    }

    window[cb] = function (res) {
      finish(res);
    };

    var script = document.createElement("script");
    script.id = "booking-slots-jsonp-pre";
    script.src =
      GAS_URL +
      "?action=slots&days=" +
      encodeURIComponent(String(days)) +
      "&callback=" +
      encodeURIComponent(cb);
    script.onerror = function () {
      finish(null);
    };
    document.head.appendChild(script);
  });

  return window.__dkBookingSlotsInflight;
};

/** サンクス到達前から取得開始（head で実行） */
window.__dkBookingSlotsPromise = window.dkBookingSlotsFetch(false);

// --- TimeRex（THANKS_BOOKING_MODE=timerex のときのみ） ---
window.TIMEREX_CALENDAR_BASE = "https://timerex.net/s/yuki.shibayama_34d4/1d1870bd";
window.TIMEREX_URL_PARAM_TEL = "your_tel";
window.TIMEREX_URL_PARAM_LP = "lp_id";
window.TIMEREX_PLACEHOLDER_EMAIL_DOMAIN = "bookings.builders-job.com";
window.TIMEREX_EMBED_MIN_WIDTH = 640;
