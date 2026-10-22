---
title: "Agent 的记忆系统：分层记忆、阈值队列与独立 Curator"
date: "2026-10-20"
tags: ["AI Agent", "记忆系统", "PostgreSQL", "架构设计", "RAG"]
cover: ""
description: "Agent 该记住什么、忘什么、谁来整理？AtomOS 的答案是三层记忆（User/Project/Session）加一个事件驱动的独立 Curator：新增记忆攒够 10 条才触发整理，用 PostgreSQL advisory lock 抢租约、全文检索找关联、乐观锁防并发编辑。本文逐层拆解。"
---

# Agent 的记忆系统：分层记忆、阈值队列与独立 Curator

Agent 记忆是近两年的热词，但多数实现停留在"往一个数组里塞字符串"。AtomOS 的记忆系统有几个值得写的工程决策。

## 一、三层记忆：作用域决定寿命

AtomOS 的记忆按作用域分三层：

| 层 | 作用域 | 生命周期 |
|---|---|---|
| Session memory | 单会话 | 会话结束即弃 |
| Project memory | 同一 Project 的所有 Session 共享 | 随 Project 存活 |
| User memory | 该用户的所有 Project 共享 | 随用户存活 |

README 的原话：

> Project memory 在同一 Project 的 Sessions 间共享，User memory 跨该用户的 Projects 生效；独立 Curator 仅在新增 Project memory 超过 10 条后按配置运行。

分层的意义是**遗忘的粒度**：

- 一个设计任务结束了，它的 Project memory（试过什么构象、为什么放弃）不该污染用户的下一个项目——Project 删除时全部带走
- 用户的偏好（常用工具、评审习惯）是跨项目的资产，放 User 层
- 会话内的临时上下文（这轮在讨论哪个文件）不值得持久化

**记忆的价值密度 = 检索时能用上的概率。** 作用域越宽的层，准入标准越严——User memory 是最难进的。

## 二、阈值队列：Curator 为什么不是每次都跑

记忆的整理（去重、合并、纠错）如果每次新增都触发，就是无意义的频繁 LLM 调用。AtomOS 的触发条件写在 `memory_curator_queue.py`：

```python
CURATOR_TRIGGER_COUNT = 10
```

**新增 Project memory 攒够 10 条，Curator 才启动一次**。这是批处理经济学：整理一次的开销（LLM 调用 + 关联检索）被 10 条新增摊薄，且攒批期间相似记忆更容易被成组识别。

队列本身是**持久化的**——触发条件不满足时，候选静静躺在表里等下一批。进程重启、部署更新都不丢。

## 三、关联检索：用 SQL 找"该一起整理的记忆"

Curator 整理一条记忆时，要找出**和它相关的其他记忆**作为整理上下文。这个"相关"的判定全在 SQL 里：

```python
async def eligible_candidates(conn, *, project_id, primary_ids):
    """Freeze deterministic, directly related Project-memory candidates."""
    rows = await conn.fetch(
        "WITH primary_memories AS ("
        " SELECT id,kind,content FROM memories WHERE project_id=$1 "
        " AND scope='project' AND id=ANY($2::uuid[])"
        "), related AS ("
        " SELECT m.id FROM memories m JOIN primary_memories p ON m.kind=p.kind "
        " WHERE m.project_id=$1 AND m.scope='project' AND ("
        " lower(m.content)=lower(p.content) OR "
        " to_tsvector('simple',m.content) @@ plainto_tsquery('simple',p.content)"
        " ) UNION SELECT m.id FROM memories m CROSS JOIN primary_memories p "
        " WHERE m.project_id=$1 AND m.scope='project' AND EXISTS ("
        " SELECT 1 FROM memory_events e WHERE "
        " (e.memory_id=p.id AND e.source_ids ? m.id::text) OR "
        " (e.memory_id=m.id AND e.source_ids ? p.id::text)"
        " )"
        ") SELECT DISTINCT m.id,m.sequence FROM memories m "
        "WHERE m.id=ANY($2::uuid[]) OR m.id IN (SELECT id FROM related) "
        "ORDER BY m.sequence",
        ...
    )
```

三种关联信号，全部 SQL 内联：

