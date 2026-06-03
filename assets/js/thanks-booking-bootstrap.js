/** サンクス予約: 設定 + 空き枠取得（静的JSON優先） */
window.THANKS_BOOKING_MODE = "custom";
window.LP_BOOKING_GAS_URL =
  "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
window.BOOKING_VISIBLE_DAYS = 3;
window.BOOKING_FETCH_DAYS = 3;
/** サンクス表示中に GAS JSONP で裏取りしない（静的JSON+キャッシュのみで軽量化） */
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

  function parseCache(raw, ttl) {
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      if (!data || !data.slots || !data.slots.length) return null;
      if (Date.now() - data.ts > ttl) return null;
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
    return fetch(url, { credentials: "same-origin", cache: "default" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        if (!json || !json.ok || !json.slots || !json.slots.length) return null;
        var ttlMs = (Number(json.ttl_sec) || 300) * 1000;
        if (
          json.generated_at &&
          Date.now() - new Date(json.generated_at).getTime() > ttlMs
        ) {
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

  function refreshInBackground() {
    if (window.BOOKING_SLOTS_SKIP_GAS_REFRESH) {
      fetchStaticSlots().then(function (staticData) {
        if (staticData) {
          window.dkBookingSlotsWriteCache(staticData.slots, staticData.source);
          notifySlotsUpdated(staticData);
        }
      });
      return;
    }
    fetchStaticSlots().then(function (staticData) {
      if (staticData) {
        window.dkBookingSlotsWriteCache(staticData.slots, staticData.source);
        notifySlotsUpdated(staticData);
        return null;
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
          if (!window.BOOKING_SLOTS_SKIP_GAS_REFRESH) {
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
        if (window.BOOKING_SLOTS_SKIP_GAS_REFRESH) {
          window.__dkBookingSlotsInflight = null;
          return null;
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
        return null;
      });
    return window.__dkBookingSlotsInflight;
  };

  var primed = window.dkBookingSlotsReadCache();
  if (primed) {
    window.__dkBookingSlotsPromise = Promise.resolve(primed);
    refreshInBackground();
  } else {
    window.__dkBookingSlotsPromise = window.dkBookingSlotsFetch(false);
  }
})();
