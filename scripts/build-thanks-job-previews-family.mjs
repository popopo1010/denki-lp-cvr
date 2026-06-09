#!/usr/bin/env node
/**
 * thanks-job-previews.json を job_family 別に分割（初回 fetch 軽量化）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcPath = path.join(ROOT, "assets/data/thanks-job-previews.json");
const data = JSON.parse(fs.readFileSync(srcPath, "utf8"));

function groupFamily(group) {
  var label = group.label || "";
  if (/施工管理/.test(label)) return "sekoukanri";
  if (/第一種|第二種|第三種|電気主任|電気工事士/.test(label)) return "denki";
  return "sekoukanri";
}

function sharedMeta(source) {
  return {
    pref_regions: source.pref_regions,
    default_license_label: source.default_license_label,
    salary_band_labels: source.salary_band_labels,
    intent_band_labels: source.intent_band_labels,
    market_mid_by_family: source.market_mid_by_family,
    market_mid_by_grade: source.market_mid_by_grade,
    intent_labels: source.intent_labels,
    fallbacks: source.fallbacks
  };
}

for (const family of ["denki", "sekoukanri"]) {
  const groups = (data.groups || []).filter(function (g) {
    return groupFamily(g) === family;
  });
  const out = Object.assign({}, sharedMeta(data), {
    job_family: family,
    groups: groups,
    fallback:
      (data.fallbacks && data.fallbacks[family]) ||
      data.fallback ||
      null
  });
  const rel = "assets/data/thanks-job-previews-" + family + ".json";
  fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(out) + "\n", "utf8");
  console.log("wrote", rel, "groups=" + groups.length);
}
