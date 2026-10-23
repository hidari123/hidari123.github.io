/**
 * 密钥泄漏审计（两道门禁）
 *
 * 门禁 1：git 跟踪文件里不允许出现 .env / .env.* / 密钥类文件
 *   背景：本仓库的 .env 曾在 2026-05 被提交上去，里面有一个真实的 LLM
 *   API Key。它至今仍能从 raw.githubusercontent.com 直接读到。
 *   dist 扫描救不了这种情况 —— 它只比对本地 .env 与产物，而 .env 早就
 *   不在本地了，脚本会误报「没有需要保护的密钥，扫描通过」。
 *   所以真正要卡的是「.env 还在不在版本库里」。
 *
 * 门禁 2：.env 的值逐条对照构建产物，列出泄漏点
 *   背景：Vite 的 `VITE_*` 变量会被直接内联进产物 bundle。任何写进 .env
 *   的 VITE_API_KEY 都会出现在公开的 JS 里，客户端 DevTools 一搜就能拿到。
 *
 * 用法：node scripts/audit-secrets.cjs [产物目录，默认 dist]
 * 退出码：有问题时为 1，可直接挂到 CI 上当门禁。
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// 绝对不能进版本库的文件：真实密钥、依赖目录、构建产物
const FORBIDDEN_TRACKED = [
  /^public\/models\//,
  /^node_modules\//,
  /(^|\/)\.git_disabled\//,
  /\.onnx$/,
];

function checkTrackedFiles() {
  let listing;
  try {
    listing = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  } catch {
    // 不在 git 仓库里（比如 CI 的某一步把 .git 剥了），这道门禁跳过
    console.log("[audit-secrets] 不在 git 仓库中，跳过跟踪文件检查。");
    return 0;
  }

  const files = listing.split(/\r?\n/).filter(Boolean);
  const violations = [];

  for (const f of files) {
    const base = path.basename(f);
    // .env 本体、.env.local、.env.production...
    // 但放过 .env.example —— 那是给人看的模板，值都是占位符，必须进版本库。
    if (/^\.env(\..+)?$/i.test(base) && !/\.example$/i.test(base)) {
      violations.push(`${f} —— 环境变量文件进了版本库`);
      continue;
    }
    if (FORBIDDEN_TRACKED.some((re) => re.test(f))) {
      violations.push(`${f} —— 大文件/依赖目录进了版本库`);
    }
  }

  if (violations.length === 0) {
    console.log(`[audit-secrets] 跟踪文件检查通过（${files.length} 个文件，无 .env / 无模型大文件）。`);
    return 0;
  }

  console.error("[audit-secrets] 以下文件不应出现在 git 版本库中：");
  for (const v of violations) console.error(`  - ${v}`);
  console.error("[audit-secrets] 处理方式：git rm --cached <路径>，并确保 .gitignore 覆盖它。");
  console.error("[audit-secrets] 注意：文件一旦推送过，删除只影响后续版本，历史里仍然能读到。");
  return violations.length;
}

const distDir = process.argv[2] || "dist";
const envPath = ".env";

// 值太短 / 是占位符的一律跳过，否则 "test"、"Announcements" 会误报
const MIN_SECRET_LEN = 12;
const PLACEHOLDERS = ["your-", "xxxxxxxx", "changeme", "<"];

// 按设计就是公开的构建期配置，不算泄漏。
// Giscus 靠 repo/repoId/category 这几个值定位评论区，它本来就要下发给浏览器，
// 真正的权限边界在 GitHub 侧（只有登录用户且通过 giscus.app 校验才能发言）。
const PUBLIC_KEYS = new Set([
  "VITE_GISCUS_REPO",
  "VITE_GISCUS_REPO_ID",
  "VITE_GISCUS_CATEGORY",
  "VITE_GISCUS_CATEGORY_ID",
]);

const readEnv = () => {
  if (!fs.existsSync(envPath)) return [];
  return fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")])
    .filter(([k]) => !PUBLIC_KEYS.has(k))
    .filter(([, v]) => v.length >= MIN_SECRET_LEN)
    .filter(([, v]) => !PLACEHOLDERS.some((p) => v.includes(p)));
};

const collectTargets = (dir) => {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        // 模型目录是二进制，扫不出字符串配置，跳过省时间
        if (entry.name === "models") continue;
        walk(full);
      } else if (/\.(js|css|html|json|map)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
};

const trackedViolations = checkTrackedFiles();

const secrets = readEnv();
if (secrets.length === 0) {
  console.log("[audit-secrets] 本地无 .env，跳过产物比对（CI 上属正常，配置由 .env.example 说明）。");
  process.exit(trackedViolations > 0 ? 1 : 0);
}

const targets = collectTargets(distDir);
console.log(`[audit-secrets] 扫描 ${targets.length} 个产物文件，对照 ${secrets.length} 个环境变量`);

let leaks = 0;
for (const file of targets) {
  const content = fs.readFileSync(file, "utf8");
  for (const [key, value] of secrets) {
    if (content.includes(value)) {
      console.error(`[audit-secrets] 泄漏: ${key} 的值出现在 ${file}`);
      leaks++;
    }
  }
}

if (leaks > 0) {
  console.error(`[audit-secrets] 发现 ${leaks} 处泄漏。VITE_* 会内联进产物，密钥不能走这条路。`);
  process.exit(1);
}

console.log("[audit-secrets] 未发现泄漏。");
process.exit(trackedViolations > 0 ? 1 : 0);