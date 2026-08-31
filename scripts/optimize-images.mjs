#!/usr/bin/env node
/**
 * デプロイ時の画像再圧縮（assets/img のみ・in-place）。
 * - JS/CSS/HTML の minify-on-deploy と同じ思想：ランナー上で圧縮 → rsync。リポジトリ原本は CI 上の一時変更のみ。
 * - sharp が無い環境では何もせず正常終了（ローカルやツール未導入でも壊さない）。
 * - 出力が元より大きくなる場合は採用しない（劣化回避）。
 * 注意：本番 v2/search の FV バナーは WP テーマ側にあり対象外。重い FV はテーマ側で最適化が必要。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* 配信される画像ディレクトリすべてを対象にする（2026-08-19 拡大。従来は assets/img のみで
 * 自前LP/ad-cr の JPG/PNG が未圧縮のまま配信されていた）。docs/ はデプロイ対象外なので含めない。 */
const DIRS = ["assets/img", "自前LP/assets/img", "WPLP/assets/img", "ad-cr/assets"];
/* WPLP/assets/img は 2026-08-31 に追加。WPテーマ配下から画像を引き上げた際、
 * WPLPツリーの app-v2.js が自分の src から ../img を解決する都合で実体が要るようになった。
 * ここに足さないと、そのツリーの画像だけ未圧縮のまま配信される。 */

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.log("optimize-images: sharp 未導入のためスキップ（正常終了）");
  process.exit(0);
}

function listImages(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) out.push(p);
    }
  };
  walk(abs);
  return out;
}

async function reencode(file) {
  const ext = path.extname(file).toLowerCase();
  const before = fs.statSync(file).size;
  const img = sharp(file, { failOn: "none" });
  let out;
  if (ext === ".jpg" || ext === ".jpeg") {
    out = await img.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  } else if (ext === ".png") {
    out = await img.png({ compressionLevel: 9, palette: true }).toBuffer();
  } else if (ext === ".webp") {
    out = await img.webp({ quality: 80 }).toBuffer();
  } else {
    return;
  }
  if (out.length > 0 && out.length < before) {
    fs.writeFileSync(file, out);
    console.log(`  ✓ ${path.relative(ROOT, file)}  ${(before / 1024).toFixed(1)}KB → ${(out.length / 1024).toFixed(1)}KB`);
  } else {
    console.log(`  - ${path.relative(ROOT, file)}  据え置き（${(before / 1024).toFixed(1)}KB／圧縮効果なし）`);
  }
}

let count = 0;
for (const dir of DIRS) {
  for (const file of listImages(dir)) {
    try { await reencode(file); count++; } catch (e) { console.log(`  ! ${file} skip:`, e.message); }
  }
}
console.log(`optimize-images: ${count} files processed.`);
