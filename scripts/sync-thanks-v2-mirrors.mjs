#!/usr/bin/env node
/**
 * thanks-v2/index.html を WPLP / 自前LP ミラーへ同期（assets パス変換）
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(ROOT, "thanks-v2/index.html"), "utf8");
const mirrors = ["WPLP/thanks-v2/index.html", "自前LP/thanks-v2/index.html"];

for (const rel of mirrors) {
  // service/ も assets/ と同じく1階層深くなる。これを忘れると
  // 「サービスについて」の導線だけ再生成のたびに壊れる（2026-08-31）。
  const html = src
    .replace(/\.\.\/assets\//g, "../../assets/")
    .replace(/\.\.\/service\//g, "../../service/");
  fs.writeFileSync(path.join(ROOT, rel), html, "utf8");
  console.log("synced", rel);
}

const gen = spawnSync("node", ["scripts/generate-thanks-license-pages.mjs"], {
  cwd: ROOT,
  stdio: "inherit"
});
if (gen.status !== 0) process.exit(gen.status || 1);
