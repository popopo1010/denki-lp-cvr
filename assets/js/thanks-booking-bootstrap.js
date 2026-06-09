/** サンクス予約: 設定 + 空き枠取得（静的JSON優先・期限切れ時はGASへ） */
window.THANKS_BOOKING_MODE = "custom";
window.LP_BOOKING_GAS_URL =
  "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
window.BOOKING_VISIBLE_DAYS = 3;
window.BOOKING_FETCH_DAYS = 7;
/** true=常時GAS裏取りしない / false=静的が古い・空のときだけGAS */
window.BOOKING_SLOTS_SKIP_GAS_REFRESH = true;
window.BOOKING_SLOTS_STATIC_URL = "../assets/data/booking-slots.json";
window.BOOKING_SLOTS_CACHE_KEY = "dk_booking_slots_cache";
window.BOOKING_SLOTS_CACHE_TTL_MS = 5 * 60 * 1000;
window.BOOKING_SLOTS_LS_KEY = "dk_booking_slots_ls";
window.BOOKING_SLOTS_LS_TTL_MS = 30 * 60 * 1000;

(function () {
  var GAS_URL = window.LP_BOOKING_GAS_URL || "";
  var STATIC_URL = window.BOOKING_SLOTS_STATIC_URL || "../assets/data/booking-slots.json";
  var DAYS = Number(window.BOOKING_FETCH_DAYS) || 5;
  var CACHE_KEY = window.BOOKING_SLOTS_CACHE_KEY;
  var CACHE_TTL = window.BOOKING_SLOTS_CACHE_TTL_MS;
  var LS_KEY = window.BOOKING_SLOTS_LS_KEY;
  var LS_TTL = window.BOOKING_SLOTS_LS_TTL_MS;

  function filterFutureSlots(slots) {
    var now = Date.now();
    return (slots || []).filter(function (s) {
      if (!s || !s.start) return false;
      var t = new Date(s.start).getTime();
      return !isNaN(t) && t > now;
    });
  }

  function isPayloadFresh(json) {
    if (!json || !json.generated_at) return true;
    var ttlMs = (Number(json.ttl_sec) || 300) * 1000;
    return Date.now() - new Date(json.generated_at).getTime() <= ttlMs;
  }

  function normalizeStaticPayload(json) {
    if (!json || !json.ok || !json.slots || !json.slots.length) return null;
    var future = filterFutureSlots(json.slots);
    if (!future.length) return null;
    return {
      ts: Date.now(),
      slots: future,
      source: isPayloadFresh(json) ? "static" : "static-stale",
      stale: !isPayloadFresh(json)
    };
  }

  function parseCache(raw, ttl) {
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      if (!data || !data.slots || !data.slots.length) return null;
      if (Date.now() - data.ts > ttl) return null;
      var future = filterFutureSlots(data.slots);
      if (!future.length) return null;
      data.slots = future;
      return data;
    } catch (e) {
      return null;
    }
  }

  window.dkBookingSlotsReadCache = function () {
    try {
      var session = parseCache(sessionStorage.getItem(CACHE_KEY), CACHE_TTL);
      if (session) return session;
    } catch (e1) {}
    try {
      return parseCache(localStorage.getItem(LS_KEY), LS_TTL);
    } catch (e2) {
      return null;
    }
  };

  window.dkBookingSlotsWriteCache = function (slots, source) {
    var payload = JSON.stringify({
      ts: Date.now(),
      slots: slots,
      source: source || ""
    });
    try {
      sessionStorage.setItem(CACHE_KEY, payload);
    } catch (e1) {}
    try {
      localStorage.setItem(LS_KEY, payload);
    } catch (e2) {}
  };

  function notifySlotsUpdated(data) {
    if (!data || !data.slots) return;
    try {
      window.dispatchEvent(
        new CustomEvent("dk-booking-slots-updated", { detail: data })
      );
    } catch (e) {}
  }

  function fetchStaticSlots() {
    var url = STATIC_URL;
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    url += sep + "t=" + Math.floor(Date.now() / 300000);
    return fetch(url, { credentials: "same-origin", cache: "no-store" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        return normalizeStaticPayload(json);
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
          var future = filterFutureSlots(payload.slots);
          if (!future.length) {
            resolve(null);
            return;
          }
          resolve({ ts: Date.now(), slots: future, source: "gas" });
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

  function refreshInBackground() {
    fetchStaticSlots().then(function (staticData) {
      if (staticData) {
        window.dkBookingSlotsWriteCache(staticData.slots, staticData.source);
        notifySlotsUpdated(staticData);
        if (!staticData.stale || window.BOOKING_SLOTS_SKIP_GAS_REFRESH) {
          return null;
        }
        return fetchGasSlots();
      }
      if (window.BOOKING_SLOTS_SKIP_GAS_REFRESH) {
        return fetchGasSlots();
      }
      return fetchGasSlots();
    }).then(function (gasData) {
      if (gasData && gasData.slots) {
        window.dkBookingSlotsWriteCache(gasData.slots, gasData.source);
        notifySlotsUpdated(gasData);
      }
    });
  }

  window.dkBookingSlotsFetch = function (force) {
    if (!force) {
      var cached = window.dkBookingSlotsReadCache();
      if (cached) {
        refreshInBackground();
        return Promise.resolve(cached);
      }
    }
    if (!force && window.__dkBookingSlotsInflight) {
      return window.__dkBookingSlotsInflight;
    }
    window.__dkBookingSlotsInflight = fetchStaticSlots()
      .then(function (staticData) {
        if (staticData) {
          window.dkBookingSlotsWriteCache(staticData.slots, staticData.source);
          if (staticData.stale) {
            fetchGasSlots().then(function (gasData) {
              window.__dkBookingSlotsInflight = null;
              if (gasData && gasData.slots) {
                window.dkBookingSlotsWriteCache(gasData.slots, gasData.source);
                notifySlotsUpdated(gasData);
              }
            });
          } else {
            window.__dkBookingSlotsInflight = null;
          }
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
      })
      .catch(function () {
        window.__dkBookingSlotsInflight = null;
        return fetchGasSlots();
      });
    return window.__dkBookingSlotsInflight;
  };

  function prewarmGasRuntime() {
    if (!GAS_URL || window.__dkBookingGasPrewarm) return;
    window.__dkBookingGasPrewarm = true;
    var cb = "lpBookingPrewarm_" + Date.now();
    window[cb] = function () {
      try {
        delete window[cb];
      } catch (e0) {}
      var script = document.getElementById("booking-gas-prewarm");
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };
    var script = document.createElement("script");
    script.id = "booking-gas-prewarm";
    script.src =
      GAS_URL +
      "?action=slots&days=1&callback=" +
      encodeURIComponent(cb);
    script.onerror = function () {
      try {
        delete window[cb];
      } catch (e1) {}
    };
    document.head.appendChild(script);
  }

  window.dkThanksEnsureBookingSlots = function () {
    if (window.__dkBookingSlotsStarted) {
      return window.__dkBookingSlotsPromise || Promise.resolve(null);
    }
    window.__dkBookingSlotsStarted = true;
    prewarmGasRuntime();
    var primed = window.dkBookingSlotsReadCache();
    if (primed) {
      window.__dkBookingSlotsPromise = Promise.resolve(primed);
      refreshInBackground();
    } else {
      window.__dkBookingSlotsPromise = window.dkBookingSlotsFetch(false);
    }
    return window.__dkBookingSlotsPromise;
  };
})();
