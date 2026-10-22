---
title: "前端缓存三件套：IndexedDB + LRU 撑起多模态资料缓存"
date: "2026-07-14"
tags: ["IndexedDB", "缓存策略", "LRU", "离线优先", "性能优化", "AI"]
cover: ""
description: "多模态 AI 产品要处理大量几十 MB 的 PDF 和模型素材，localStorage 完全不够用。本文以 ScholarClub 为例，讲解 IndexedDB 的事务模型、一个手写的 LRU 淘汰实现，以及大文件缓存的工程约束。"
---

# 前端缓存三件套：IndexedDB + LRU 撑起多模态资料缓存

现在做 AI 产品，一个绕不开的现实是：**素材普遍偏大**。

一篇论文 PDF 动辄 10-50MB，一份研究报告、扫描件更大；浏览器端 RAG 要加载 embedding 模型，动辄几十 MB；多模态产品还要缓存图片、音频片段。如果每次打开都重新下载，体验直接崩掉。

localStorage 在这种场景下完全不够用。本文以 ScholarClub 为例，讲解我是怎么搭起多模态资料缓存的。**大文件缓存正是 AI 产品（长文档、多模态素材）的基石。**

## 一、为什么不用 localStorage

先把淘汰方案排除掉。localStorage 有三个硬伤：

**1. 同步阻塞主线程**  
每次读写都是同步 API。往里塞一个大 Blob，主线程会明显卡顿——这和上一篇文章"SSE 流式要隔离主线程"是同一个矛盾。

**2. 容量约 5MB**  
配额按 origin 计算，通常 5MB 出头。一个 PDF 都放不下。

**3. 只能存字符串**  
想存文件必须转 base64，而 base64 会让体积膨胀约 33%。50MB 的 PDF 变成 67MB 的字符串，还全程占着内存。

所以需要 IndexedDB——它是浏览器内置的**事务型对象数据库**，支持二进制数据、异步 API、大容量（通常是磁盘可用空间的一定比例）。

## 二、IndexedDB 的基本模型

IndexedDB 不是"一个大 JSON"，它的模型更接近关系数据库：

```
DB (PDFCacheDB)
  └── ObjectStore (pdfs, keyPath: "url")
        ├── { url, blob, size, lastAccessed }
        ├── { url, blob, size, lastAccessed }
        └── ...
```

三个核心概念：

- **Database** — 一个命名的数据库
- **ObjectStore** — 类似"表"，有 keyPath 和索引
- **Transaction** — 对 store 的读/写/删都必须在事务里完成，事务要么全成功要么全回滚

打开数据库的标准写法：

```typescript
const DB_NAME = 'PDFCacheDB';
const STORE_NAME = 'pdfs';

const openDB = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
```

`onupgradeneeded` 只在数据库首次创建或版本升级时触发，这里用来建表。

## 三、存一个 PDF：Blob 直接进库

IndexedDB 原生支持 `Blob`，不需要转 base64——这是它相对 localStorage 的核心优势之一：

```typescript
export const savePDF = async (url: string, blob: Blob) => {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      store.put({
        url,
        blob,                 // Blob 原地存储，不转码
        size: blob.size,
        lastAccessed: Date.now(),  // 为 LRU 记账
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Failed to save PDF to cache:', error);
  }
};
```

每次写入都带一个 `lastAccessed` 时间戳——这是 LRU 淘汰的依据。

## 四、读的时候顺手更新访问时间（容易写错的一步）

读取的逻辑比看上去微妙：

```typescript
export const getPDF = async (url: string): Promise<Blob | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite'); // ← 注意
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          result.lastAccessed = Date.now(); // 更新为"刚刚访问"
          store.put(result);                  // ← 回写
        }
        resolve(result?.blob || null);
      };
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    console.error('Failed to get PDF from cache:', error);
    return null;
  }
};
```

这里有个容易踩的坑：**为什么一个"读"操作用了 `readwrite` 事务？**

因为我们在读取的同时修改了 `lastAccessed` 并回写了记录。这是一次写操作，所以必须是 `readwrite`。如果这里图省事写成 `'readonly'`，随后的 `store.put(result)` 会直接抛 `TransactionInactiveError` 或被静默忽略，导致 **LRU 的访问时间永远不更新，淘汰逻辑完全失效**。

LRU 的"读操作也要算作写"这个特性，是它比 LFU/FIFO 麻烦的地方，但也是它在真实访问场景下更准的原因。

