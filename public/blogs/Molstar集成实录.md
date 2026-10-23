---
title: "Mol* 集成实录：在 React 抽屉里嵌入分子可视化"
date: "2026-10-21"
tags: [前端工程, 工程实践, 产品设计, 科学计算, React]
cover: ""
description: "在聊天抽屉里嵌入 Mol* 分子查看器，要处理布局裁剪、动态导入减负、残基选择语义转换、失焦降级四类问题。本文是 AtomOS 集成 Mol* 4.18 的实录，包括 sequence viewer 的布局改造、selection 事件的 Loci 遍历、以及为什么残基匹配要写成宽松分层判定。"
---

# Mol* 集成实录：在 React 抽屉里嵌入分子可视化

Mol*（molstar）是结构生物学领域最好的开源 WebGL 可视化引擎，RCSB PDB 的官方查看器就是它。但它是**为整页查看器设计的**，嵌进 React 抽屉（drawer）里跑，每一层都有活干。

这篇是 AtomOS 集成 Mol* 4.18 的工程实录。

## 一、动态导入：别让它进首屏包

Mol* 很大。AtomOS 的处理是**全部走动态 import**：

```typescript
const [{ createPluginUI }, { renderReact18 }, { OrderedSet }, { StructureElement, StructureProperties: SP }] =
  await Promise.all([
    import("molstar/lib/mol-plugin-ui"),
    import("molstar/lib/mol-plugin-ui/react18"),
    import("molstar/lib/mol-data/int"),
    import("molstar/lib/mol-model/structure"),
  ]);
// Mol* CSS — pull the dark theme directly from the package.
await import("molstar/build/viewer/molstar.css" as string).catch(() => {});
```

四个模块并行动态导入，CSS 的导入甚至**允许失败**（`.catch(() => {})`）——主题加载失败不该挡住结构显示。

对懒加载的收益没概念的话：Mol* 及其依赖的体积在 MB 级，静态导入意味着**没打开过分子视图的用户也要为它付首屏成本**。动态导入后它只在第一次打开抽屉时加载，且加载期间 UI 显示分阶段进度（后面讲）。

## 二、布局改造：sequence viewer 被抽屉裁掉了

Mol* 默认布局（`outside` 模式）把序列面板放在视口**旁边**。问题：**抽屉的宽度装不下"视口+序列"的并排布局**——序列面板被裁剪出可视区，用户根本不知道它存在。

解法在 `onBeforeUIRender` 钩子里改布局规格：

```typescript
onBeforeUIRender: (context: any) => {
  context.spec.components = {
    ...context.spec.components,
    sequenceViewer: {
      ...context.spec.components?.sequenceViewer,
      defaultMode: "all",
    },
  };
  // The default `outside` layout places the sequence region beside
  // the viewport. In the drawer that region is clipped; keep the
  // sequence above the viewport inside the embedded host.
  context.layout.setProps({
    isExpanded: false,
    showControls: true,
    controlsDisplay: "portrait",
    regionState: {
      top: "full",
      bottom: "hidden",
      left: "hidden",
      right: "hidden",
    },
  });
},
```

`regionState` 把左/右/下区域全部 hidden，只留顶部——**序列面板从"视口旁边"搬到"视口上方"**，纵向布局正好适配抽屉的形状。

`onBeforeUIRender` 这个钩子的选择也有讲究：布局必须在 UI 渲染**之前**改，渲染后再改会闪一帧默认布局。

## 三、选择语义：从 Loci 到业务残基键

用户在 3D 视图里点选残基，Mol* 给你的是 `Loci`（定位符）——一个"结构+单元+索引集合"的底层结构。业务需要的是**规范化的残基键**（哪条链、几号、什么氨基酸）。

转换代码要遍历 Loci 的 elements，逐原子提取属性：

```typescript
const toResidues = (): StructureResidueKey[] => {
  const values: StructureResidueKey[] = [];
  const seen = new Set<string>();
  const entries = plugin.managers.structure.selection.entries as Map<string, { selection: any }>;
  for (const entry of entries.values()) {
    const loci = entry.selection;
    for (const element of loci.elements ?? []) {
      OrderedSet.forEach(element.indices, (elementIndex: number) => {
        const atomElement = element.unit.elements[elementIndex];
        const location = StructureElement.Location.create(loci.structure, element.unit, atomElement);
        // ...从 location 提取 model_num / entity_id / label_asym_id / label_seq_id / comp_id ...
```

提取的键集合直接对应前一篇（Lexical 残基引用）的 `StructureResidueKey`——**3D 选择、聊天芯片、持久化引用，三种表示共享同一个键结构**。这是"引用系统"能闭环的前提。

细节一：**去重用 JSON 序列化键**：

```typescript
const key = JSON.stringify(residue);
if (!seen.has(key)) { seen.add(key); values.push(residue); }
```

一次框选可能包含同一残基的多个原子，逐原子提取会产生重复键，序列化后 Set 去重。

细节二：**altloc 的归一**（和 Lexical 篇呼应）：

