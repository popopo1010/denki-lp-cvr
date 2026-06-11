/**
 * CVR Boost — 非クリティカル（アイドル時ロード）
 * 通知・離脱防止・計測・社会的証明アニメ
 */
(function () {
  "use strict";

  function getParam(name) {
    var match = new RegExp("[?&]" + name.replace(/[\[\]]/g, "\\$&") + "(=([^&#]*)|&|#|$)").exec(location.href);
    return match && match[2] ? decodeURIComponent(match[2].replace(/\+/g, " ")) : null;
  }

  function hasStartedForm() {
    var w = document.querySelector('input[name="your-willingness"]');
    if (w && w.value) return true;
    var lic = document.getElementById("license01");
    if (lic && lic.value) return true;
    return document.body.classList.contains("lp-form-step");
  }

  var notifications = [
    { area: "東京都", time: "3分前" },
    { area: "大阪府", time: "5分前" },
    { area: "神奈川県", time: "8分前" },
    { area: "愛知県", time: "12分前" },
    { area: "福岡県", time: "15分前" },
    { area: "埼玉県", time: "18分前" },
    { area: "千葉県", time: "22分前" },
    { area: "北海道", time: "25分前" },
    { area: "兵庫県", time: "28分前" },
    { area: "広島県", time: "32分前" },
  ];

  function initNotifications() {
    var el = document.getElementById("live-notification");
    if (!el) return;
    var textEl = el.querySelector(".cvr-live-notification__text");
    if (!textEl) return;
    var index = Math.floor(Math.random() * notifications.length);

    function show() {
      var n = notifications[index];
      textEl.innerHTML = "<strong>" + n.area + "</strong>の方が<strong>" + n.time + "</strong>に登録しました";
      el.classList.add("is-visible");
    }

    setTimeout(function () {
      show();
      setInterval(function () {
        el.classList.remove("is-visible");
        setTimeout(function () { index = (index + 1) % notifications.length; show(); }, 500);
      }, 8000);
    }, 2000);
  }

  function initExitIntent() {
    var shown = false;
    var coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    function showExitMessage() {
      if (shown || !hasStartedForm()) return;
      shown = true;

      var overlay = document.createElement("div");
      overlay.className = "cvr-exit-overlay";
      overlay.innerHTML =
        '<div class="cvr-exit-modal">' +
        '<p class="cvr-exit-modal__title">まだ登録が完了していません</p>' +
        '<p class="cvr-exit-modal__text">あなたの条件に合った求人が<strong>多数</strong>見つかっています。<br>あと少しで完了です！</p>' +
        '<button type="button" class="cvr-exit-modal__btn" id="cvr-exit-continue">登録を続ける</button>' +
        '<button type="button" class="cvr-exit-modal__close" id="cvr-exit-close">閉じる</button>' +
        "</div>";

      document.body.appendChild(overlay);

      function close() { overlay.remove(); }
      document.getElementById("cvr-exit-continue").addEventListener("click", close);
      document.getElementById("cvr-exit-close").addEventListener("click", close);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    }

    if (!coarsePointer) {
      document.addEventListener("mouseleave", function (e) { if (e.clientY < 10) showExitMessage(); });
    }

    if ("pushState" in history) {
      history.pushState(null, "", location.href);
      window.addEventListener("popstate", function () {
        history.pushState(null, "", location.href);
        showExitMessage();
      });
    }
  }

  function initFormTracking() {
    document.querySelectorAll(".js-step-button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.pageTo && window.dataLayer) {
          window.dataLayer.push({ event: "form_step", step_name: btn.dataset.pageTo });
        }
      });
    });
  }

  function initCountUp() {
    var els = document.querySelectorAll(".cvr-social-proof__number");
    if (!els.length) return;
    var done = false;
    var observer = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || done) return;
      done = true;
      els.forEach(function (el) {
        var raw = el.textContent;
        var suffix = raw.replace(/[\d,]/g, "");
        var target = parseInt(raw.replace(/[^\d]/g, ""), 10);
        var duration = 1500;
        var startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          el.textContent = Math.floor(progress * target).toLocaleString() + suffix;
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target.toLocaleString() + suffix;
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    observer.observe(els[0].closest(".cvr-social-proof"));
  }

  function run() {
    initNotifications();
    initExitIntent();
    initFormTracking();
    initCountUp();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var h4 = document.getElementById("hidden4");
    if (h4) {
      // utm_term はURLから消えても入るよう sessionStorage に保持する
      var term = getParam("utm_term") || "";
      try {
        if (term) sessionStorage.setItem("dk_utm_term", term);
        else term = sessionStorage.getItem("dk_utm_term") || "";
      } catch (e) {}
      h4.value = term;
    }

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 300);
    }
  });
})();