## 五、LRU 淘汰

有了 `lastAccessed`，淘汰就简单了：容量超了，按访问时间从旧到新删，删到不超为止。

```typescript
export const cleanupOldPDFs = async (maxSizeMB: number = 50) => {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  // 1. 取出所有记录
  const request = store.getAll();

  request.onsuccess = () => {
    const allPDFs = request.result;

    // 2. 统计当前总占用
    const totalSize = allPDFs.reduce(
      (sum, pdf) => sum + (pdf.blob.size || 0),
      0,
    );
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    // 3. 超了就淘汰
    if (totalSize > maxSizeBytes) {
      const spaceToFree = totalSize - maxSizeBytes;

      // 按最后访问时间升序：最久没用的排在最前
      const sortedPDFs = [...allPDFs].sort(
        (a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0),
      );

      let spaceFreed = 0;
      for (const pdf of sortedPDFs) {
        if (spaceFreed >= spaceToFree) break;
        store.delete(pdf.url);
        spaceFreed += pdf.blob.size || 0;
      }
    }
  };

  request.onerror = () => {
    console.error('清理缓存时出错:', request.error);
  };
};
```

这个实现简单直接，对几十上百个文件量级完全够用。它不是"教科书级最优化"（更严谨的 LRU 会用双向链表 + Map 做 O(1) 访问），但在这个场景下 `getAll()` 一次拿全量、再排序的代价可以接受。**工程上够用和理论上最优是两件事，要分清。**

## 六、这套方案的现实约束

这部分比算法本身更重要——**缓存的坑通常不在代码，在现实**。

**1. 浏览器配额是会变的**  
`navigator.storage.estimate()` 能查当前 origin 的配额和用量。但这个值随磁盘剩余空间波动，**不要硬编码 50MB**，最好按 `estimate()` 的结果动态决定上限。

**2. 无痕模式下 IndexedDB 可能被禁用或随时清空**  
用户隐私模式、以及某些浏览器设置下，存储随时可能消失。所以**缓存只能当加速手段，绝不能当唯一数据源**。缓存 miss 必须能回源。

**3. 谁来触发清理？**  
`cleanupOldPDFs` 是手动调的。理想情况是在 `savePDF` 之后、或页面空闲时（`requestIdleCallback`）触发。生产环境要考虑：**在移动端 Safari 上，用户切走标签页可能直接杀掉页面，未完成的写入会丢。**

**4. CDN 的 Cache-Control 要配合**  
浏览器本地缓存和 HTTP 缓存是两层。如果服务端对 PDF 设了很长的 `max-age`，用户拿到更新版本会很难受；要设很短，又失去 HTTP 缓存的意义。常见折中是给 PDF 设 `max-age=1d` + `ETag`，本地 IndexedDB 做精细控制。**两层缓存的职责要划清：HTTP 管新鲜度，IndexedDB 管离线可用性。**

## 七、什么时候不需要 IndexedDB

别过度设计：

| 场景 | 建议 |
|---|---|
| 只需缓存几个小配置 | `localStorage` 足够 |
| 小体积的接口结果，需要 TTL | `Cache Storage` 更合适（原生支持过期） |
| 需要离线优先的完整资源（JS/CSS/图片） | **Service Worker + Cache Storage**，别自己造轮子 |
| 大文件二进制（PDF/模型/音视频），需自定义淘汰 | ✅ IndexedDB + 自实现 LRU |
| 浏览器端跑 ML 模型（onnxruntime） | ✅ 同上，模型文件本身就是几十 MB 的静态资源 |

**注意倒数第二行**：如果你要的是"标准的离线缓存"，Service Worker + Cache Storage 是行业标准方案，比手搓 IndexedDB 强。但当你需要"自定义淘汰策略 + 复杂元数据（如 lastAccessed）"时，IndexedDB 才不可替代。

## 结语

大文件缓存听起来是个脏活，但在多模态 AI 产品里它是体验的地基——用户打开一篇 30MB 的论文，是秒开还是干等十秒，是两种产品。

三个要点：

1. **IndexedDB 存 Blob 不转码**，这是它存在的核心理由
2. **LRU 的"读时更新访问时间"要求读写事务**，这是最容易写错的一处
3. **缓存永远是加速层，不是数据源**，必须能优雅降级

在 ScholarClub 里，`pdfCache.ts` 就是这套逻辑的落地。工具不需要多复杂，把边界情况想清楚，比堆功能重要得多。