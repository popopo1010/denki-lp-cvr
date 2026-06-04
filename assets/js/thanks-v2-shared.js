/**
 * thanks-v2 共通（GAS URL / session / dataLayer / HTML escape）
 */
(function () {
  "use strict";

  var LEAD_SESSION_KEY = "dk_lp_lead_v1";
  var dk = (window.dkThanks = window.dkThanks || {});

  dk.GAS_URL =
    window.LP_BOOKING_GAS_URL ||
    "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";

  dk.esc = function (s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  dk.pushDL = function (event, extra) {
    window.dataLayer = window.dataLayer || [];
    var payload = { event: event, page_type: "thanks" };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        payload[k] = extra[k];
      });
    }
    window.dataLayer.push(payload);
  };

  dk.captureTelNameFromQs = function () {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("_tel")) sessionStorage.setItem("_tel", q.get("_tel"));
      if (q.get("_name")) sessionStorage.setItem("_name", q.get("_name"));
    } catch (e) {}
  };

  dk.getTel = function () {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("_tel")) return q.get("_tel");
      return sessionStorage.getItem("_tel") || "";
    } catch (e) {
      return "";
    }
  };

  dk.getName = function () {
    var m = document.cookie.match(/(^| )user-name=([^;]+)/);
    if (m) return decodeURIComponent(m[2]).trim();
    try {
      return (sessionStorage.getItem("_name") || "").trim();
    } catch (e) {
      return "";
    }
  };

  dk.getLpSlug = function () {
    try {
      var params = new URLSearchParams(location.search);
      var fromQs = params.get("lp");
      if (fromQs) return fromQs;
      var raw = sessionStorage.getItem(LEAD_SESSION_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && data.lp) return data.lp;
      }
      return sessionStorage.getItem("_lp") || "";
    } catch (e) {
      return "";
    }
  };

  dk.getJobFamily = function (slug) {
    var s = String(slug || "").toLowerCase();
    if (!s) return "denki";
    if (s.indexOf("nenshu-shindan") >= 0) return "nenshu";
    if (
      s.indexOf("sekoukanri") >= 0 ||
      s.indexOf("kentiku") >= 0 ||
      s.indexOf("doboku") >= 0 ||
      s.indexOf("denkisekou") >= 0
    ) {
      return "sekoukanri";
    }
    return "denki";
  };

  /** thanks-v2 配下の深さに応じた assets/ URL（/p/{id}/ 対応） */
  dk.assetUrl = function (rel) {
    var sub = String(rel || "").replace(/^\/+/, "");
    var path = location.pathname;
    var marker = "/thanks-v2/";
    var idx = path.indexOf(marker);
    if (idx < 0) return "../assets/" + sub;
    var rest = path.slice(idx + marker.length).replace(/[^/]*$/, "");
    var depth = rest ? rest.split("/").filter(Boolean).length : 0;
    var prefix = "../";
    for (var i = 0; i < depth; i++) prefix = "../" + prefix;
    return prefix + "assets/" + sub;
  };
})();
