---
title: "PDF 高亮有多难：从 getClientRects 到干净选区的几何合并算法"
date: "2026-10-22"
tags: ["PDF.js", "几何算法", "文本选区", "前端进阶", "AI", "RAG"]
cover: ""
description: "PDF 页面渲染在 Canvas 上，没有真实 DOM 文本节点，所以 DOM Selection 那套用不了。本文从 Range.getClientRects() 出发，逐步推导矩形排序、去包含与同行合并算法，并解释容差为什么必须随缩放比联动。"
---

# PDF 高亮有多难：从 getClientRects 到干净选区的几何合并算法

给 PDF 加高亮，看起来是个十分钟的活：监听选区，把选区涂黄。

等你真的做完一遍，会发现画出来的东西像被狗啃过——一段完整的句子，被拆成十几个歪歪扭扭的黄块，行与行之间断裂，某些地方重复叠加。

原因在于 PDF 页面是渲染在 `<canvas>` 上的。Canvas 里没有真实的文本节点，DOM Selection 那套 `window.getSelection()` + `Range` 的玩法在这里完全失效。

这篇文章记录我在 ScholarClub 里实现 PDF 选区高亮的完整算法推导。**这套几何合并算法，正是 ScholarClub 中 RAG 检索结果溯源高亮的基础**——AI 回答要标注"这句话来自论文第几页哪个位置"，靠的就是它。

## 一、问题的起点：Canvas 上没有文本

先明确一件事：PDF.js 渲染页面用的是 Canvas 2D（或 WebGL），文本是以 `fillText` 画上去的**像素**，不是 DOM 节点。

所以：

- `window.getSelection()` 拿不到 PDF 文字
- `document.createRange()` 无法在 PDF 内容上建立 Range
- CSS 的 `::selection` 伪类对 Canvas 无效

那怎么实现选区？答案是：**PDF.js 在渲染时，同时会生成一个隐藏的透明文本层（text layer）**，把每个文本块以 `<span>` 的形式叠加在 Canvas 上，位置严格对齐。这些 span 是 `color: transparent` 的——看不见，但可被选中、可建立 Range。

所以流程是：

```
用户拖拽 → 命中透明 span → 建立 Range → Range.getClientRects()
        → 得到一堆矩形 → 优化合并 → 绘制高亮
```

关键在倒数第二步。`getClientRects()` 返回的**不是**你最终看到的那几个色块，而是一堆碎片。

## 二、为什么 getClientRects() 返回的是碎片

假设用户选中了同一行里的三个词：

```
[Deep] [Learning]  [for]  [NLP]
```

这三个词在 PDF 里是三个独立的文本 span（PDF 内部本来也是分段存储的）。当 Range 覆盖它们时，`getClientRects()` 会返回三个矩形——**每个词一个**。

更糟的情况：

**1. 一个词内部也可能返回多个矩形**

如果选区跨越了页边距、栏间距、或者 PDF 内部的分栏结构，一个逻辑上的连续段落会返回多个横向分离的矩形。

**2. 同一段文字可能被重复返回**

PDF 文本层为了应对不同字体的包围盒，有时会在同一位置生成重叠的 span。这时候 `getClientRects()` 会给你两个几乎完全重合的矩形。

**3. 跨行、跨页**

用户从第 3 页选到第 4 页，你会拿到带 `pageNumber` 标识的两组矩形。

所以直接把 `getClientRects()` 的结果拿来画高亮，一定会难看。你需要一个**几何合并算法**，把这些碎片整理成干净的高亮块。

## 三、数据结构与坐标系

定义最基础的数据结构，这就是一个普通矩形：

```typescript
export interface LTWH {
  left: number;
  top: number;
  width: number;
  height: number;
}

// 我们需要携带它来自哪一页
export interface LTWHP extends LTWH {
  pageNumber?: number;
}
```

`LTWHP` 是这个算法的核心类型（Left-Top-Width-Height + PageNumber）。后面所有几何判断都作用在它上面。

再强调一次坐标系：所有 `left/top/width/height` 都是**相对当前渲染页面容器**的偏移量。这意味着**如果你缩放了 PDF 页面，这些值要跟着乘缩放比**。这个细节会在第五节咬人。

## 四、三步合并算法

