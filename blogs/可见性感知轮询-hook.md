---
title: "可见性感知轮询：一个 hook 省下整个后台标签页的请求"
date: "2026-10-10"
tags: ["React", "自定义 Hook", "性能优化", "浏览器 API", "前端工程"]
cover: ""
description: "轮询任务列表、作业状态——这些后台请求在标签页不可见时纯属浪费。AtomOS 用一个 28 行的 hook 解决：visibilitychange 时清除/恢复定时器，回到可见立刻补一发。讲解 ref 保存 fetcher 避免 interval 重置、以及为什么比 setInterval + 条件判断更稳。"
---

# 可见性感知轮询：一个 hook 省下整个后台标签页的请求

Agent 平台的作业列表、会话列表、任务状态——这些数据需要轮询保持新鲜。但用户把标签页切走之后，**这些请求 100% 是浪费**：没人看的数据，刷新给谁？

AtomOS 的解法是一个 28 行的自定义 hook：`usePollWhenVisible`。

## 一、完整实现

```typescript
// Poll a fetcher on an interval, but only while the page is visible.
// Hidden tabs (document.visibilityState !== "visible") get their timer
// cleared; returning to visibility fires an immediate catch-up tick before
// the interval resumes. Saves battery/server load with zero UX change —
// polling data feeds list UIs that nobody is looking at when hidden.
import { useEffect, useRef } from "react";

export function usePollWhenVisible(fetcher: () => void, intervalMs: number) {
  // Keep the latest fetcher without re-arming the interval on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const tick = () => fetcherRef.current();
    // Fire immediately when (re)entering visibility so hidden periods don't
    // leave stale data on screen.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };
    let timer: number | null = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [intervalMs]);
}
```

28 行，但每一行都有讲究。

## 二、设计点一：ref 保存 fetcher，interval 不重置

第一眼会注意到的模式：

```typescript
const fetcherRef = useRef(fetcher);
fetcherRef.current = fetcher;
```

为什么这么写？考虑错误做法——把 fetcher 直接放进 useEffect 依赖：

```typescript
// 反例
useEffect(() => {
  const timer = setInterval(fetcher, intervalMs);
  return () => clearInterval(timer);
}, [fetcher, intervalMs]);
```

fetcher 通常是组件内定义的函数，**每次渲染都是新引用**。放进依赖意味着每次渲染都销毁重建 interval——轮询节奏被打乱不说，闭包里的过期状态还可能酿成 bug。

ref 方案把两层关注点分开：**interval 的生命周期只跟 intervalMs 走**（依赖数组里只有它），**fetcher 永远用最新的**（ref 每次渲染都刷新，tick 时才解引用）。

注释里写明了意图：

```typescript
// Keep the latest fetcher without re-arming the interval on every render.
```

这是"最新值 ref"（latest ref）模式的标准应用——凡是要把"会变的回调"和"不该变的定时器"绑在一起，都用它。

## 三、设计点二：回到可见立刻补一发

```typescript
const onVisibility = () => {
  if (document.visibilityState === "visible") {
    tick();   // ← 立刻先补一发
    start();  // 然后恢复 interval
  } else {
    stop();
  }
};
```

`tick()` 在 `start()` **之前**。顺序是刻意的：

用户从别的标签页切回来，最想要的是"数据是新的"。如果只恢复 interval 不补发，用户要白等一个完整的轮询周期（可能 10-30 秒）才看到新数据——那这个优化的体验就成了负分：**省了请求，但把等待转嫁给了用户**。

补发的成本几乎为零（一次请求），收益是切回标签页的瞬间数据就是新鲜的。注释里的原话：

```typescript
// Fire immediately when (re)entering visibility so hidden periods don't
// leave stale data on screen.
```

## 四、设计点三：stop 要清引用，start 要判空

```typescript
let timer: number | null = null;
const start = () => {
  if (timer === null) timer = window.setInterval(tick, intervalMs);
};
const stop = () => {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
};
```

`timer` 初始为 null，`start` 有判空守卫，`stop` 清成 null。三处配合保证：

- 连续两次 `start` 不会叠两个 interval（判空挡住）
- 连续两次 `stop` 不会对 null 调 clearInterval（判空挡住）
- 状态（null / number）本身就是"当前有没有在跑"的真相，不需要额外的布尔标志

visibilitychange 在标签页切换、最小化窗口、锁屏时都会触发，`onVisibility` 对称地处理两个方向。

## 五、设计点四：cleanup 完整

```typescript
return () => {
  document.removeEventListener("visibilitychange", onVisibility);
  stop();
};
```

卸载时移除监听 + 停止定时器。缺了移除监听，组件卸载后 `onVisibility` 还会触发——闭包里引用着已卸载组件的 fetcher，轻则报错重则内存泄漏。

## 六、为什么不用 `setInterval + 条件判断`

另一种思路是在 tick 里判断可见性：

```typescript
// 反例
setInterval(() => {
  if (document.visibilityState === "visible") fetcher();
}, intervalMs);
```

功能上近似，但 **interval 本身还在跑**——每 10 秒醒来一次、判断、跳过、睡回去。浏览器对隐藏标签页的定时器有节流（Chrome 对 hidden tab 的 timer 最低降到每分钟一次），但"被节流"和"被清除"是两回事：

- **节流**：定时器还活着，唤醒时补发行为取决于节流策略，切回来可能瞬间连发积压的几次
- **清除**：定时器不存在，切回来精确地"补一发 + 恢复节奏"

后者的行为是**确定的**。配合 visibilitychange 事件驱动，整条链路没有任何"依赖浏览器节流策略"的隐式行为。

## 七、省了多少？

注释里的定位是 `Saves battery/server load with zero UX change`（省电/省服务端负载，零体验损失）。

按典型值算：10 秒轮询一次任务列表，用户挂后台 8 小时 = 2880 次无效请求。一个团队、几十个用户、若干个轮询列表——服务端每天白处理几万到几十万次请求。而用户侧，后台标签页持续的网络唤醒阻止 CPU 进入低功耗状态，笔记本续航实打实地掉。

**产品语义也对**：轮询列表是给"正在看的人"的。不可见 = 没人看 = 不该刷。这不是激进优化，是把请求语义对齐使用语义。

## 八、总结

1. **latest ref 模式**：fetcher 走 ref，interval 生命周期只挂 intervalMs——回调常变、定时器常在
2. **回可见先补发再恢复**：优化的成本不能转嫁给用户
3. **start/stop 对称且防重入**：timer 的 null/number 状态即真相
4. **清除优于节流**：不依赖浏览器对隐藏页的节流策略，行为确定
5. **cleanup 完整**：监听和定时器一起收

一句话：**后台标签页里没有任何数据值得刷新——把轮询挂到 visibilitychange 上，是收益/成本比最高的性能优化之一。**
