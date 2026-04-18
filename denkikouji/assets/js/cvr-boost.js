/**
 * CVR Boost Script - 電気工事バンク LP改善
 */
(function () {
  "use strict";

  // ========== URL パラメータ取得 ==========
  function getParam(name) {
    var match = new RegExp("[?&]" + name.replace(/[\[\]]/g, "\\$&") + "(=([^&#]*)|&|#|$)").exec(location.href);
    return match && match[2] ? decodeURIComponent(match[2].replace(/\+/g, " ")) : null;
  }

  // ========== リアルタイム通知ローテーション ==========
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

  // ========== 離脱防止 ==========
  function initExitIntent() {
    var shown = false;

    function showExitMessage() {
      if (shown) return;
      var feeling = document.querySelector('input[name="your-feeling"]');
      if (!feeling || !feeling.value) return;
      shown = true;

      var overlay = document.createElement("div");
      overlay.className = "cvr-exit-overlay";
      overlay.innerHTML =
        '<div class="cvr-exit-modal">' +
        '<p class="cvr-exit-modal__title">まだ登録が完了していません</p>' +
        '<p class="cvr-exit-modal__text">あなたの条件に合った求人が<strong>多数</strong>見つかっています。<br>あと少しで完了です！</p>' +
        '<button class="cvr-exit-modal__btn" id="cvr-exit-continue">登録を続ける</button>' +
        '<button class="cvr-exit-modal__close" id="cvr-exit-close">閉じる</button>' +
        "</div>";

      var style = document.createElement("style");
      style.textContent =
        ".cvr-exit-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;animation:cvr-fadeIn .3s ease}" +
        ".cvr-exit-modal{background:#fff;border-radius:16px;padding:32px 24px;text-align:center;max-width:340px;width:100%;animation:cvr-scaleIn .3s ease}" +
        ".cvr-exit-modal__title{font-size:18px;font-weight:800;color:#333;margin-bottom:12px}" +
        ".cvr-exit-modal__text{font-size:13px;line-height:1.7;color:#666;margin-bottom:20px}" +
        ".cvr-exit-modal__text strong{color:#ff5966}" +
        ".cvr-exit-modal__btn{display:block;width:100%;padding:14px;border:none;border-radius:10px;background:#ff5966;color:#fff;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px;box-shadow:0 3px 0 #be5156}" +
        ".cvr-exit-modal__btn:hover{transform:translateY(2px);box-shadow:none}" +
        ".cvr-exit-modal__close{display:block;width:100%;padding:8px;border:none;background:transparent;color:#999;font-size:12px;cursor:pointer}" +
        "@keyframes cvr-fadeIn{from{opacity:0}to{opacity:1}}" +
        "@keyframes cvr-scaleIn{from{transform:scale(0.9);opacity:0}to{transform:scale(1);opacity:1}}";
      document.head.appendChild(style);
      document.body.appendChild(overlay);

      function close() { overlay.remove(); }
      document.getElementById("cvr-exit-continue").addEventListener("click", close);
      document.getElementById("cvr-exit-close").addEventListener("click", close);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    }

    document.addEventListener("mouseleave", function (e) { if (e.clientY < 10) showExitMessage(); });

    if ("pushState" in history) {
      history.pushState(null, "", location.href);
      window.addEventListener("popstate", function () {
        history.pushState(null, "", location.href);
        showExitMessage();
      });
    }
  }

  // ========== フォームトラッキング ==========
  function initFormTracking() {
    document.querySelectorAll(".js-step-button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.pageTo && window.dataLayer) {
          window.dataLayer.push({ event: "form_step", step_name: btn.dataset.pageTo });
        }
      });
    });
  }

  // ========== フローティングCTA ==========
  function initFloatingCta() {
    var cta = document.getElementById("floating-cta");
    var btn = document.getElementById("floating-cta-btn");
    if (!cta || !btn) return;

    var shown = false;
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var range = document.body.scrollHeight - window.innerHeight;
        var scrollPct = range > 0 ? window.scrollY / range : 0;
        if (scrollPct > 0.15 && !shown) {
          shown = true;
          cta.classList.add("is-visible");
        } else if (scrollPct <= 0.1 && shown) {
          shown = false;
          cta.classList.remove("is-visible");
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
      cta.classList.remove("is-visible");
      shown = false;
    });
  }

  // ========== 数値カウントアップ ==========
  function initCountUp() {
    var els = document.querySelectorAll(".cvr-social-proof__number");
    if (!els.length) return;
    var done = false;
    var observer = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || done) return;
      done = true;
      els.forEach(function (el) {
        var target = parseInt(el.textContent.replace(/,/g, ""), 10);
        var duration = 1500;
        var start = 0;
        var startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          var val = Math.floor(progress * target);
          el.textContent = val.toLocaleString();
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target.toLocaleString();
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    observer.observe(els[0].closest(".cvr-social-proof"));
  }

  // ========== 初期化 ==========
  document.addEventListener("DOMContentLoaded", function () {
    var h4 = document.getElementById("hidden4");
    if (h4) h4.value = getParam("utm_term") || "";

    initNotifications();
    initExitIntent();
    initFormTracking();
    initFloatingCta();
    initCountUp();
  });
})();
