/** サンクス予約: 設定 + 空き枠取得（1リクエスト） */
window.THANKS_BOOKING_MODE = "custom";
window.LP_BOOKING_GAS_URL =
  "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
window.BOOKING_VISIBLE_DAYS = 3;
window.BOOKING_FETCH_DAYS = 5;
window.BOOKING_SLOTS_STATIC_URL = "../assets/data/booking-slots.json";
window.BOOKING_SLOTS_CACHE_KEY = "dk_booking_slots_cache";
window.BOOKING_SLOTS_CACHE_TTL_MS = 5 * 60 * 1000;

(function () {
  var GAS_URL = window.LP_BOOKING_GAS_URL || "";
  var STATIC_URL = window.BOOKING_SLOTS_STATIC_URL || "../assets/data/booking-slots.json";
  var DAYS = Number(window.BOOKING_FETCH_DAYS) || 5;
  var CACHE_KEY = window.BOOKING_SLOTS_CACHE_KEY;
  var CACHE_TTL = window.BOOKING_SLOTS_CACHE_TTL_MS;

  window.dkBookingSlotsReadCache = function () {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.slots || Date.now() - data.ts > CACHE_TTL) return null;
      return data;
    } catch (e) {
      return null;
    }
  };

  window.dkBookingSlotsWriteCache = function (slots, source) {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), slots: slots, source: source || "" })
      );
    } catch (e2) {}
  };

  function fetchStaticSlots() {
    var url = STATIC_URL;
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    url += sep + "t=" + Math.floor(Date.now() / 300000);
    return fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        if (!json || !json.ok || !json.slots || !json.slots.length) return null;
        var ttlMs = (Number(json.ttl_sec) || 300) * 1000;
        if (json.generated_at && Date.now() - new Date(json.generated_at).getTime() > ttlMs) {
          return null;
        }
        return { ts: Date.now(), slots: json.slots, source: "static" };
      })
      .catch(function () {
        return null;
      });
  }

  function fetchGasSlots() {
    if (!GAS_URL) return Promise.resolve(null);
    return new Promise(function (resolve) {
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
        if (payload && payload.ok && payload.slots) {
          resolve({ ts: Date.now(), slots: payload.slots, source: "gas" });
          return;
        }
        resolve(null);
      }
      window[cb] = finish;
      var script = document.createElement("script");
      script.id = "booking-slots-jsonp-pre";
      script.src =
        GAS_URL +
        "?action=slots&days=" +
        encodeURIComponent(String(DAYS)) +
        "&callback=" +
        encodeURIComponent(cb);
      script.onerror = function () {
        finish(null);
      };
      document.head.appendChild(script);
    });
  }

  window.dkBookingSlotsFetch = function (force) {
    if (!force) {
      var cached = window.dkBookingSlotsReadCache();
      if (cached) return Promise.resolve(cached);
    }
    if (!force && window.__dkBookingSlotsInflight) {
      return window.__dkBookingSlotsInflight;
    }
    window.__dkBookingSlotsInflight = fetchStaticSlots().then(function (staticData) {
      if (staticData) {
        window.dkBookingSlotsWriteCache(staticData.slots, staticData.source);
        fetchGasSlots().then(function (gasData) {
          if (gasData && gasData.slots) {
            window.dkBookingSlotsWriteCache(gasData.slots, gasData.source);
          }
        });
        return staticData;
      }
      return fetchGasSlots().then(function (gasData) {
        window.__dkBookingSlotsInflight = null;
        if (gasData && gasData.slots) {
          window.dkBookingSlotsWriteCache(gasData.slots, gasData.source);
          return gasData;
        }
        return null;
      });
    });
    return window.__dkBookingSlotsInflight;
  };

  window.__dkBookingSlotsPromise = window.dkBookingSlotsFetch(false);
})();
