/**
 * 拉取 RAG 嵌入模型（构建前一步）
 *
 * 背景：all-MiniLM-L6-v2 有 8 个量化变体，合计约 330MB。全部提交进仓库会让
 * clone 变成几百 MB，而且运行时只会用到其中一个。这里改成：
 *   - 模型不进版本库（.gitignore 已忽略 public/models/）
 *   - 需要跑 RAG 时执行本脚本，只下载实际用到的文件
 *   - 部署到 GitHub Pages 时由 CI 执行，没有 AI 功能的用户不会多下一个字节
 *
 * 用法：node scripts/fetch-model.cjs [--force]
 * 环境变量：
 *   VITE_EMBEDDING_MODEL_URL  覆盖模型下载地址（默认 HuggingFace 官方仓库）
 */

const fs = require("fs");
const path = require("path");

const REPO = "Xenova/all-MiniLM-L6-v2";

// 国内直连 huggingface.co 会 ECONNRESET，按顺序试官方源再用镜像兜底。
// CI 在 GitHub 托管 runner 上第一个源就能通，国内开发机走第二个。
const SOURCES = [
  process.env.VITE_EMBEDDING_MODEL_URL,
  `https://huggingface.co/${REPO}/resolve/main`,
  `https://hf-mirror.com/${REPO}/resolve/main`,
].filter(Boolean);

// 有些镜像会对 HEAD / 部分文件返回 200 但内容是 HTML 错误页，
// 所以除了状态码还要校验体积下限，避免把错误页当模型存下来。
const MIN_BYTES = {
  "tokenizer.json": 100_000,
  "vocab.txt": 100_000,
  "onnx/model_int8.onnx": 10_000_000,
};

// 只保留运行时真正读取的文件：
//   tokenizer.json + vocab.txt  → 手写 WordPiece 分词器
//   model_int8.onnx             → 动态量化，21.9MB，CPU 上推理够用
const FILES = [
  "tokenizer.json",
  "vocab.txt",
  "onnx/model_int8.onnx",
];

const outDir = path.join("public", "models", "all-MiniLM-L6-v2");
const force = process.argv.includes("--force");

const exists = (rel) => fs.existsSync(path.join(outDir, rel));

async function tryDownload(base, rel) {
  const res = await fetch(`${base}/${rel}`, { redirect: "follow" });
  if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };

  const buf = Buffer.from(await res.arrayBuffer());
  const min = MIN_BYTES[rel] || 1;
  if (buf.length < min) return { ok: false, why: `体积异常 ${buf.length}B < ${min}B` };

  fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(outDir, rel), buf);
  return { ok: true, bytes: buf.length, source: base };
}

async function download(rel) {
  const dest = path.join(outDir, rel);
  if (exists(rel) && !force) {
    const kb = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`[fetch-model] 跳过 ${rel}（已存在 ${kb}KB）`);
    return;
  }

  const failures = [];
  for (const base of SOURCES) {
    process.stdout.write(`[fetch-model] 下载 ${rel} ← ${base.split("/")[2]} ... `);
    try {
      const r = await tryDownload(base, rel);
      if (r.ok) {
        console.log(`成功 ${(r.bytes / 1024 / 1024).toFixed(2)}MB`);
        return;
      }
      console.log(`失败（${r.why}）`);
      failures.push(`${base.split("/")[2]}: ${r.why}`);
    } catch (err) {
      // ECONNRESET / ETIMEDOUT 之类，换下一个源
      const why = err && err.cause ? err.cause.code || err.code : err.message;
      console.log(`失败（${why}）`);
      failures.push(`${base.split("/")[2]}: ${why}`);
    }
  }

  console.error(`[fetch-model] ${rel} 全部源都失败：${failures.join("; ")}`);
  process.exitCode = 1;
}

(async () => {
  console.log(`[fetch-model] 模型源优先级：${SOURCES.map((s) => s.split("/")[2]).join(" → ")}`);
  for (const f of FILES) await download(f);
  if (process.exitCode) {
    console.error("[fetch-model] 失败。模型缺失时 RAG 索引功能会降级，构建本身不受影响。");
    return;
  }
  console.log("[fetch-model] 完成。若要跳过 RAG 功能，删除 public/models/ 即可。");
})();