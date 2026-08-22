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

/** GASへ問い合わせる日数（sync-booking-slots.js と揃える。表示は BOOKING_VISIBLE_DAYS=3） */
window.BOOKING_FETCH_DAYS = 7;
/** サンクスでは静的JSONのみ（bootstrap と同様） */
window.BOOKING_SLOTS_SKIP_GAS_REFRESH = true;

/**
 * 空き枠JSONのURLは、ページからの相対（"../assets/data/..."）では解決できない。
 * このスクリプトを読むページの深さがバラバラだから（/thanks-v2/ は深さ1、
 * /nenshu-shindan/thanks/ は深さ2）。実際、深さ2の nenshu 系サンクスとLPからは
 * ずっと 404 を引いていて、静的JSONを飛ばしてGASへ落ちていた（2026-08-22 QA で検出）。
 * 自分自身の src から解決すれば、どの深さから読まれても当たる。
 */
window.BOOKING_SLOTS_STATIC_URL = (function () {
  try {
    var s = document.currentScript || document.querySelector('script[src*="thanks-booking-"]');
    if (s && s.src) {
      var u = s.src.replace(/js\/thanks-booking-[a-z-]+\.js(\?.*)?$/, "data/booking-slots.json");
      if (u !== s.src) return u;
    }
  } catch (e) { /* no-op */ }
  return "../assets/data/booking-slots.json";
})();

/** 空き枠キャッシュ（sessionStorage + localStorage） */
window.BOOKING_SLOTS_CACHE_KEY = "dk_booking_slots_cache";
window.BOOKING_SLOTS_CACHE_TTL_MS = 5 * 60 * 1000;
window.BOOKING_SLOTS_LS_KEY = "dk_booking_slots_ls";
window.BOOKING_SLOTS_LS_TTL_MS = 30 * 60 * 1000;

// --- TimeRex（THANKS_BOOKING_MODE=timerex のときのみ） ---
window.TIMEREX_CALENDAR_BASE = "https://timerex.net/s/yuki.shibayama_34d4/1d1870bd";
window.TIMEREX_URL_PARAM_TEL = "your_tel";
window.TIMEREX_URL_PARAM_LP = "lp_id";
window.TIMEREX_PLACEHOLDER_EMAIL_DOMAIN = "bookings.builders-job.com";
window.TIMEREX_EMBED_MIN_WIDTH = 640;
