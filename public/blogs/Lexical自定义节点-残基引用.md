---
title: "Lexical 自定义节点：把分子残基做成编辑器里的原子引用"
date: "2026-10-19"
tags: ["Lexical", "富文本编辑器", "React", "前端工程", "Mol*"]
cover: ""
description: "让用户在聊天输入框里插入一个'指向蛋白质第 47 号残基'的不可分割引用芯片，点击即跳转 3D 视图定位。本文讲解 Lexical 自定义节点的实现：atomos:// URI 协议、clone 递归陷阱、token 模式与 contentEditable=false、以及 Markdown 序列化的兼容设计。"
---

# Lexical 自定义节点：把分子残基做成编辑器里的原子引用

AtomOS 的聊天输入框里有个特殊能力：用户可以插入一个**残基引用**——一枚不可分割的"芯片"，显示为 `A/2/47 THR` 这样的标签，随消息发出后，接收方点击它就能在 3D 分子视图里定位到那个氨基酸。

这枚芯片不是普通文本，不是 HTML 粘贴，是 Lexical 编辑器里的**自定义节点**。这篇讲实现。

## 一、需求拆解：为什么必须是自定义节点

一枚残基引用芯片有三个硬要求：

1. **不可分割**：用户不能把光标插进芯片中间、删掉半个标签——它是原子
2. **携带结构化数据**：芯片背后是完整的残基键（链、序号、插入码、化合物 ID……），纯文本存不下
3. **可序列化**：消息要持久化、要走 Markdown 渲染，芯片必须能在"结构化对象"和"文本表示"之间无损往返

Lexical（Facebook 的现代富文本框架）对此的答案就是自定义节点：继承 `TextNode`，扩展出携带引用数据的节点类。

## 二、数据模型：一个 atomos:// URI

残基引用的规范化表示是一个 URI：

```text
atomos://residue?path=/workspace/design.pdb&model_id=1&entity_id=2&
label_asym_id=A&label_seq_id=47&comp_id=THR
```

解析器（`reference.ts`）对它做了**外科手术级的严格校验**：

```typescript
const allowed = url.hostname === "workspace"
  ? new Set(["path", "label"])
  : url.hostname === "residue" ? RESIDUE_KEYS : null;
if (!allowed) return invalid("unsupported target");
for (const key of params.keys()) {
  if (!allowed.has(key)) return invalid(`unknown field: ${key}`);
}
```

**白名单字段**——`workspace` 目标只许 `path` 和 `label`，`residue` 目标只许 RESIDUE_KEYS 集合里的键，**多一个字段都拒绝**。这是把"引用"当成不可信输入对待：老消息里的引用格式可能过时，解析失败必须安全降级而不是崩掉聊天页。

URI 的好处是**天然可嵌进 Markdown 链接**：

```typescript
export function referenceMarkdown(reference: AtomOSReference): string {
  const label = reference.label || reference.path.split("/").pop() || reference.path;
  return `[${escapeReferenceLabel(label)}](${serializeAtomOSReference(reference)})`;
}
```

`[A/2/47 THR](atomos://residue?...)`——普通 Markdown 渲染器把它当链接，AtomOS 自己的渲染器认出 `atomos:` 协议后渲染成芯片。**同一份数据，两套视图，零转换成本。**

## 三、节点实现：clone 与构造器的递归陷阱

核心类 `AtomOSReferenceNode extends TextNode`：

```typescript
export class AtomOSReferenceNode extends TextNode {
  __reference: AtomOSReference;
  __missing = false;

  static getType(): string { return "atomos-reference"; }
  static clone(node: AtomOSReferenceNode): AtomOSReferenceNode {
    const clone = new AtomOSReferenceNode(node.__reference, node.__text, node.__key);
    clone.__missing = node.__missing;
    return clone;
  }
```

两个下划线前缀（`__reference`）是 Lexical 的约定：节点内部字段必须这样命名，框架靠它区分受管字段。

真正的坑在构造器里，注释直接写了：

```typescript
constructor(reference: AtomOSReference, text?: string, key?: NodeKey) {
  super(...);
  this.__reference = reference;
  // Constructors also run during Lexical cloning. Re-applying setMode() to a
  // keyed clone requests another writable clone and recurses indefinitely;
  // Lexical copies the existing mode during clone finalization instead.
  if (key === undefined) this.setMode("token");
}
```

**`setMode("token")` 只能在没有 key 的构造里调用。** Lexical 的克隆流程会带着原 key 调构造器——如果在那时 `setMode`，框架会认为节点还需要再克隆一次，**无限递归**。判据就是 `key === undefined`：有 key 的是克隆，跳过；没 key 的是新建，设 token 模式。

