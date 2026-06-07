#!/usr/bin/env node
/**
 * deploy/wp-legacy-url-map.json から .htaccess フラグメントを生成
 * Usage: node scripts/generate-wp-redirects-fragment.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAP_PATH = path.join(ROOT, "deploy/wp-legacy-url-map.json");
const OUT_PATH = path.join(ROOT, "deploy/wp-legacy-redirects.htaccess.fragment");

const map = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
const redirects = [...map.redirects].sort(
  (a, b) => b.from.length - a.from.length
);

function toRewriteRule(from, to) {
  const slug = from.replace(/^\/+|\/+$/g, "");
  const target = to.endsWith("/") ? to : `${to}/`;
  return `RewriteRule ^${slug}/?$ ${target} [R=301,L,QSA,NC]`;
}

const lines = [
  "# BEGIN dk-lp-legacy-redirects",
  "# WP旧LP slug → 静的LP（denki-lp-cvr）。deploy.yml が自動適用。",
  "# 生成: node scripts/generate-wp-redirects-fragment.mjs",
  "<IfModule mod_rewrite.c>",
  "RewriteEngine On",
  ...redirects.map(({ from, to }) => toRewriteRule(from, to)),
  "</IfModule>",
  "# END dk-lp-legacy-redirects",
  "",
];

fs.writeFileSync(OUT_PATH, lines.join("\n"), "utf8");
console.log(`Wrote ${OUT_PATH} (${redirects.length} rules)`);
