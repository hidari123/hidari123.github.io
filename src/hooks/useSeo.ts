/*
 * @Author: hidari
 * @Date: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useEffect } from "react";

interface SeoOptions {
  /** 页面标题，不含站点后缀 */
  title?: string;
  /** 页面描述，用于 meta description 和 og:description */
  description?: string;
  /** 分享卡片图片 */
  image?: string;
  /** 规范链接（不含域名） */
  path?: string;
}

const SITE_NAME = "Hitari's Blog";
const SITE_URL = "https://hidari123.github.io";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.svg`;

/** 只在必要时改写 meta，避免重复渲染时反复操作 DOM */
function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * 页面级 SEO。
 *
 * SPA 的 SEO 有个先天短板：爬虫不一定执行 JS，所以每个路由的真实
 * 内容对爬虫是不可见的。GitHub Pages 又没有 SSR 能力，只能退而求其次：
 * 至少保证 title / description / og 标签在客户端路由切换后是正确的，
 * 这样被分享到社交平台时卡片不会串。
 *
 * 真要彻底解决，需要预渲染（vite-ssg 之类），那是另一个量级的工程。
 */
export function useSeo({ title, description, image, path }: SeoOptions): void {
  useEffect(() => {
    const prevTitle = document.title;

    const fullTitle = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} · 前端工程与 LLM 应用实践`;
    document.title = fullTitle;

    if (description) {
      setMeta('meta[name="description"]', "name", "description", description);
    }
    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    if (description) {
      setMeta('meta[property="og:description"]', "property", "og:description", description);
    }
    setMeta('meta[property="og:image"]', "property", "og:image", image ?? DEFAULT_IMAGE);

    if (path) {
      const url = `${SITE_URL}${path}`;
      setMeta('meta[property="og:url"]', "property", "og:url", url);

      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = url;
    }

    return () => {
      document.title = prevTitle;
    };
  }, [title, description, image, path]);
}
