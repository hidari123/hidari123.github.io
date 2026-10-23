/**
 * SEO 产物生成器
 *
 * 生成三个文件（都在构建时自动刷新，不手动维护）：
 *   - sitemap.xml   搜索引擎收录用的站点地图
 *   - rss.xml        RSS 订阅源
 *   - robots.txt    告诉爬虫该抓什么、不该抓什么
 *
 * 文章列表来自 public/posts/index.json，和站内展示的是同一份数据源，
 * 不会出现「sitemap 里有但站内点进去 404」的情况。
 */

const fs = require("fs");
const path = require("path");

const SITE_URL = "https://hidari123.github.io";
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");

const indexPath = path.join(root, "public/posts/index.json");

function loadPosts() {
  if (!fs.existsSync(indexPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    return Array.isArray(raw) ? raw : raw.posts || [];
  } catch {
    return [];
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 日期格式（RSS 要求） */
function rfc822(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function buildSitemap(posts) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${SITE_URL}/blog`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE_URL}/ai`, priority: "0.7", changefreq: "monthly" },
    ...posts.map((p) => ({
      loc: `${SITE_URL}/blog/${encodeURIComponent(p.slug)}`,
      priority: "0.8",
      changefreq: "monthly",
      lastmod: p.date,
    })),
  ];

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function buildRss(posts) {
  const items = posts
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((p) => {
      const link = `${SITE_URL}/blog/${encodeURIComponent(p.slug)}`;
      const tags = (p.tags || []).map((t) => `<category>${esc(t)}</category>`).join("\n    ");
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${esc(p.description || "")}</description>
      ${tags}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Hitari's Blog</title>
    <link>${SITE_URL}</link>
    <description>前端工程实践与 LLM 应用探索</description>
    <language>zh-cn</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

function buildRobots() {
  return `User-agent: *
Allow: /

# 大文件资源对爬虫没有价值，排除掉能省带宽
Disallow: /models/
Disallow: /assets/*.wasm

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function main() {
  const posts = loadPosts();

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "sitemap.xml"), buildSitemap(posts), "utf8");
  fs.writeFileSync(path.join(distDir, "rss.xml"), buildRss(posts), "utf8");
  fs.writeFileSync(path.join(distDir, "robots.txt"), buildRobots(), "utf8");

  console.log(
    `[seo] 已生成 sitemap.xml / rss.xml / robots.txt（${posts.length} 篇文章）`,
  );
}

main();
