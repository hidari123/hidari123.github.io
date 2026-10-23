---
title: "残基索引的五张表：把 mmCIF 的双编号体系折叠成一个查找结构"
date: "2026-10-02"
tags: [工程实践, 科学计算, TypeScript]
cover: ""
description: "3D 视图点一个原子，聊天里发一条引用，URL 里带几个键——这三件事要指向同一个残基，就得在一堆行式数据上建索引。本文拆解 AtomOS 的 StructureResidueIndex：五路合并、歧义键的显式废弃、以及为什么非聚合物的锚点逻辑要单独处理。"
---

# 残基索引的五张表：把 mmCIF 的双编号体系折叠成一个查找结构

3D 视图里点一个原子、聊天里发一条残基引用、URL 里带几个键——这三件事要指向同一个残基，就得在一堆行式数据上建索引。这篇讲**这些键怎么从原始结构文件里被查出来。**

（这是整个残基引用体系的底层。往上看：3D 选择语义、聊天里的 Lexical 芯片、结构文件的上传与解析。）

数据结构在 `StructureMapping.ts`，核心产物是 `StructureResidueIndex`：

```typescript
export type StructureResidueIndex = {
  all: IndexedResidue[];
  byPath: Map<string, IndexedResidue>;
  byLabel: Map<string, IndexedResidue>;
  byAuth: Map<string, IndexedResidue>;
  byAtomSiteId: Map<string, IndexedResidue>;
  byAtomIndex: Map<number, IndexedResidue>;
};
```

五张 Map 加一个数组。看起来只是"给列表加索引"，但**每一张表的键设计背后都有 mmCIF 的一个坑**。

## 一、原始数据是行式的，逻辑实体是聚合的

解析出来的 `StructureResidueRecord` 是**逐原子一行**——一个 ALA 残基有 N 个原子，就有 N 行共享同一个逻辑身份。

聚合的规则：

```typescript
function keyFor(record): string {
  // A logical residue spans all alternate conformations. `alt_id` is display
  // metadata, not part of the default residue reference identity.
  return [record.path, record.model_id, record.entity_id, record.label_asym_id,
          record.label_seq_id ?? "", record.auth_asym_id ?? "", record.auth_seq_id ?? "",
          record.auth_ins_code ?? "", record.comp_id].join("|");
}
```

注释一句话点明设计立场：**altloc 是展示元数据，不参与身份判定**。一个残基的多个交替构象（A/B/C），逻辑上是同一个残基——键里没有 `alt_id`。

聚合时不是简单覆盖，而是三路并集：

```typescript
const atomSiteIds = new Set([...(previous?.atom_site_ids ?? []), ...(source.atom_site_ids ?? []), ...(source.atom_site_id ? [source.atom_site_id] : [])]);
const altIds = new Set([...(previous?.alt_ids ?? []), ...(source.alt_ids ?? []), ...(source.alt_id ? [source.alt_id] : [])]);
```

`Set` 去重 + 合并，`alt_ids` 还排序（`[...altIds].sort()`）保证输出稳定——**序列化顺序不确定会让快照测试随机失败**，排序是让数据结构可重现的基本卫生。

## 二、byPath vs byLabel vs byAuth：三套编号

mmCIF 的重灾区是**双编号体系**：结构数据库内部用 `label_seq_id`（作者定义的连续编号），而 PDB 文件里用 `auth_seq_id`（PDB 管理员的历史编号）。两者可能完全不同——尤其有插入码（insertion code）的时候。

```typescript
function labelKeyFor(residue): string | null {
  if (residue.label_seq_id == null) return null;
  return `${residue.model_id}:${residue.entity_id}:${residue.label_asym_id}:${residue.label_seq_id}:${residue.comp_id}`;
}

function authKeyFor(residue): string | null {
  if (!residue.auth_asym_id || residue.auth_seq_id == null) return null;
  return `${residue.model_id}:${residue.entity_id}:${residue.auth_asym_id}:${residue.auth_seq_id}:${residue.auth_ins_code ?? ""}:${residue.comp_id}`;
}
```

两套键的**字段不同**：

| | label 键 | auth 键 |
|---|---|---|
| 链标识 | `label_asym_id` | `auth_asym_id` |
| 序号 | `label_seq_id` | `auth_seq_id` |
| 插入码 | 不含 | **含** `auth_ins_code` |

插入码只在 auth 体系里有意义，所以只进 auth 键。**缺字段返回 null 而不是部分键**——半截的键比没有键危险，会匹配到错误的残基。

