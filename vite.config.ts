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

/**
 * 构建结束后删除 dist/models 下的 .git_disabled 目录。
 *
 * 背景：public/models/all-MiniLM-L6-v2/.git_disabled 是一个嵌在 public 里的
 * 裸 git 仓库（目录名被改过，所以 git 不会把它当嵌套仓库处理），里面是
 * Git LFS 的裸对象，约 300MB。Vite 会原样复制整个 public/ 目录，
 * .gitignore 只影响 git 跟踪、不影响构建产物，所以必须在这里显式剔除，
 * 否则每次部署都会把 300MB 推到 gh-pages。
 */
function stripModelGitDir(): Plugin {
  return {
    name: "strip-model-git-dir",
    closeBundle() {
      const modelsDir = path.resolve(__dirname, "dist/models");
      if (!fs.existsSync(modelsDir)) return;

      for (const entry of fs.readdirSync(modelsDir)) {
        const gitDir = path.join(modelsDir, entry, ".git_disabled");
        if (fs.existsSync(gitDir)) {
          fs.rmSync(gitDir, { recursive: true, force: true });
          console.log("[strip-model-git-dir] removed", gitDir);
        }
      }
    },
  };
}

export default defineConfig({
  // 部署改由 GitHub Actions 负责（.github/workflows/deploy.yml）。
  // 之前用的 vite-plugin-gh-pages 从一个临时 clone 推送，失败被静默吞掉，
  // 日志显示 "Published" 但远端分支其实没更新。
  plugins: [react(), stripModelGitDir()],
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
        // 拆开体积大且相对独立的依赖：并行下载 + 缓存粒度变细
        manualChunks: {
          react: ["react", "react-dom"],
          markdown: ["react-markdown", "remark-gfm", "remark-frontmatter"],
          giscus: ["@giscus/react"],
        },
      },
    },
  },
});