/**
 * 标签体系：主分类 + 技术标签两层
 *
 * 收敛前的状态：35 篇文章挂了 103 个不同标签，其中 56 个只出现一次 ——
 * 点进去只有一篇文章，那不叫筛选，叫搜索结果页。更糟的是同一件事有三个名字：
 * React / 前端工程(19) / 前端(3) / 前端进阶(1)，语义完全重叠。
 *
 * 两层的分工：
 * - 主分类（CATEGORY_TAGS）：文章领域，横向 tab，每篇 1~2 个，互斥性高。
 *   读者用「我要看前端」这种粗粒度意图导航。
 * - 技术标签（TECH_TAGS）：跨领域的技术点，一篇可以挂好几个。
 *   React / TypeScript / Go 在前端和后端文章里都可能出现，它不属于任何单一分类。
 *
 * 为什么不做成树：22 个标签、35 篇文章，树形层级的导航收益是零，
 * 但「点进去只有一篇文章」的负收益是实的。摊平成两层刚好。
 *
 * CUSTOM_STORAGE_KEY 里存的是读者自己加的标签。这个设计有意的：
 * 自动分类永远会有归错的时候，与其强迫读者接受，不如给他一个出口。
 */

/** 主分类：文章的领域 */
export const CATEGORY_TAGS = [
  "前端工程",
  "后端架构",
  "AI Agent",
  "大模型应用",
  "工程实践",
  "产品设计",
  "科学计算",
] as const;

export type CategoryTag = (typeof CATEGORY_TAGS)[number];

/** 技术标签：跨领域的技术点 */
export const TECH_TAGS = [
  "React",
  "TypeScript",
  "JavaScript",
  "Go",
  "Python",
  "WebSocket",
  "SSE",
  "RAG",
  "流式渲染",
  "自定义 Hook",
  "状态机",
  "缓存策略",
  "性能优化",
  "PostgreSQL",
  "Kubernetes",
] as const;

export type TechTag = (typeof TECH_TAGS)[number];

export const ALL_BUILTIN_TAGS: string[] = [...CATEGORY_TAGS, ...TECH_TAGS];

/** 读者自定义标签的 localStorage 键 */
export const CUSTOM_STORAGE_KEY = "blog_custom_tags";

/** 分类 → 该分类下的文章数。用于 tab 上的计数徽标 */
export function countByCategory(
  posts: { tags: string[] }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    for (const tag of post.tags) {
      if ((CATEGORY_TAGS as readonly string[]).includes(tag)) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/** 技术标签 → 出现次数。只统计 >= 2 次的，一次性的标签不值得占筛选位 */
export function countByTechTag(
  posts: { tags: string[] }[],
  minCount = 2,
): { tag: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    for (const tag of post.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .map(([tag, count]) => ({ tag, count }));
}

/** 读取读者自定义的标签，附带去重与内置过滤 */
export function loadCustomTags(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is string => typeof t === "string" && t.trim() !== "",
    );
  } catch {
    // localStorage 被禁（无痕模式）或数据损坏时不能让整页崩
    return [];
  }
}

/** 保存自定义标签。写失败（配额满）静默降级，不打扰读者 */
export function saveCustomTags(tags: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(tags));
  } catch {
    // 配额满 / 隐私模式，忽略
  }
}

/** 新增一个自定义标签。与内置和已有自定义标签重复时返回原列表（不重复添加） */
export function addCustomTag(tags: string[], tag: string): string[] {
  const trimmed = tag.trim();
  if (!trimmed) return tags;
  if (ALL_BUILTIN_TAGS.includes(trimmed)) return tags;
  if (tags.includes(trimmed)) return tags;
  return [...tags, trimmed];
}

/** 移除一个自定义标签 */
export function removeCustomTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}