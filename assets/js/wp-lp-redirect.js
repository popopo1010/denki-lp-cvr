/**
 * WordPress 旧LP slug → 静的LP へ転送（GTM Custom HTML から読み込み）
 * v2-deploy/gtm/wp-redirect-snippet.html 参照
 */
(function () {
  "use strict";
  var ORIGIN = "https://denkilp.builders-job.com";
  var MAP = {
    "/denkikouji-kyujin-2-v2": "/denki-lp-cvr/denkikouji-v2/",
    "/denkikouji-kyujin-2-v2/": "/denki-lp-cvr/denkikouji-v2/",
    "/denkikouji-kyujin-2": "/denki-lp-cvr/denkikouji/",
    "/denkikouji-kyujin-2/": "/denki-lp-cvr/denkikouji/",
    "/sekokan": "/denki-lp-cvr/sekoukanri/",
    "/sekokan/": "/denki-lp-cvr/sekoukanri/",
    "/thanks": "/denki-lp-cvr/thanks-v2/",
    "/thanks/": "/denki-lp-cvr/thanks-v2/"
  };
  var dest = MAP[location.pathname];
  if (!dest) return;
  location.replace(ORIGIN + dest + (location.search || "") + (location.hash || ""));
})();
