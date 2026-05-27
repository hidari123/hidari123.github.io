/*
 * @Author: hidari
 * @Date: 2026-05-20
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-20 15:12:38
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { getPostIndex, getPostBySlug } from "./blogService";

export interface BlogContent {
  path: string;
  title: string;
  content: string;
}

/**
 * 获取所有博客文章的完整内容
 */
export async function getAllBlogContents(): Promise<BlogContent[]> {
  try {
    const index = await getPostIndex();
    const blogs: BlogContent[] = [];

    for (const item of index) {
      const post = await getPostBySlug(item.slug);
      if (post && post.content) {
        blogs.push({
          path: `/blogs/${item.slug}.md`,
          title: item.title,
          content: post.content,
        });
      }
    }

    console.log(`📥 加载了 ${blogs.length} 篇博客文章`);
    return blogs;
  } catch (error) {
    console.error("加载博客内容失败:", error);
    return [];
  }
}

/**
 * 获取博客索引列表（用于显示）
 */
export async function getBlogIndexList() {
  return await getPostIndex();
}
