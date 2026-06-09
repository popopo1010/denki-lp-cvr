#!/usr/bin/env node
/**
 * thanks-v2 下部 defer 用 JS を1本に結合（HTTP往復削減）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "assets/js/thanks-v2-deferred.js");
const PARTS = [
  "assets/js/thanks-gtm.js",
  "assets/js/thanks-line-beacon.js",
  "assets/js/thanks-license-profile.js",
  "assets/js/thanks-section-visuals.js",
  "assets/js/thanks-testimonials.js",
  "assets/js/thanks-mobile-ux.js"
];

const banner =
  "/** thanks-v2 deferred bundle — edit parts in assets/js/, then: node scripts/build-thanks-v2-deferred.mjs */\n";

const body = PARTS.map(function (rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    throw new Error("missing part: " + rel);
  }
  return fs.readFileSync(abs, "utf8").trim();
}).join("\n\n");

fs.writeFileSync(OUT, banner + body + "\n", "utf8");
console.log("wrote", OUT, "parts:", PARTS.length);
