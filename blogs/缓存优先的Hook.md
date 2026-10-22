---
title: "缓存优先的 Hook：先渲染缓存再后台刷新，而不是转圈"
date: "2026-10-03"
tags: ["React", "自定义 Hook", "缓存策略", "localStorage", "前端工程"]
cover: ""
description: "每次路由切换都转圈等接口，用户体验极差。AtomOS 的 usePersistentCache 先从 localStorage 同步读出缓存渲染，再后台刷新拉最新。讲解 stale-while-revalidate 模式、fetch-through 的取舍、以及为什么 localStorage 写入要吞异常。"
---

# 缓存优先的 Hook：先渲染缓存再后台刷新，而不是转圈

大多数应用的页面切换是这样的：

```
点击 → loading 转圈 → 接口返回 → 渲染内容
```

AtomOS 大部分面板不是这样：

```
点击 → 立刻渲染上次的数据 → 后台静默拉取 → 有变化才更新
```

差别在于**用户等的是"内容"还是"转圈"**。前者感知延迟接近 0——即使数据是几秒前的。

## 一、完整的实现

```typescript
// localStorage-backed caches. Used so panels (sessions, workspace files,
// tree expansion) survive route changes and don't auto-refetch on every
// remount. Components opt into a refresh via an explicit user action.

export type PersistentCache<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (next: T | null) => void;
};

export function usePersistentCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): PersistentCache<T> {
  const [data, setDataRaw] = useState<T | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const setData = useCallback(
    (next: T | null) => {
      setDataRaw(next);
      try {
        if (next === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
```

先看注释里的两个设计动机：

> `survive route changes` —— 数据在路由切换后存活（从 Workspace 切到 Jobs 再回来，会话列表不用重新加载）

> `don't auto-refetch on every remount` —— **组件每次重挂载不自动拉接口**。这是关键——多数应用的 useEffect(() => { fetch() }, []) 意味着每次挂载都拉一次，来回切几次标签页就是几十次请求。

> `Components opt into a refresh via an explicit user action` —— **刷新是用户主动触发的**，不是自动的。这个立场和后面那个 background refresh 有点矛盾，值得细看。

## 二、同步读取：useState 的惰性初始化

```typescript
const [data, setDataRaw] = useState<T | null>(() => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
});
```

**localStorage 是同步 API**，读它不需要 await。所以可以直接在 useState 的惰性初始化函数里读——首次渲染就有数据，**没有 loading 态，没有空态，用户看到的是内容**。

用 `useState(() => ...)` 而不是 `useState(...)` 很关键：传函数（惰性初始化）时 React 只在首次挂载时调用一次；直接传值则是每次渲染都执行（虽然 React 会忽略非首次的返回值，但读 localStorage 的开销白白付了）。

try/catch 包住整个读取——**JSON.parse 可能抛**（用户手改过 localStorage、被别的代码写坏了），损坏的缓存等于没有缓存。

## 三、latest ref：fetcher 不进依赖

```typescript
const fetcherRef = useRef(fetcher);
fetcherRef.current = fetcher;
```

和可见性轮询那篇完全同一个模式。fetcher 通常是组件内定义的闭包，每次渲染新引用。放进依赖会导致 `refresh` 每次渲染都重建——而 `refresh` 如果被放进 useEffect 依赖，就会形成"渲染 → 新 refresh → 重建 effect → 触发请求 → 渲染"的循环。

**ref + 函数式解引用**让 fetcher 保持最新，同时不参与依赖计算。

## 四、写 localStorage 吞异常

```typescript
try {
  if (next === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(next));
} catch {
  /* ignore */
}
```

**写入失败静默忽略**。这看起来很消极，实际上是刻意的：

localStorage 在这些情况下会抛 `QuotaExceededError` 或 `SecurityError`：
- 数据满了（通常 5-10MB 上限）
- 隐私模式下某些浏览器禁写
- 用户清了存储配额
- 跨域 iframe 里访问受限

**缓存写失败绝不能影响主流程**。用户点开面板是为了看数据，不是为了看"缓存写满了"的报错。写失败最坏的结果是下次没有缓存——可接受的降级。

而 localStorage 里存的是什么数据？会话列表、workspace 文件树、展开状态——**都是可以从服务端重建的派生数据**。不是关键数据。

## 五、那个矛盾的"opt into refresh"

注释说"组件通过显式用户操作来选择刷新"，但代码里 mount 时还是会自动跑一次刷新：

```typescript
  // Hydrate from cache instantly on first mount (no loading spinner), then
  // ALWAYS kick off a background refresh so the cached payload is brought up
  // to schema/state with the server. Without this, a localStorage payload
```

（注释在这段被截断了，但从上下文能看出全部意图）

**"ALWAYS kick off a background refresh"** —— 这句大写强调的 ALWAYS 是重点。理由：

**缓存可能是旧 schema**。应用升级后数据结构变了（字段改名、类型调整），localStorage 里躺着上个版本的 payload。**不刷新，UI 会拿着旧结构渲染，可能直接崩**。

所以：mount 时静默拉一次，把缓存带到最新 schema。注释的措辞"brought up to schema/state with the server"——双重目的：既更新数据，也更新结构。

这和注释里的 "opt into refresh" 不矛盾：**用户可以额外触发刷新**（比如点刷新按钮），但 mount 时的那次后台刷新是保底机制，不可关闭。

## 六、stale-while-revalidate：缓存刷新的标准范式

这个模式在 HTTP 缓存里有正式名字，叫 **stale-while-revalidate（SWR）**，也是 Next.js 的 SWR 库名字的来源：

```
stale（陈旧但可用）→ 立即返回
while revalidating（后台更新中）→ 同时发请求
→ 新数据到达 → 更新
```

对比传统的 fetch-then-render：

```
loading → 数据 → 渲染
```

SWR 的感知延迟是**0**，因为缓存先到。

AtomOS 这个 hook 是 SWR 的手写版本，但有个区别：**它把缓存持久化到了 localStorage**，而不是内存。内存缓存在页面刷新后就没了，localStorage 能跨刷新、跨路由保留。

对工作区类应用（用户可能开着几个标签页、频繁切路由）这个区别很实际。

## 七、和可见性轮询的分工

这两个 hook 解决不同的问题：

| | `usePersistentCache` | `usePollWhenVisible` |
|---|---|---|
| 目的 | 消除首屏等待 | 消除后台浪费 |
| 时机 | mount 时读缓存 + 后台刷新 | 可见时轮询 |
| 存储 | localStorage | 无（纯轮询） |
| 用户感知 | 立刻有内容 | 切回来数据新 |

**会话列表用前者**（数据变化不频繁，切路由时立刻显示比实时重要）。**任务状态用后者**（数据本身就在实时变化，缓存反而会误导）。

选哪个取决于**数据的时效性诉求**：用户更怕"等"还是更怕"旧"。

## 八、总结

1. **同步读 localStorage 做惰性初始化**：首屏即内容，无 loading 态
2. **解析失败当没有缓存**：try/catch 包住读取
3. **写失败静默忽略**：缓存是派生数据，写不进去不影响主流程
4. **mount 时必然后台刷新**：缓存可能是旧 schema，不刷新会崩 UI
5. **latest ref 隔离 fetcher**：不参与依赖，避免 effect 循环
6. **持久化到 localStorage 而非内存**：跨刷新、跨路由存活
7. **和可见性轮询分工**：一个治"等"，一个治"浪费"

一句话：**先给用户能用的旧数据，再悄悄给新的——感知延迟的优化往往不是让数据来得更快，而是让等待根本不发生。**