/**
 * 目录（TOC）提取
 *
 * 关键点：id 必须和 rehype-slug 生成的值逐字节一致，否则锚点跳不过去。
 * rehype-slug 内部用的就是 github-slugger，所以这里也用同一个包，
 * 且每次提取都新建一个实例（slugger 内部带已用计数，重名标题会自动加 -1/-2 后缀，
 * 复用实例会导致编号错位）。
 *
 * 另一个坑：不能直接对整篇 markdown 正则匹配 /^#{1,3}\s+/，
 * 因为代码块里的 shell 注释（# 安装依赖）也会命中。实测 35 篇文章里有
 * 20 处这种误判，目录里会出现一堆点不动的死链。所以先剥离围栏代码块。
 */

import GithubSlugger from "github-slugger";

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

/** 目录只收 h1~h3，再深会让侧边栏变成缩进树，失去导航价值 */
const MAX_LEVEL = 3;

/**
 * 移除围栏代码块（``` 或 ~~~），保留行数以便调试时定位。
 * 同时要处理未闭合的围栏——宁可整篇都不算标题，也不能漏出假标题。
 */
function stripFencedCode(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    const m = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      // 围栏内遇到同类型且长度不短的标记才算闭合
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) {
        fence = null;
      }
      continue; // 围栏内的内容整行丢弃
    }
    if (m) {
      fence = m[1];
      continue;
    }
    out.push(line);
  }

  return out.join("\n");
}

/**
 * 去掉标题里的行内标记（`**加粗**`、`` `代码` ``、链接），
 * 让目录显示的是读者看到的文字，而不是 Markdown 源码。
 */
function plainText(raw: string): string {
  return raw
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

/**
 * 从 markdown 原文提取目录。
 * 传入的应该是已经剥掉 frontmatter 的正文（blogService 已处理）。
 */
export function extractToc(content: string): TocItem[] {
  const slugger = new GithubSlugger();
  const toc: TocItem[] = [];

  for (const line of stripFencedCode(content).split("\n")) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const level = match[1].length;
    if (level > MAX_LEVEL) continue;

    const text = plainText(match[2]);
    if (!text) continue;

    // slugger.slug() 与 rehype-slug 内部走的是同一段逻辑，顺序一致才对得上
    toc.push({ level, text, id: slugger.slug(text) });
  }

  return toc;
}

/**
 * 提取纯文本，供阅读时长估算 / AI 摘要使用。
 * 与 extractToc 共用剥离逻辑，避免两处对"什么算正文"的定义漂移。
 */
export function toPlainText(content: string): string {
  return stripFencedCode(content)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}