// 依赖字节归属：把同一包（@scope/name 或 name）的多个文件合并后排序，
// 否则 lucide 的 30 个 icon 文件各占一行，看不出总量。
const fs = require("fs");
const path = require("path");

const assetsDir = path.resolve(__dirname, "../dist/assets");

function decodeVlq(segment) {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const values = [];
  let shift = 0;
  let value = 0;
  for (const ch of segment) {
    const digit = CHARS.indexOf(ch);
    if (digit === -1) throw new Error(`bad VLQ char: ${ch}`);
    const cont = digit & 32;
    value += (digit & 31) << shift;
    if (cont) shift += 5;
    else {
      const neg = value & 1;
      value >>>= 1;
      values.push(neg ? -value : value);
      value = shift = 0;
    }
  }
  return values;
}

function decodeMappings(mappings) {
  const lines = [];
  let srcIdx = 0, srcLine = 0, srcCol = 0;
  for (const lineStr of mappings.split(";")) {
    let genCol = 0;
    const segs = [];
    for (const segStr of lineStr.split(",")) {
      if (!segStr) continue;
      const v = decodeVlq(segStr);
      genCol += v[0];
      if (v.length >= 4) {
        srcIdx += v[1];
        srcLine += v[2];
        srcCol += v[3];
        segs.push({ genCol, srcIdx });
      } else {
        segs.push({ genCol, srcIdx: -1 });
      }
    }
    lines.push(segs);
  }
  return lines;
}

/** src 路径 → 包名 */
function toPackage(src) {
  const clean = src
    .replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, "")
    .replace(/^.*node_modules\//, "")
    .replace(/\?.*$/, "");

  const parts = clean.split("/");
  if (clean.startsWith("@")) return parts.slice(0, 2).join("/");
  if (parts.length > 1 && !clean.includes("dist/") && !clean.endsWith(".js")) return parts[0];
  // node_modules/<pkg>/dist/... 或 <pkg>/cjs/... 都归到 <pkg>
  const m = clean.match(/^(@[^/]+\/[^/]+|[^/]+)\//);
  return m ? m[1] : clean;
}

/** 自己的 src/ 代码单独归类 */
function isOwn(src) {
  return src.includes("/src/") || src.startsWith("../../src/");
}

const byPkg = new Map();
const byChunk = new Map();

for (const f of fs.readdirSync(assetsDir).filter((n) => n.endsWith(".js"))) {
  const jsPath = path.join(assetsDir, f);
  const mapPath = jsPath + ".map";
  if (!fs.existsSync(mapPath)) {
    byChunk.set(f, { bytes: fs.statSync(jsPath).size });
    continue;
  }

  const size = fs.statSync(jsPath).size;
  const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const lines = decodeMappings(raw.mappings);

  const perSource = new Map();
  for (const segs of lines) {
    const seen = new Set();
    for (const s of segs) {
      if (s.srcIdx < 0) continue;
      const src = raw.sources[s.srcIdx];
      if (src) seen.add(src);
    }
    for (const s of seen) perSource.set(s, (perSource.get(s) ?? 0) + 1);
  }

  const total = [...perSource.values()].reduce((a, b) => a + b, 0) || 1;
  for (const [src, weight] of perSource) {
    const bytes = (weight / total) * size;
    const key = isOwn(src) ? "(项目自身 src/)" : toPackage(src);
    const agg = byPkg.get(key) ?? { bytes: 0, files: new Set() };
    agg.bytes += bytes;
    agg.files.add(f);
    byPkg.set(key, agg);
  }
  byChunk.set(f, { bytes: size });
}

const mode = process.argv[2] ?? "pkg";
const filter = process.argv[3];

if (mode === "chunk") {
  const rows = [...byChunk.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  console.log("=== 各 chunk 体积 ===");
  for (const [f, v] of rows) {
    console.log(`${(v.bytes / 1024).toFixed(1).padStart(9)}KB  ${f}`);
  }
} else {
  let rows = [...byPkg.entries()]
    .map(([pkg, v]) => ({ pkg, bytes: v.bytes, in: [...v.files] }))
    .sort((a, b) => b.bytes - a.bytes);

  if (filter) rows = rows.filter((r) => r.pkg.toLowerCase().includes(filter.toLowerCase()));

  console.log("=== 依赖字节归属（按包合并）===");
  for (const r of rows.slice(0, 30)) {
    console.log(
      `${(r.bytes / 1024).toFixed(1).padStart(9)}KB  ${r.pkg.padEnd(30)} ${r.in.join(" ")}`,
    );
  }
}