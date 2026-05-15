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
  base: "/hidari123.github.io/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
