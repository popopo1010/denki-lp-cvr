#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const patternPages = {
  "root": [
    "index.html",
    "denkikouji/index.html",
    "sekoukanri/index.html",
    "sekoukanri-kentiku/index.html",
    "sekoukanri-doboku/index.html",
    "sekoukanri-denkisekou/index.html",
    "thanks/index.html",
    "privacypolicy/index.html"
  ],
  "WPLP": [
    "WPLP/index.html",
    "WPLP/denkikouji/index.html",
    "WPLP/sekoukanri/index.html",
    "WPLP/sekoukanri-kentiku/index.html",
    "WPLP/sekoukanri-doboku/index.html",
    "WPLP/sekoukanri-denkisekou/index.html",
    "WPLP/thanks/index.html",
    "WPLP/privacypolicy/index.html"
  ],
  "standalone": [
    "自前LP/denkikouji/index.html",
    "自前LP/sekoukanri/index.html",
    "自前LP/sekoukanri-kentiku/index.html",
    "自前LP/sekoukanri-doboku/index.html",
    "自前LP/sekoukanri-denkisekou/index.html",
    "自前LP/thanks/index.html",
    "自前LP/privacypolicy/index.html"
  ]
};

const formPages = [
  "denkikouji/index.html",
  "sekoukanri/index.html",
  "sekoukanri-kentiku/index.html",
  "sekoukanri-doboku/index.html",
  "sekoukanri-denkisekou/index.html",
  "nenshu-shindan/sekoukanri/index.html",
  "nenshu-shindan/sekoukanri-kentiku/index.html",
  "nenshu-shindan/sekoukanri-doboku/index.html",
  "nenshu-shindan/sekoukanri-denkisekou/index.html",
  "meta-lp/denkikouji/index.html",
  "meta-lp/sekoukanri-kentiku/index.html",
  "meta-lp/sekoukanri-doboku/index.html",
  "meta-lp/sekoukanri-denkisekou/index.html",
  "meta-lp/nenshu-shindan-kentiku/index.html",
  "meta-lp/nenshu-shindan-doboku/index.html",
  "meta-lp/nenshu-shindan-denkisekou/index.html",
  "WPLP/denkikouji/index.html",
  "WPLP/sekoukanri/index.html",
  "WPLP/sekoukanri-kentiku/index.html",
  "WPLP/sekoukanri-doboku/index.html",
  "WPLP/sekoukanri-denkisekou/index.html",
  "自前LP/denkikouji/index.html",
  "自前LP/sekoukanri/index.html",
  "自前LP/sekoukanri-kentiku/index.html",
  "自前LP/sekoukanri-doboku/index.html",
  "自前LP/sekoukanri-denkisekou/index.html"
];

const requiredFormTokens = [
  "window.__LP_ID",
  "id=\"step-first\"",
  "js-form-group",
  "js-step-button",
  "wpcf7-form",
  "name=\"your-tel\"",
  "id=\"submit-button\"",
  "privacypolicy"
];

const failures = [];

function relPath(absPath) {
  return path.relative(root, absPath).split(path.sep).join("/");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(rel, message) {
  failures.push(`${rel}: ${message}`);
}

function normalizeAsset(asset) {
  return asset.split("#")[0].split("?")[0].trim();
}

function isExternal(asset) {
  return /^(?:https?:)?\/\//.test(asset) ||
    /^(?:mailto|tel|data|javascript):/i.test(asset) ||
    asset.startsWith("#");
}

function checkLocalAssets(pageRel, html) {
  const dir = path.dirname(path.join(root, pageRel));
  const attrPattern = /\b(?:href|src)=["']([^"']+)["']/g;
  const srcsetPattern = /\bsrcset=["']([^"']+)["']/g;

  let match;
  while ((match = attrPattern.exec(html)) !== null) {
    checkAssetValue(pageRel, dir, match[1]);
  }

  while ((match = srcsetPattern.exec(html)) !== null) {
    match[1].split(",").forEach((entry) => {
      const asset = entry.trim().split(/\s+/)[0];
      checkAssetValue(pageRel, dir, asset);
    });
  }
}

function checkAssetValue(pageRel, dir, rawAsset) {
  const asset = normalizeAsset(rawAsset);
  if (!asset || isExternal(asset) || asset.startsWith("/")) return;

  const assetPath = path.resolve(dir, asset);
  if (!assetPath.startsWith(root + path.sep) && assetPath !== root) {
    fail(pageRel, `asset escapes project: ${rawAsset}`);
    return;
  }

  if (!fs.existsSync(assetPath)) {
    fail(pageRel, `missing local asset: ${rawAsset}`);
  }
}

function scriptSrcs(html) {
  const scripts = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    scripts.push(match[1]);
  }
  return scripts;
}

function checkFormPage(pageRel, html) {
  requiredFormTokens.forEach((token) => {
    if (!html.includes(token)) fail(pageRel, `missing required form token: ${token}`);
  });

  const scripts = scriptSrcs(html).filter((src) => normalizeAsset(src).endsWith("assets/js/app.js"));
  if (scripts.length !== 1) {
    fail(pageRel, `expected exactly one app.js script, found ${scripts.length}`);
    return;
  }

  const appRel = relPath(path.resolve(path.dirname(path.join(root, pageRel)), normalizeAsset(scripts[0])));
  if (!exists(appRel)) {
    fail(pageRel, `app.js not found: ${scripts[0]}`);
    return;
  }

  const appJs = read(appRel);
  if (html.includes("cvr-kuma") && !appJs.includes(".cvr-kuma")) {
    fail(pageRel, `${appRel} does not support .cvr-kuma`);
  }
  if (html.includes("js-fixed-icon") && !appJs.includes(".js-fixed-icon")) {
    fail(pageRel, `${appRel} does not support .js-fixed-icon`);
  }
}

Object.entries(patternPages).forEach(([patternName, pages]) => {
  pages.forEach((pageRel) => {
    if (!exists(pageRel)) {
      fail(patternName, `missing page: ${pageRel}`);
      return;
    }

    const html = read(pageRel);
    checkLocalAssets(pageRel, html);

    if (formPages.includes(pageRel)) {
      checkFormPage(pageRel, html);
    }
  });
});

if (failures.length) {
  console.error("LP guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("LP guard passed.");