完整实现在 ScholarClub 的 `optimize-client-rects.ts`。核心导出是一个函数：

```typescript
export const optimizeClientRects = (
  clientRects: Array<LTWHP>,
  scaleFactor: number,
): Array<LTWHP> => {
  // ... 见下文
};
```

三步：排序 → 去包含 → 同行合并。

### 4.1 第一步：排序

按"从上到下、从左到右"对所有矩形排序，**但跨页时必须先按页码分组**：

```typescript
const sort = (rects: Array<LTWHP>) =>
  rects.sort((A, B) => {
    const top = (A.pageNumber || 0) * A.top - (B.pageNumber || 0) * B.top;

    if (top === 0) {
      return A.left - B.left;
    }

    return top;
  });
```

这里 `A.pageNumber * A.top` 是一个取巧但有效的技巧——它把"页码"编码进"纵向位置"里，让跨页的矩形能按一个统一的一维纵坐标参与排序。如果你有一份从第 3 页到第 8 页的选区，这样排出来的顺序天然是从第 3 页顶部到第 8 页底部。

### 4.2 第二步：过滤被完全包含的矩形

这一步解决"重叠色块"问题。定义"被包含"：

```typescript
// A 是否完全在 B 内部
const inside = (A: LTWHP, B: LTWHP) =>
  A.pageNumber === B.pageNumber &&
  A.top > B.top &&
  A.left > B.left &&
  A.top + A.height < B.top + B.height &&
  A.left + A.width < B.left + B.width;
```

然后过滤：只保留没有被任何其他矩形包住的。

```typescript
const firstPass = rects.filter((rect) => {
  return rects.every((otherRect) => {
    return !inside(rect, otherRect);
  });
});
```

注意是 `rects.every(...)`——对每一个矩形，检查"是否没有任何其它矩形包含我"。没有任何人包含我，我才留下。

### 4.3 第三步：合并同行和相邻矩形

这是最核心的一步。我们需要两个判据。

**判据 A：是否在同一行**

```typescript
// yMargin 是允许的垂直误差
const sameLine = (A: LTWHP, B: LTWHP, yMargin = 5) =>
  A.pageNumber === B.pageNumber &&
  Math.abs(A.top - B.top) < yMargin &&
  Math.abs(A.height - B.height) < yMargin;
```

`t顶部` 差和 `高度` 差都小于容差，认为同一行。

**判据 B：是否相邻**

```typescript
const nextTo = (A: LTWHP, B: LTWHP, xMargin = 5) => {
  const Aright = A.left + A.width;
  const Bright = B.left + B.width;

  return (
    A.pageNumber === B.pageNumber &&
    A.left <= B.left &&
    Aright <= Bright &&       // B 的右边界在 A 的右边界之内或之后
    B.left - Aright <= xMargin // 水平间隙在容差内
  );
};
```

合并动作：

```typescript
// 把 B 的宽度扩展到覆盖 B
const extendWidth = (A: LTWHP, B: LTWHP) => {
  A.width = Math.max(B.width - A.left + B.left, A.width);
};
```

然后用两轮迭代把所有能合并的都合掉：

```typescript
let passCount = 0;

while (passCount <= 2) { // 最多迭代 2 次
  for (const A of firstPass) {
    for (const B of firstPass) {
      if (A === B || toRemove.has(A) || toRemove.has(B)) {
        continue;
      }

      if (!sameLine(A, B, margin)) {
        continue;
      }

      if (overlaps(A, B)) {
        extendWidth(A, B);
        A.height = Math.max(A.height, B.height);
        toRemove.add(B);
      }

      if (nextTo(A, B, margin)) {
        extendWidth(A, B);
        toRemove.add(B);
      }
    }
  }
  passCount += 1;
}
```

最后过滤掉被标记删除的：

```typescript
return firstPass.filter((rect) => !toRemove.has(rect));
```

这里要理解为什么是"最多两轮"而不是"直到无法合并"：合并会修改 `A` 的宽度，被合并的 `B` 被移除，剩余集合在变化。理论上迭代到不动点更彻底，但实践中两轮已经覆盖绝大多数情况——因为矩形经过第一步排序后基本在有序序列上，一次扫描能合并大部分，第二轮收尾。**再多迭代收益递减，但 O(n²) 的代价是实打实的。** 这是一个有意识的性能取舍。

