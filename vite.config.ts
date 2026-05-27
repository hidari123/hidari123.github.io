/*
 * @Author: hidari
 * @Date: 2026-05-13 14:52:17
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-27 16:07:56
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { ghPages } from "vite-plugin-gh-pages";

export default defineConfig({
  plugins: [
    react(),
    ghPages({
      branch: "gh-pages",
    }),
  ],
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
  },
});