```typescript
// Altlocs are one logical residue reference. Keep the catalog's
// alt_ids for the hover detail, but never put one alt_id in the URI.
delete (residue as Partial<StructureResidueKey>).alt_id;
```

一个残基多个交替构象 = 一个逻辑引用，URI 层面永远不区分 altloc。

## 四、焦点定位：宽松分层匹配

反向操作——收到一个残基引用，在视图里定位高亮它。`focusResidue` 遍历结构单元，判定"是否同一残基"：

```typescript
const sameResidue = (Number(SP.unit.model_num(location)) || 1) === candidate.model_id
  && String(SP.entity.id(location)) === candidate.entity_id
  && SP.chain.label_asym_id(location) === candidate.label_asym_id
  && SP.atom.label_comp_id(location) === candidate.comp_id
  && (candidate.label_seq_id == null || SP.residue.label_seq_id(location) === candidate.label_seq_id)
  && (candidate.auth_asym_id == null || SP.chain.auth_asym_id(location) === candidate.auth_asym_id)
  // ...
```

又是那个 `== null ||` 模式：**引用里缺的字段不参与匹配**。mmCIF 的 label/auth 双编号体系里，结构可能只有其中一套编号——严格匹配会把合法引用判成"找不到"。宽松分层 = 有多少信息用多少信息。

匹配成功后三连：

```typescript
plugin.managers.structure.selection.fromLoci("set", loci, false);
plugin.managers.interactivity.lociHighlights.highlightOnly(loci, false);
plugin.managers.structure.focus.setFromLoci(loci);
plugin.managers.camera.focusLoci(loci, { durationMs: 250, extraRadius: 1, minRadius: 2 });
```

选中、高亮、**镜头推近**——相机动画 250ms 带一点缓冲半径，视觉上是"找到并放大"，而不是生硬跳变。

## 五、降级链：定位失败不是终点

`focusResidue` 返回 `false` 或异常时的处理链：

```
focusResidue 成功 → FOCUSED
结构里没有该残基 → NOT_FOUND
残基存在但无坐标（序列-only 结构）→ NO_COORDINATES + 序列面板高亮兜底
解析引用失败 → NOT_FOUND（不崩页面）
```

`NO_COORDINATES` 的兜底最值得看：

```typescript
ref.current?.querySelectorAll<HTMLElement>("[data-seqid]").forEach((element) => {
  try {
    const value = JSON.parse(element.dataset.atomosResidue || "null") as IndexedResidue | null;
    element.classList.toggle("atomos-sequence-focused", /* 匹配判定 */);
  } catch { /* ignore malformed sequence metadata */ }
});
setFocusStatus("NO_COORDINATES");
```

**3D 里定不了位，就到序列条（sequence panel）上高亮那个位置**。用户至少知道"这个残基在序列的哪里"，信息没有断流。DOM 元素带的 `atomosResidue` 元数据也是 JSON，解析失败静默忽略——**降级路径自身也要防崩**。

外层还有 try/catch：

```typescript
} catch {
  // A malformed or unsupported source residue must not tear down the
  // surrounding chat page when an old reference is opened.
  setFocusStatus("NOT_FOUND");
  return "NOT_FOUND";
}
```

**旧消息里的一条坏引用，代价最多是"定位失败"，绝不能是聊天页崩溃。**

## 六、加载体验：分阶段 + 计时器

Mol* 加载分了阶段（`libs` → `init` → 数据下载 → `ready`），加载期间每秒 tick 一次显示耗时：

```typescript
useEffect(() => {
  if (phase === "ready" || err) return;
  const id = window.setInterval(() => {
    setElapsed(Math.round((Date.now() - startRef.current) / 1000));
  }, 1000);
  return () => window.clearInterval(id);
}, [phase, err]);
```

计时锚点是 `startRef`（mount/url 变化的时刻）——**阶段切换不重置计时**，用户看到的是"总共等了多少秒"而不是"这一阶段等了多少秒"。超过约 5 秒显示安抚性提示。

## 七、404 与格式错误的区分

结构文件下载失败时：

```typescript
setErr(/(?:^|\b)(?:404|status code 404)\b/.test(message) ? t("fileMissing") : message);
```

404 → "文件不存在"（用户能理解的业务语义），其他错误 → 原样展示技术信息。**错误翻译的边界**：能确定映射的翻译，不能确定的保留原文——乱翻译比不翻译糟。

## 八、总结

1. **动态导入 + 并行加载**，Mol* 不进首屏包，CSS 失败不阻塞
2. **布局在渲染前改**：`onBeforeUIRender` 钩子里完成抽屉适配，序列面板从侧边搬到顶上
3. **三种表示共享一个键结构**：3D 选择、聊天芯片、持久化引用都用 `StructureResidueKey`
4. **宽松分层匹配**：缺的字段不参与判定，兼容 label/auth 双编号的现实
5. **降级链完整**：3D 失败到序列高亮，序列失败到 NOT_FOUND，任何失败不崩页
6. **计时锚定在总耗时**，阶段切换不重置

一句话：**嵌入重型科学可视化引擎的要点不是"能跑起来"，是把"加载、布局、选择、降级"四个体验维度都做成显式状态。**
