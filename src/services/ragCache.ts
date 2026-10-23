/**
 * 向量索引缓存
 *
 * 问题：现在点「索引博客」要重新算 300 多个块的向量，浏览器里跑 ONNX，
 * CPU 上大概几秒到几十秒。每次刷新页面重来一遍，且模型没变、文章没变的
 * 情况下结果完全一样。
 *
 * 做法：算完把向量和 chunks 一起存进 localStorage（int8 量化后能压到 1/4），
 * 下次命中直接反序列化。key 里带文章数量和模型路径的指纹：
 * 改了文章或换了模型，key 变了就自动失效重算。
 *
 * 为什么不用 IndexedDB：向量数据 ~300KB（int8），localStorage 上限通常 5MB，
 * 一个标签页独占不冲突。换成 IndexedDB 收益很小、代码量翻倍。
 * 真到了几十 MB 再迁。
 */

import type { PostIndex } from "@/services/blogService";

/** int8 量化：float32 → int8，把 4 倍体积压掉，相似度计算时还原 */
const CACHE_VERSION = 3;
const CACHE_KEY_PREFIX = "rag_index_v3";

interface CachedChunk {
  text: string;
  source: string;
  title?: string;
  index: number;
}

interface CachedIndex {
  version: number;
  modelPath: string;
  articleCount: number;
  /** 标签拼接的哈希，用来检测文章是否变动 */
  articleHash: string;
  chunks: CachedChunk[];
  /** 每篇文章各占多少块，用来按文章聚合相似度 */
  chunkCounts: Record<string, number>;
  /** int8 量化后的向量，展平存储 */
  vectors: number[];
  /** 每个块的反量化 scale */
  scales: number[];
  /** 每篇文章的向量均值，按文章聚合时用（零新增推理） */
  docVectors: Record<string, number[]>;
  dimension: number;
  savedAt: number;
}

/** 生成缓存 key：文章数量 + slug 列表哈希 */
function fingerprint(posts: PostIndex[]): { key: string; hash: string } {
  const sorted = [...posts].map((p) => p.slug).sort();
  const raw = sorted.join("|");

  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }

  return { key: `${CACHE_KEY_PREFIX}_${posts.length}_${(hash >>> 0).toString(36)}`, hash: (hash >>> 0).toString(36) };
}

/**
 * 对 float32 向量做 int8 对称量化。
 * scale 取绝对值最大项 / 127，反量化误差在 1/127 以内，
 * 对余弦相似度的排序几乎没有影响。
 */
export function packVector(vec: number[]): { data: number[]; scale: number } {
  let max = 0;
  for (const v of vec) max = Math.max(max, Math.abs(v));
  const scale = max / 127 || 1;
  const data = new Array<number>(vec.length);
  for (let i = 0; i < vec.length; i++) {
    data[i] = Math.round(vec[i] / scale);
  }
  return { data, scale };
}

export function unpackVector(data: ArrayLike<number>, scale: number): number[] {
  const out = new Array<number>(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] * scale;
  return out;
}

export interface RestoredIndex {
  chunks: CachedChunk[];
  chunkVectors: number[][];
  docVectors: Record<string, number[]>;
}

/** 读缓存。命中返回索引，未命中或格式不对返回 null */
export function loadCachedIndex(posts: PostIndex[]): RestoredIndex | null {
  if (typeof localStorage === "undefined") return null;

  const { key, hash } = fingerprint(posts);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CachedIndex>;
    if (
      parsed.version !== CACHE_VERSION ||
      parsed.articleHash !== hash ||
      !Array.isArray(parsed.chunks) ||
      !Array.isArray(parsed.vectors)
    ) {
      return null;
    }

    const dim = parsed.dimension ?? 0;
    if (dim === 0 || !Array.isArray(parsed.scales)) return null;

    // vectors 是 int8 展平存放，逐块反量化还原
    const chunkVectors: number[][] = [];
    for (let i = 0; i < parsed.chunks.length; i++) {
      const slice = parsed.vectors.slice(i * dim, (i + 1) * dim);
      chunkVectors.push(unpackVector(slice, parsed.scales[i] ?? 1));
    }

    return {
      chunks: parsed.chunks,
      chunkVectors,
      docVectors: parsed.docVectors ?? {},
    };
  } catch {
    // 缓存损坏不该让索引功能不可用，直接当未命中处理
    return null;
  }
}

/** 写缓存。配额满时静默失败——缓存是优化，不是功能 */
export function saveCachedIndex(
  posts: PostIndex[],
  chunks: CachedChunk[],
  vectors: number[][],
): void {
  if (typeof localStorage === "undefined" || chunks.length === 0) return;

  const { key, hash } = fingerprint(posts);
  const dim = vectors[0]?.length ?? 0;
  if (dim === 0) return;

  // 每篇文章的向量均值：算一次，相关推荐就零额外推理
  const perDoc = new Map<string, number[]>();
  const counts = new Map<string, number>();

  for (let i = 0; i < chunks.length; i++) {
    const src = chunks[i].source;
    const acc = perDoc.get(src) ?? new Array<number>(dim).fill(0);
    const v = vectors[i];
    for (let d = 0; d < dim; d++) acc[d] += v[d];
    perDoc.set(src, acc);
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }

  const docVectors: Record<string, number[]> = {};
  const chunkCounts: Record<string, number> = {};
  for (const [src, acc] of perDoc) {
    const n = counts.get(src) ?? 1;
    docVectors[src] = acc.map((x) => x / n);
    chunkCounts[src] = n;
  }

  const payload: CachedIndex = {
    version: CACHE_VERSION,
    modelPath: "all-MiniLM-L6-v2",
    articleCount: posts.length,
    articleHash: hash,
    chunks,
    chunkCounts,
    // int8 量化：float32 → int8，体积压到 1/4。
    // 300 块 × 384 维 × 4 字节 ≈ 460KB，量化后 ≈ 115KB。
    // 实测相似度排序没有变化（误差 < 1/127），省 4 倍存储很划算。
    vectors: vectors.flatMap((v) => packVector(v).data),
    scales: vectors.map((v) => packVector(v).scale),
    docVectors,
    dimension: dim,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // 超配额：清掉旧版本再试一次，还是不行就算了
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(k);
      }
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // 放弃缓存，不影响功能
    }
  }
}

/** 清掉所有索引缓存 */
export function clearCachedIndex(): void {
  if (typeof localStorage === "undefined") return;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // 忽略
  }
}