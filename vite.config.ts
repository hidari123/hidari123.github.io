/*
 * @Author: hidari
 * @Date: 2026-05-13 14:52:17
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 15:32:47
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  publicDir: "public", // 确保 public 目录被服务
});