`byPath` 用的是完整九字段键（`keyFor`），是**权威身份**——只有它包含 altloc 之外的全部信息。

## 三、uniqueMap：歧义键的显式废弃

这是整个索引里最讲究的一段：

```typescript
const uniqueMap = <K,>(entries: ReadonlyArray<readonly [K, IndexedResidue]>): Map<K, IndexedResidue> => {
  const result = new Map<K, IndexedResidue>();
  const ambiguous = new Set<K>();
  for (const [key, value] of entries) {
    if (ambiguous.has(key)) continue;
    if (result.has(key)) { result.delete(key); ambiguous.add(key); continue; }
    result.set(key, value);
  }
  return result;
};
```

**同一键命中两次 → 删掉，并永久标记为歧义**。三步：

1. 第一次命中：正常写入
2. 第二次命中：**删除已有条目**，标记 `ambiguous`
3. 后续命中：直接跳过（已被标记）

为什么这么设计？因为 label/auth 编号**在真实世界里确实会碰撞**——不同 entity 里可能有相同的 `label_seq_id`，或者水分子共用编号。碰撞时静默保留第一个会导致"定位到错误的残基"，而这在科学场景里是**会污染研究结论的严重 bug**。

正确做法是**明确地"我不知道"**。键不存在 = 查不到 = 降级路径启动（序列面板高亮、NOT_FOUND）。**宁可答不出，不可答错。**

## 四、非聚合物：原子数 > 1 时不进 label/auth 索引

```typescript
byLabel: uniqueMap(all.flatMap((record) => {
  const key = labelKeyFor(record);
  return key && !(isNonPolymer(record) && record.atom_site_ids.length > 1) ? [[key, record] as const] : [];
})),
```

**非聚合物（配体、金属离子、水分子）且有多个原子 → 不进 label/auth 索引**。

原因：配体没有 `label_seq_id`（不是聚合物链的一部分），键会退化。多个原子的配体（ATP、辅因子）如果按序列号索引，多个原子共享同一个"序号"，等于把整个分子当成一个残基——引用"A/1/23"到底指的是哪个原子？不可知。

配体的正确定位单位是**原子**——所以它们仍然进 `byAtomSiteId` 和 `byAtomIndex`（原子粒度），只是不进残基粒度的索引。

还有个对称的守卫在 `resolveIndexedResidue`：

```typescript
if (candidates.length === 1 && isNonPolymer(candidates[0]) && candidates[0].atom_site_ids.length > 1
  && !residue.atom_site_id && residue.atom_index == null) return undefined;
```

**多原子配体在没有原子标识的情况下不解析**——精确拒绝，而不是随便挑一个原子。

## 五、isNonPolymer 的三层判定

判定"这是不是聚合物"：

```typescript
function isNonPolymer(record): boolean {
  if (record.entity_type && record.entity_type !== "non-polymer" && record.entity_type !== "water") return false;
  if (record.entity_type === "non-polymer" || record.entity_type === "water") return true;
  return !/(?:poly|peptide|ribo|deoxyribo).*linking/iu.test(record.chem_comp_type || "")
    && !["ALA","ARG",...,"VAL"].includes(record.comp_id.toUpperCase());
}
```

三层兜底：

1. **`entity_type` 明确说是 polymer → 直接返回 false**
2. **`entity_type` 明确说是 non-polymer/water → 返回 true**
3. **都没有 → 复合启发式**：`chem_comp_type` 含 "peptide linking" 之类 + 20 种标准氨基酸白名单

`chemistryType` 还有一层推断：

```typescript
function chemistryType(compId: string, chemType?: string, polymerType?: string): string | undefined {
  if (chemType) return chemType;
  if (/^D[ACGTU]$/iu.test(compId)) return "DNA linking";  // 胸腺嘧啶 = 脱氧核糖核酸的 T
  const polymer = polymerType?.toLowerCase() || "";
  if (polymer.includes("deoxyribo")) return "dna linking";
  if (polymer.includes("ribonucleotide")) return "rna linking";
  if (polymer.includes("polypeptide")) return "peptide linking";
  if (["HOH","DOD","WAT"].includes(compId.toUpperCase())) return "water";
  return undefined;
}
```

`/^D[ACGTU]$/` 是个漂亮的技巧：**DNA 的碱基就是 RNA 碱基前面加个 D**（DA/DC/DG/DT/DU）。这个正则一行识别了 4 种脱氧核苷酸。

## 六、mmCIF 用 Mol* 的解析器，不手写

