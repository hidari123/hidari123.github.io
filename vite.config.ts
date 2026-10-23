/*
 * @Author: hidari
 * @Date: 2026-05-13 14:52:17
 * @LastEditors: hidari
 * @LastEditTime: 2026-10-22
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

/**
 * 构建结束后清理 dist/models。
 *
 * 背景一：public/models/all-MiniLM-L6-v2/.git_disabled 是一个嵌在 public 里的
 * 裸 git 仓库（目录名被改过，所以 git 不会把它当嵌套仓库处理），里面是
 * Git LFS 的裸对象，约 300MB。Vite 会原样复制整个 public/ 目录，
 * .gitignore 只影响 git 跟踪、不影响构建产物，所以必须在这里显式剔除，
 * 否则每次部署都会把 300MB 推到 gh-pages。
 *
 * 背景二：LFS 完整拉取后，onnx/ 下会同时出现 8 个量化变体（fp32/fp16/int8/
 * q4/q4f16/bnb4/uint8/quantized），合计约 340MB。但运行时只读
 * model_int8.onnx + tokenizer.json + vocab.txt（见 ragService.ts）。
 * 留着其余 7 个只会拖慢 Pages 部署、并把免费额度烧在没人下载的字节上。
 * 取决于开发机怎么装的模型，这里两种多余的体积都要清：
 *   - LFS 指针文件（133 字节的文本）
 *   - 真实但用不到的量化变体
 */
const KEEP_MODEL_FILES = new Set(["tokenizer.json", "vocab.txt", "onnx/model_int8.onnx"]);
const LFS_POINTER_MAX_BYTES = 1024;

function stripUnusedModelFiles(): Plugin {
  return {
    name: "strip-unused-model-files",
    closeBundle() {
      const modelsDir = path.resolve(__dirname, "dist/models");
      if (!fs.existsSync(modelsDir)) {
        console.log("[strip-model] dist/models 不存在，跳过（RAG 功能将降级）。");
        return;
      }

      for (const modelDir of fs.readdirSync(modelsDir)) {
        const base = path.join(modelsDir, modelDir);

        // 1) 裸 git 目录
        const gitDir = path.join(base, ".git_disabled");
        if (fs.existsSync(gitDir)) {
          fs.rmSync(gitDir, { recursive: true, force: true });
          console.log("[strip-model] 已移除裸 git 目录", path.relative(modelsDir, gitDir));
        }

        // 2) 用不到的量化变体 + LFS 指针
        let kept = 0;
        let removed = 0;
        const walk = (dir, prefix) => {
          if (!fs.existsSync(dir)) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full, `${prefix}${entry.name}/`);
              continue;
            }
            const rel = `${prefix}${entry.name}`;
            const size = fs.statSync(full).size;
            // LFS 指针：极小的文本文件，内容是 "version https://git-lfs..."
            const isPointer = size < LFS_POINTER_MAX_BYTES && /\.(onnx|json|txt|bin)$/.test(rel);
            if (isPointer || !KEEP_MODEL_FILES.has(rel)) {
              fs.rmSync(full, { force: true });
              removed++;
            } else {
              kept++;
            }
          }
        };
        walk(base, "");
        console.log(
          `[strip-model] ${modelDir}: 保留 ${kept} 个文件（${kept ? "RAG 可用" : "缺失，RAG 会降级"}），清除 ${removed} 个`
        );
      }
    },
  };
}

/**
 * 生成 404.html（SPA fallback）
 *
 * GitHub Pages 没有服务端重写，未知路径直接 404。部署完必须有这个文件，
 * 否则从外部点进 /blog/xxx 的链接全是死链——面试官从简历或搜索结果点进来
 * 第一眼看到 404，项目当场减分。
 */
function spaFallback(): Plugin {
  return {
    name: "spa-fallback",
    closeBundle() {
      execFileSync(process.execPath, [path.resolve(__dirname, "scripts/spa-fallback.cjs")], {
        stdio: "inherit",
      });
    },
  };
}

/**
 * 生成 SEO 产物（sitemap.xml / rss.xml / robots.txt）
 *
 * 与 404.html 一样，这些文件必须存在于 dist 根目录才能被 GitHub Pages
 * 正确伺服，所以要在构建后生成，而不是放在 public/ 里。
 */
function generateSeo(): Plugin {
  return {
    name: "generate-seo",
    closeBundle() {
      execFileSync(process.execPath, [path.resolve(__dirname, "scripts/generate-seo.cjs")], {
        stdio: "inherit",
      });
    },
  };
}

export default defineConfig({
  // 部署改由 GitHub Actions 负责（.github/workflows/deploy.yml）。
  // 之前用的 vite-plugin-gh-pages 从一个临时 clone 推送，失败被静默吞掉，
  // 日志显示 "Published" 但远端分支其实没更新。
  plugins: [react(), stripUnusedModelFiles(), spaFallback(), generateSeo()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://172.20.65.66:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/v1"),
        // 关键：禁用代理缓冲，确保 SSE 流式传输
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            // 对于 SSE 流式响应，禁用缓冲
            if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache";
              proxyRes.headers["x-accel-buffering"] = "no";
            }
          });
        },
      },
    },
    port: 3000,
    open: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        // 拆开体积大且相对独立的依赖：并行下载 + 缓存粒度变细。
        // 路由级懒加载（见 src/App.tsx）已经按页面切分，这里只处理
        // 跨页面共享的那几块。
        manualChunks(id) {
          // prismjs 只被文章详情用到，且体积不小，单独成块避免拖慢首屏
          if (id.includes("node_modules/prismjs")) return "prism";
          // giscus 只在文章底部渲染，评论框不可见时不必下载
          if (id.includes("node_modules/@giscus")) return "giscus";
          // onnxruntime 必须独立成块：它只在「索引博客」时动态 import，
          // 但 wasm 胶水代码很大，绝不能被 rollup 内联进主 chunk
          if (id.includes("onnxruntime-web")) return "onnx";
        },
      },
    },
  },
  // giscus 只在文章详情页出现，首页没必要提前拉；
  // 动态 import 的 chunk 交给浏览器导航时按需加载
  modulePreload: {
    resolveDependencies(filename, deps) {
      return deps.filter((d) => !d.includes("giscus"));
    },
  },
});