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

/** 取得する空き枠の日数 */
window.BOOKING_FETCH_DAYS = 14;

// --- TimeRex（THANKS_BOOKING_MODE=timerex のときのみ） ---
window.TIMEREX_CALENDAR_BASE = "https://timerex.net/s/yuki.shibayama_34d4/1d1870bd";
window.TIMEREX_URL_PARAM_TEL = "your_tel";
window.TIMEREX_URL_PARAM_LP = "lp_id";
window.TIMEREX_PLACEHOLDER_EMAIL_DOMAIN = "bookings.builders-job.com";
window.TIMEREX_EMBED_MIN_WIDTH = 640;