1. **完全相同**（不区分大小写）：`lower(m.content) = lower(p.content)`——最直接的重复
2. **全文检索相似**：`to_tsvector @@ plainto_tsquery`——文本相关性
3. **血缘关系**：`memory_events.source_ids` 里互相引用过——之前整理时被合并过的记忆，天然是同一族

第三个信号最妙：**Curator 自己的整理历史成了下一轮整理的线索**。整理过的记忆群有血缘记录，下次它们再漂移出新条目时，血缘把它们自动归拢。

docstring 里还有一个关键词：`Freeze deterministic`——候选集合在整理开始时冻结，整理过程中记忆被编辑也不影响本批的一致性。

## 四、租约与预算：Curator 的自我保护

Curator 是**独立的异步运行时**（不是 Agent 循环的一部分），它有自己的防线：

```python
_LEASE_SECONDS = 180
_MAX_ATTEMPTS = 3
```

- **租约（lease）180 秒**：多个实例并发时，靠 PostgreSQL advisory lock 抢租约，抢到才跑——防止两个 Curator 同时整理同一 Project 的记忆
- **最多重试 3 次**：整理失败（LLM 超时、格式不对）重试有上限，防止死循环烧 token
- **预算检查**：`CuratorBudgetError`——token 预算超限直接终止，Curator 是后台任务，**烧钱必须有闸**

还有 `CuratorTerminalError`——不可恢复的错误（如 checkpoint schema 不对）直接放弃本批，不重试。

## 五、乐观锁：编辑记忆的并发防护

前端编辑记忆走的是 `expected_revision`：

```typescript
export async function updateMemory(
  memoryId: string,
  expectedRevision: number,
  patch: { kind?: MemoryKind; content?: string; status?: MemoryStatus },
): Promise<Memory> {
  return jsonReq(`/api/memories/${memoryId}`, {
    method: "PATCH",
    body: JSON.stringify({ expected_revision: expectedRevision, ...patch }),
  });
}
```

**每次修改必须带上"我看到的版本号"**。服务端发现版本不匹配（别人改过了）就拒绝——两个用户（或用户 + Curator）同时编辑同一条记忆，后到的那个会收到冲突而不是静默覆盖对方。

配合 UI 上"刷新后重试"的引导，乐观锁把并发冲突从"数据丢失"降级成"一次可见的失败"。

## 六、Curator 的整理工具

Curator 自己也有一套受控工具（`memory_curator_tools.py` 里的 `CURATOR_TOOLS`），包括合并记忆、更新内容、标记状态等。它跑在与聊天 Agent **不同的 prompt 和权限上下文**里——整理记忆的模型调用不携带聊天工具（不能顺手执行 bash），只允许操作记忆本身。

**最小权限原则在子系统的落地**：每个自动化角色只拿它需要的工具，Curator 不例外。

## 七、前端视角

记忆系统的前端是 `MemoryPanel`：

- 三层作用域的 tab 切换（Project / User）
- 记忆条目可编辑（乐观锁冲突要能渲染和处理）
- 整理来源可追溯（`listMemorySources`——这条记忆是从哪些来源合并出来的）
- "整理中"状态展示（Curator 跑起来时面板要有反馈）

以及一个容易漏的细节：`PROJECT_MEMORY_STALE_EVENT`——时间线收到 `tool_call_finished` 后派发这个自定义事件，MemoryPanel 监听它刷新列表。**记忆列表的失效信号挂在工具执行事件上**，因为 Agent 的 `remember_project_memory` 工具调用才是记忆变更的主要来源。

## 八、总结

1. **分层 = 遗忘粒度**：Session/Project/User 三层，准入标准随作用域放宽而收紧
2. **阈值队列**：攒 10 条才整理，批处理摊薄 LLM 成本
3. **关联靠三种 SQL 信号**：精确重复、全文相似、整理血缘——血缘是复利
4. **Curator 是独立运行时**：租约防并发、重试有上限、预算封顶
5. **乐观锁管编辑**：并发修改是可见失败，不是静默覆盖
6. **最小权限**：Curator 只拿记忆工具，拿不到执行工具

一句话：**记忆系统的核心不是"记住"，是把"记什么、谁整理、怎么防冲突"三件事都变成有边界的工程问题。**
