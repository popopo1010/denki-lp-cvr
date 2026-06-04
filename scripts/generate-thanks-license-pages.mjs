#!/usr/bin/env node
/**
 * thanks-v2/p/{profile-id}/ 資格別サンクスページを生成
 * Usage: node scripts/generate-thanks-license-pages.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profilesPath = path.join(ROOT, "assets/data/thanks-license-profiles.json");
const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf8"));
const ids = Object.keys(profiles.profiles || {});

const targets = [
  {
    src: "thanks-v2/index.html",
    outBase: "thanks-v2",
    assetFrom: "../assets/",
    assetTo: "../../../assets/"
  },
  {
    src: "WPLP/thanks-v2/index.html",
    outBase: "WPLP/thanks-v2",
    assetFrom: "../../assets/",
    assetTo: "../../../../assets/"
  },
  {
    src: "自前LP/thanks-v2/index.html",
    outBase: "自前LP/thanks-v2",
    assetFrom: "../../assets/",
    assetTo: "../../../../assets/"
  }
];

let total = 0;

for (const { src, outBase, assetFrom, assetTo } of targets) {
  const srcPath = path.join(ROOT, src);
  if (!fs.existsSync(srcPath)) {
    console.warn("skip (missing source):", src);
    continue;
  }
  const html = fs.readFileSync(srcPath, "utf8");
  for (const id of ids) {
    const dir = path.join(ROOT, outBase, "p", id);
    fs.mkdirSync(dir, { recursive: true });
    const out = html.split(assetFrom).join(assetTo);
    fs.writeFileSync(path.join(dir, "index.html"), out, "utf8");
    total++;
  }
  console.log(`generated ${ids.length} pages under ${outBase}/p/`);
}

console.log(`total ${total} license thanks pages`);
