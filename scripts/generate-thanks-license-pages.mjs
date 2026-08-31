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
    assetTo: "../../../assets/",
    serviceFrom: "../service/",
    serviceTo: "../../../service/"
  },
  {
    src: "WPLP/thanks-v2/index.html",
    outBase: "WPLP/thanks-v2",
    assetFrom: "../../assets/",
    assetTo: "../../../../assets/",
    serviceFrom: "../../service/",
    serviceTo: "../../../../service/"
  },
  {
    src: "自前LP/thanks-v2/index.html",
    outBase: "自前LP/thanks-v2",
    assetFrom: "../../assets/",
    assetTo: "../../../../assets/",
    serviceFrom: "../../service/",
    serviceTo: "../../../../service/"
  }
];

// 「サービスについて」は工種別ページに分かれている。資格プロファイルごとに
// 正しい工種へ向ける。これが無いと全部テンプレート元（電気工事士）に戻り、
// 施工管理の資格で登録した人が電気工事士のページに着地する。
const SERVICE_BY_PROFILE = {
  denki_1: "denkikouji", denki_2: "denkikouji", denki_shunin: "denkikouji",
  denki_lp: "denkikouji",
  denki_sekou_1: "sekoukanri-denkisekou", denki_sekou_2: "sekoukanri-denkisekou",
  kentiku_1: "sekoukanri-kentiku", kentiku_2: "sekoukanri-kentiku",
  doboku_1: "sekoukanri-doboku", doboku_2: "sekoukanri-doboku",
  sekoukanri_lp: "sekoukanri"
};

let total = 0;

for (const { src, outBase, assetFrom, assetTo, serviceFrom, serviceTo } of targets) {
  const srcPath = path.join(ROOT, src);
  if (!fs.existsSync(srcPath)) {
    console.warn("skip (missing source):", src);
    continue;
  }
  const html = fs.readFileSync(srcPath, "utf8");
  for (const id of ids) {
    const dir = path.join(ROOT, outBase, "p", id);
    fs.mkdirSync(dir, { recursive: true });
    const service = SERVICE_BY_PROFILE[id] || "denkikouji";
    const out = html
      .split(assetFrom).join(assetTo)
      // 深さの調整と工種の差し替えを同時に行う（テンプレート側は任意の工種を指しうる）
      .replace(new RegExp(serviceFrom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-z-]+/", "g"),
               serviceTo + service + "/");
    fs.writeFileSync(path.join(dir, "index.html"), out, "utf8");
    total++;
  }
  console.log(`generated ${ids.length} pages under ${outBase}/p/`);
}

console.log(`total ${total} license thanks pages`);