## 五、最关键的细节：容差必须随缩放比联动

这是我踩过最隐蔽的一个坑，也是我特别想强调的一点。

看算法里所有的容差参数：

```typescript
const BASE_YMARGIN = 5; // 基准误差（假设在 100% 缩放时）
```

用的时候：

```typescript
const margin = BASE_YMARGIN * scaleFactor;
```

**为什么必须乘 `scaleFactor`？**

因为 `getClientRects()` 返回的坐标是**渲染后的屏幕像素**，而 PDF 内部逻辑坐标和屏幕坐标之间差一个缩放比 `scaleFactor`。

如果你把 PDF 缩放到 200%，所有 `top`/`height` 值都会变成原来的两倍。原来两个矩形 `top` 差 3px 属于同一行，缩放后差就变成 6px 了。如果你用固定的 `margin=5`，这个判断就会**失效**——本该合并的同行矩形被判为"不同行"，高亮就断了。

同理，"相邻"的水平间隙 `xMargin` 也会被缩放放大。

**结论：任何基于像素的容差，在缩放场景下都必须是 `基准容差 × 缩放比`。**

这个道理听起来显然，但实际写的时候很容易忘——因为你本地测试时通常是 100% 缩放，一切正常；等用户 Ctrl+滚轮放大才暴露问题。

## 六、边界情况清单

真实场景里还要处理这些：

**跨页选区**  
所有几何判断都带了 `pageNumber ===` 前缀，这是最基础的保护。跨页时每个页面的矩形单独合并，高亮在页面容器上分层绘制。

**重叠判据的一个 bug（值得指出）**  
看 `overlaps` 的原始实现：

```typescript
const overlaps = (A: LTWHP, B: LTWHP) =>
  A.pageNumber === B.pageNumber &&
  A.left <= B.left &&
  B.left <= A.left + A.width;
```

这个判据只检查了 A 的左边界在 B 内部吗……严格说不完全对。如果要严谨判断两个矩形是否水平重叠，更准确的是比较它们在 x 轴上的区间是否有交集。我保留这段代码是因为它在实践中配合 `sameLine` 前置过滤已经够用，但**如果你要把这个算法用到更严格的场景（比如几何图形标注），需要重新审视 `overlaps`。**

**竖排文字 / RTL**  
这个算法假设了 LTR 从左到右。阿拉伯语、希伯来语的 RTL 排版，或者中文竖排，需要额外的方向判断。当前实现没有覆盖。

**缩放重算**  
用户在阅读时缩放页面，所有已保存的高亮坐标都必须按新的 `scaleFactor` 重算，不能用旧值。`useResizeObserver` 负责监听容器尺寸变化并触发重算。

## 七、这套算法和 RAG 溯源的关系

单说 PDF 高亮可能显得很"前端基础"。但在 ScholarClub 里，它服务于一个更核心的功能：**AI 回答的引用溯源**。

当用户问"这篇论文的方法有什么创新"，AI 回答基于检索到的论文段落。这些段落被高亮标注在 PDF 上，并附带"第 5 页 / 第 2 段"这样的定位信息。用户点一下就能跳到原文对应位置。

这意味着：RAG 检索结果 → 定位到 PDF 具体位置 → 用这套几何算法绘制高亮 → 用户可以跳转、评论、追问。一次完整闭环。

**几何算法在这里不是"锦上添花"，它是"AI 回答可被信任"的前提**——如果高亮画不准，用户就无法验证 AI 的引用是否属实，溯源功能形同虚设。

## 结语

给 PDF 做高亮的难点，从来不是"涂个黄色矩形"。难点在于把一堆来自无结构 Canvas 渲染的碎裂几何信息，还原成用户视觉上连续、可信的选区。

三个核心手法：

1. **排序** 把碎片在逻辑上排列好
2. **去包含** 消除冗余重叠
3. **同行合并** 用容差容忍像素误差，缝合碎片

以及那个最容易翻车的细节——**容差随缩放比联动**。

这些在 ScholarClub 里是真实的工程代码，每一行都在回答一个具体的问题：为什么 polyfill 而不是原生？为什么容差要乘 scaleFactor？为什么迭代两轮就够？想清楚这些，比记住代码本身更重要。