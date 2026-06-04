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
window.BOOKING_FETCH_DAYS = 3;
/** サンクスでは静的JSONのみ（bootstrap と同様） */
window.BOOKING_SLOTS_SKIP_GAS_REFRESH = true;

/** CDN配信の空き枠JSON（deploy / 5分sync で更新） */
window.BOOKING_SLOTS_STATIC_URL = "../assets/data/booking-slots.json";

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