`token` 模式就是"原子芯片"的实现——Lexical 对 token 模式节点的保证：光标不会插入节点内部、退格删除整个节点、不可部分选中。**一个模式标志换来了全部三条硬要求。**

## 四、DOM 呈现：不可编辑但可交互

```typescript
createDOM(config: EditorConfig): HTMLElement {
  const dom = super.createDOM(config);
  dom.className = `atomos-reference-token${this.__missing ? " atomos-reference-missing" : ""}`;
  dom.contentEditable = "false";
  dom.setAttribute("role", "img");
  dom.setAttribute("aria-label", `${kind}: ${label}`);
```

四个细节：

1. **`contentEditable = "false"`**——双保险，即使 token 模式失效，DOM 层也不给编辑机会
2. **`__missing` 状态**——引用指向的文件可能已被删除。芯片变灰加 `atomos-reference-missing` 类，**降级为"失效引用"而不是消失**——历史消息里的引用不该因为文件没了就无声蒸发
3. **`role="img"` + `aria-label`**——屏幕阅读器把芯片读成"Residue: A/2/47 THR"，可访问性是默认要求不是附加项
4. aria-label 区分 `Residue` / `File` 两种引用类型

## 五、与 3D 视图的联动

芯片点击后走 `openReference` 回调，最终落到 Mol* 视图的 `focusResidue`。后端结构是：

- 聊天页持有 `ReferenceHost` 上下文（`openReference` / `reportMissing`）
- Mol* 组件暴露 `focusResidue(candidate): boolean`
- 匹配失败返回 `false`，前端显示 `NOT_FOUND` 状态而不是抛错

匹配逻辑值得一提——残基的"同一性"判定不是单键相等，而是**分层宽松匹配**：

```typescript
const sameResidue = (Number(SP.unit.model_num(location)) || 1) === candidate.model_id
  && String(SP.entity.id(location)) === candidate.entity_id
  && SP.chain.label_asym_id(location) === candidate.label_asym_id
  && SP.atom.label_comp_id(location) === candidate.comp_id
  && (candidate.label_seq_id == null || SP.residue.label_seq_id(location) === candidate.label_seq_id)
  && (candidate.auth_asym_id == null || SP.chain.auth_asym_id(location) === candidate.auth_asym_id)
  // ...
```

注意括号里的 `== null ||` 模式：**引用里没有的字段不参与匹配**。mmCIF 的 `label_seq_id` 和 `auth_seq_id` 双编号体系下，有的结构只有其一——严格相等会漏匹配，宽松匹配才能兼容真实世界的脏数据。定位失败时（`NO_COORDINATES` / `NOT_FOUND`）序列面板还会做 `atomos-sequence-focused` 高亮兜底，**找不到也在序列条上给你指个位置**。

## 六、序列化的兼容策略

自定义节点的序列化要处理两个方向：

**导出**（编辑器 → Markdown）：`serializeAtomOSReference` 把结构化键值拼回 URI。注意空值处理——`value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0)`，空字符串和空数组不进 URI，避免 query 里挂一堆空参数。

**导入**（Markdown → 编辑器）：`importJSON` 从序列化数据重建节点。老消息的 URI 走 `parseAtomOSReference` 白名单校验，**格式过时就降级为 `__missing` 芯片**，永远不崩。

还有一个 altloc（交替位置）的细节：

```typescript
// Altlocs are one logical residue reference. Keep the catalog's
// alt_ids for the hover detail, but never put one alt_id in the URI.
delete (residue as Partial<StructureResidueKey>).alt_id;
```

同一个残基可能有多个交替构象（altloc），**它们是同一个逻辑引用**——URI 里永远不写具体的 alt_id，详情悬停时才展示 alt_ids 列表。序列化层的"语义归一"让引用的相等性判定稳定。

## 七、总结

1. **自定义节点 = 结构化数据 + token 模式**：数据挂节点字段，原子性交给框架
2. **构造器里的克隆陷阱**：`key === undefined` 是"新建 vs 克隆"的分水岭，设模式只能在新建分支
3. **URI 是万能胶**：结构化、可校验、可嵌 Markdown，白名单解析按不可信输入对待
4. **降级设计贯穿始终**：文件没了变灰芯片、定位失败给序列高亮、格式过时安全拒绝
5. **可访问性是默认项**：`role="img"` + aria-label 与功能同步交付

一句话：**富文本里的"结构化引用"不是塞 HTML，是定义一个新的原子节点——数据、交互、降级三件事一起设计。**