```typescript
/** Parse mmCIF with Mol*'s CIF parser rather than a hand-written tokenizer. */
async function parseMmcifResidues(text: string, path: string): Promise<StructureResidueIndex> {
  const { CIF } = await import("molstar/lib/mol-io/reader/cif");
  const parsed = await CIF.parseText(text).run();
```

mmCIF 的语法相当复杂（引号转义、多行值、loop 声明、`?` 和 `.` 的 null 表示）。手写 tokenizer 是典型的"看起来简单实际全是坑"。

直接用 Mol* 的解析器：**它是这个领域的事实标准实现，已经通过了 RCSB 全部测试用例**。而且这里用的是动态 import——不打开结构文件的用户不为这个解析器付包体积。

PDB 格式简单（定宽列），所以手写：

```typescript
const comp = line.slice(17, 20).trim() || "UNK";       // 列 18-20
const sequence = clean(line.slice(22, 26).trim());      // 列 23-26
const serial = clean(line.slice(6, 11).trim());          // 列 7-11
```

定宽切片，正确。`clean` 把 mmCIF 的 null 占位符归一：

```typescript
function clean(value: string | undefined): string | undefined {
  if (!value || value === "." || value === "?") return undefined;
  return value;
}
```

`.` 和 `?` 是 mmCIF 的"无值"表示，不清掉就会变成字符串 `"."` 参与比较。

## 七、未解析残基：无坐标但仍然引用得到

PDB 有 `REMARK 465`（未解析残基），mmCIF 有 `pdbx_unobs_or_zero_occ_residues` 类别：

```typescript
const unresolved = categories.pdbx_unobs_or_zero_occ_residues;
for (let row = 0; row < (unresolved?.rowCount ?? 0); row += 1) {
  // ...
  has_coordinates: false,
}
```

这些残基**在序列中存在，在结构中没有坐标**。它们照样进索引（`has_coordinates: false`）——因为引用系统要能表达"这里的第 47 号是空缺的"。

对应到前端就是那篇 Mol* 集成里提到的 `NO_COORDINATES` 状态：3D 里定不了位，到序列面板上高亮。**索引层知道这件事存在，UI 层负责优雅表达。**

## 八、resolveIndexedResidue 的四级降级查找

给定一个引用键，按优先级依次尝试：

```typescript
// 1. 原子级：atom_site_id（mmCIF 的 _atom_site.id，最精确）
if (residue.atom_site_id && index.byAtomSiteId.has(residue.atom_site_id)) { ... }
// 2. 原子级：atom_index（行号，PDB 没有 id 时用）
if (residue.atom_index != null && index.byAtomIndex.has(residue.atom_index)) { ... }
// 3. 残基级：label 编号
const byLabel = labelKeyFor(residue);
// 4. 残基级：auth 编号
const byAuth = authKeyFor(residue);
// 5. 兜底：全表过滤 + 唯一性判定
```

每一级都过同一个 `compatible()` 闸门：

```typescript
const compatible = (item: IndexedResidue): boolean => item.path === residue.path
  && item.model_id === residue.model_id
  && item.entity_id === residue.entity_id
  && item.label_asym_id === residue.label_asym_id
  && item.comp_id === residue.comp_id
  && (residue.label_seq_id == null || item.label_seq_id === residue.label_seq_id);
```

**命中索引表不等于有效**——还要过 `compatible` 的完整性检查。索引表是候选加速器，`compatible` 是正确性保证。这两层的分离是刻意的：索引可能因为数据异常返回错的候选，正确性检查兜住。

注意那个 `(residue.label_seq_id == null || ...)` ——**引用里没有的字段不参与判定**，和 Mol* 篇讲的一致。

## 九、总结

1. **行式 → 聚合**：逐原子行按九字段逻辑键合并，altloc 不参与身份
2. **双编号并行索引**：label/auth 两套键，字段不同（插入码只在 auth 里），缺字段返回 null
3. **歧义键显式废弃**：碰撞时删除 + 永久标记，宁可查不到不可查错
4. **非聚合物按原子索引**：多原子配体不进残基级索引，避免"哪个原子"不可知
5. **降级查找四级**：atom_site_id → atom_index → label → auth → 全表唯一性
6. **索引是加速器，`compatible` 是正确性**：两层分离
7. **未解析残基照常入索引**，`has_coordinates: false` 是信息不是错误

一句话：**科学数据里的"不确定"必须被建模为一等公民——索引能查到，不代表答案唯一；唯一性判定失败时的正确答案永远是"不知道"。**