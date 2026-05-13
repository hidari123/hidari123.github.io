/*
 * @Author: hidari
 * @Date: 2026-05-13 15:59
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 16:23:29
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

export interface Post {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  cover: string;
  description: string;
  content: string;
  excerpt: string;
}

// 文章索引接口
interface PostIndex {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  cover: string;
  description: string;
}

// 缓存已加载的文章
const postCache: Map<string, Post> = new Map();

/**
 * 生成文章摘要
 */
function generateExcerpt(content: string, maxLength: number = 160): string {
  // 移除 Markdown 标题、代码块等
  const plainText = content
    .replace(/^#+\s+/gm, "") // 移除标题
    .replace(/```[\s\S]*?```/g, "") // 移除代码块
    .replace(/`[^`]+`/g, "") // 移除行内代码
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 移除链接，保留文本
    .replace(/[*_~`]/g, "") // 移除强调符号
    .replace(/\n+/g, " ") // 换行转空格
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return plainText.slice(0, maxLength) + "...";
}

/**
 * 获取所有博客文章索引
 */
async function getPostIndex(): Promise<PostIndex[]> {
  try {
    const response = await fetch("/posts/index.json");
    if (!response.ok) {
      console.warn("文章索引不存在");
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error("加载文章索引失败:", error);
    return [];
  }
}

/**
 * 获取所有博客文章
 */
export async function getAllPosts(): Promise<Post[]> {
  try {
    const index = await getPostIndex();

    // 按日期倒序排序
    const sortedIndex = index.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

    // 返回索引信息（不包含完整内容）
    return sortedIndex.map((item) => ({
      slug: item.slug,
      title: item.title,
      date: item.date,
      tags: item.tags,
      cover: item.cover,
      description: item.description,
      content: "",
      excerpt: item.description || "",
    }));
  } catch (error) {
    console.error("获取文章列表失败:", error);
    return [];
  }
}

/**
 * 根据 slug 获取单篇文章
 */
export async function getPostBySlug(slug: string, bypassCache = false): Promise<Post | null> {
  // 检查缓存 (除非明确要求绕过)
  if (!bypassCache && postCache.has(slug)) {
    return postCache.get(slug)!;
  }

  try {
    const response = await fetch(`/blogs/${slug}.md?t=${Date.now()}`); // 添加时间戳防止缓存
    if (!response.ok) {
      return null;
    }

    const content = await response.text();

    // 剥离 frontmatter - 匹配从开头的 --- 到第二个 --- 的所有内容
    // 使用更精确的正则处理各种换行符情况
    const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
    const contentWithoutFrontmatter = content.replace(frontmatterRegex, "");

    // 获取索引信息
    const index = await getPostIndex();
    const indexItem = index.find((item) => item.slug === slug);

    const post: Post = {
      slug,
      title: indexItem?.title || slug,
      date: indexItem?.date || new Date().toISOString().split("T")[0],
      tags: indexItem?.tags || [],
      cover: indexItem?.cover || "",
      description: indexItem?.description || "",
      content: contentWithoutFrontmatter,
      excerpt: generateExcerpt(contentWithoutFrontmatter),
    };

    // 存入缓存
    postCache.set(slug, post);

    return post;
  } catch (error) {
    console.error("加载文章失败:", error);
    return null;
  }
}
