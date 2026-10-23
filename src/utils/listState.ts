/*
 * @Author: hidari
 * @Date: 2026-10-23
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { CATEGORY_TAGS } from "@/data/tags";

/**
 * 列表页状态 <-> URL 互转。
 *
 * 为什么必须放进 URL：
 * 原来是 `useState(1)`，页码只活在组件内存里。后果实测到两条：
 *  1. 从第 N 页点进文章再点「返回博客列表」，页码回到 1（用户报的 bug）
 *  2. 刷新 / 分享链接，筛选和页码全丢
 *
 * URL 形态： /blog?cat=工程实践&tag=React,性能优化&page=2
 *
 * 注意这里把原来那个单值 `?tag=` 拆成了 `cat`（主分类）和 `tag`（技术标签列表）。
 * 原实现里 `?tag=` 一个参数身兼两职，还因为「多选标签只留第一个」而丢状态；
 * 分类和技术标签语义本来就不同，混在一个参数里迟早出事。
 *
 * 兼容：仍然接受旧的单值 `?tag=`。老链接（文章页的标签就是链到 `/blog?tag=xxx`）
 * 不能因为这次重构全变 404 —— `parseListState` 会按「先看 cat，没有再按是否属于
 * 分类来决定归 cat 还是 tag」来兜底。
 */

export interface ListState {
  category: string | null;
  tech: string[];
  page: number;
}

const CATEGORY_SET = new Set<string>(CATEGORY_TAGS);

/** 多个值用逗号分隔。中文标签本身不含逗号，不用额外编码 */
export function parseListState(params: URLSearchParams): ListState {
  const catParam = params.get("cat");
  const tagParam = params.get("tag");
  const pageParam = Number(params.get("page"));

  const tech = (tagParam ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // 旧链接兼容：只有 ?tag= 时，看它是不是主分类
  let category = CATEGORY_SET.has(catParam ?? "") ? catParam : null;
  if (!category && !catParam && tech.length > 0 && CATEGORY_SET.has(tech[0])) {
    category = tech[0];
    tech.shift();
  }

  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  return { category, tech, page };
}

/** 序列化回 URL。默认值不写进 URL，避免 `/blog?page=1` 这种噪音 */
export function buildListSearch(state: ListState): string {
  const params = new URLSearchParams();
  if (state.category) params.set("cat", state.category);
  if (state.tech.length > 0) params.set("tag", state.tech.join(","));
  if (state.page > 1) params.set("page", String(state.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** 完整路径。文章页的返回链接要用它 */
export function buildListUrl(state: ListState): string {
  return `/blog${buildListSearch(state)}`;
}