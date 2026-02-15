import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetsRoot = path.join(root, "public", "assets");
const quality = process.env.WEBP_QUALITY ?? "80";

function walkPngFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const name of entries) {
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkPngFiles(fullPath));
      continue;
    }
    if (name.toLowerCase().endsWith(".png")) {
      files.push(fullPath);
    }
  }
  return files;
}

const cwebpCheck = spawnSync("cwebp", ["-version"], { stdio: "ignore" });
if (cwebpCheck.status !== 0) {
  console.error("cwebp command was not found. Install WebP tools and rerun.");
  process.exit(1);
}

const pngFiles = walkPngFiles(assetsRoot);
if (pngFiles.length === 0) {
  console.log("No PNG files were found.");
  process.exit(0);
}

let converted = 0;
for (const pngPath of pngFiles) {
  const webpPath = pngPath.replace(/\.png$/i, ".webp");
  const result = spawnSync("cwebp", ["-q", quality, pngPath, "-o", webpPath], {
    stdio: "ignore",
  });
  if (result.status === 0) {
    converted += 1;
  }
}

console.log(`Converted ${converted}/${pngFiles.length} files to WebP`);
