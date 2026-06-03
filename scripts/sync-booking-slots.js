#!/usr/bin/env node
/**
 * GAS から空き枠 JSON を取得し assets/data/booking-slots.json に書き出す。
 * deploy.yml の rsync 前に実行 → CDN 配信でサンクス表示を高速化。
 */
"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");

const GAS_URL =
  process.env.BOOKING_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
const DAYS = process.env.BOOKING_FETCH_DAYS || "5";
const OUT = path.join(__dirname, "../assets/data/booking-slots.json");

function fetchUrl(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    var req = https
      .get(url, function (res) {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirects > 8) return reject(new Error("too many redirects"));
          return resolve(fetchUrl(res.headers.location, redirects + 1));
        }
        var body = "";
        res.on("data", function (chunk) {
          body += chunk;
        });
        res.on("end", function () {
          if (res.statusCode !== 200) {
            reject(new Error("HTTP " + res.statusCode + " for " + url));
            return;
          }
          resolve(body);
        });
      })
      .on("error", reject);
    req.setTimeout(25000, function () {
      req.destroy(new Error("request timeout"));
    });
  });
}

async function main() {
  var url =
    GAS_URL +
    "?action=slots&days=" +
    encodeURIComponent(DAYS) +
    "&format=json";
  var body = await fetchUrl(url);
  var data = JSON.parse(body);
  if (!data || !data.ok || !Array.isArray(data.slots)) {
    throw new Error("invalid slots payload: " + body.slice(0, 200));
  }
  var out = {
    ok: true,
    generated_at: data.generated_at || new Date().toISOString(),
    ttl_sec: 300,
    timezone: data.timezone || "Asia/Tokyo",
    slot_minutes: data.slot_minutes || 15,
    staff_count: data.staff_count,
    assignment: data.assignment,
    allow_overlap: data.allow_overlap,
    end_hour: data.end_hour,
    slots: data.slots
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out) + "\n", "utf8");
  console.log("wrote", OUT, "slots:", out.slots.length);
}

main().catch(function (err) {
  console.error("[sync-booking-slots]", err.message);
  process.exit(1);
});
