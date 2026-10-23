/**
 * SPA fallback 生成器
 *
 * 背景：GitHub Pages 是纯静态托管，没有服务端重写规则。直接访问
 * https://xxx.github.io/blog 或把 /blog/xxx 粘给别人，服务器返回 404，
 * 不会把请求转给 index.html —— 实测 /blog、/settings 全部 404。
 *
 * 做法：生成一份极简 404.html，只做一件事——把原始路径编码进 query，
 * 重定向到站点根目录：
 *
 *   /blog/xxx  →  /?p=%2Fblog%2Fxxx  →  index.html (200)
 *
 * index.html 加载后由 src/main.tsx 里的 restoreSpaPath() 把地址栏
 * 还原成 /blog/xxx，React Router 才能匹配到对应路由。
 *
 * 为什么不在 404.html 里直接放 React 应用：
 *   那样会出现「先在 404 页渲染一次，再重定向渲染一次」的双启动，
 *   而且 404.html 里的相对资源路径在深层 URL 下会解析成 /blog/assets/x.js
 *   直接 404。现在 404.html 零依赖、不加载任何 JS，落地更快也更稳。
 *
 * 死循环防护：还原后的地址 query 里会带上 p= 参数，脚本检测到就��接返回。
 */

const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "..", "dist");
const indexPath = path.join(distDir, "index.html");
const outPath = path.join(distDir, "404.html");

if (!fs.existsSync(indexPath)) {
  console.error("[spa-fallback] dist/index.html 不存在，跳过");
  process.exit(0);
}

// 从 index.html 里推出站点根路径：
// 用户主页（user.github.io）→ /，项目页（user.github.io/repo）→ /repo
const indexHtml = fs.readFileSync(indexPath, "utf8");
const baseMatch = indexHtml.match(/src="(\/[^"]*?)\/assets\/[^"]+\.js"/);
const rawBase = baseMatch ? baseMatch[1] : "";
// 统一成带尾斜杠的站点根
const siteRoot = rawBase ? `${rawBase}/` : "/";

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>跳转中...</title>
    <script>
      // GitHub Pages 对未知路径返回 404.html，但 URL 保持原样。
      // 这里把原始路径（含 query 和 hash）编码进 ?p=，重定向到站点根目录，
      // 由 index.html 加载后还原地址栏并交给 React Router 处理。
      (function () {
        var l = window.location;

        // 已经还原过一次了，别再套一层，否则会死循环
        if (l.search.indexOf("p=") === 1) return;

        // target 必须是相对站点根的路径，否则 React Router 匹配不到路由
        var target = l.pathname;
        var root = ${JSON.stringify(siteRoot)};
        if (root !== "/" && target.indexOf(root) === 0) {
          target = target.slice(root.length) || "/";
        }

        l.replace(root + "?p=" + encodeURIComponent(target + l.search + l.hash));
      })();
    </script>
  </head>
  <body>
    <p style="font-family:system-ui,sans-serif;text-align:center;padding:3rem;color:#666">
      正在打开文章...
    </p>
  </body>
</html>
`;

fs.writeFileSync(outPath, html, "utf8");
console.log(
  `[spa-fallback] 已生成 ${path.relative(process.cwd(), outPath)} (siteRoot=${siteRoot})`,
);
