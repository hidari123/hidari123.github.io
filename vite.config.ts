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
