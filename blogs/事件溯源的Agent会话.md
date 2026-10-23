---
title: "事件溯源的 Agent 会话：append-only 事件日志 + 双写投影"
date: "2026-10-15"
tags: [后端架构, AI Agent, PostgreSQL]
cover: ""
description: "Agent 会话的每一次模型调用、工具执行、状态变更都写成一条不可变事件，UI 状态是事件流的投影。本文讲解 append-only 事件日志、按会话单调递增的 seq 如何分配、投影表的双写与重建，以及为什么日志是事实源而投影只是缓存。"
---

# 事件溯源的 Agent 会话：append-only 事件日志 + 双写投影

前两篇讲了时间线的幂等归约和 wasClean 重连事故。这两个前端行为的背后，是一套后端设计：**Agent 会话的完整历史是一串不可变事件，UI 只是这串事件的投影。**

这就是事件溯源（Event Sourcing）在 Agent 场景的落地。这篇把后端讲透。

## 一、为什么 Agent 会话天然适合事件溯源

传统做法是"状态表"：`messages` 表存消息、`jobs` 表存作业，字段直接对应 UI 需要的形状。对普通聊天够用，但 Agent 会话有三个特征让状态表很难受：

1. **状态高度复合**：一次回复 = 模型调用开始 + N 个 token 增量 + 工具调用 + 工具结果 + 回复结束。状态表要么塞一个巨型 JSON 列，要么碎成一堆表
2. **历史必须可回放**：重连、复活旧会话、审计"Agent 当时到底做了什么"——都需要重演历史
3. **时间线顺序是产品语义**：UI 展示的顺序、并发事件的归位，都要求精确的序列号

事件溯源的答案：**别存"现在的状态"，存"发生过的事"**。状态 = 事件的折叠。

## 二、事件日志的表结构

AtomOS 的 events 表核心约束：

```sql
UNIQUE(session_id, seq)
```

一行一个事件，`(session_id, seq)` 唯一——**seq 是会话内单调递增的序号**，这就是前端 `seenSeq` 去重的依据。事件类型（kind）覆盖整个会话生命周期：`user_message`、`model_call_started`、`model_text_delta`、`tool_call_finished`、`approval_requested`、`agent_run_finished`……

## 三、seq 分配：advisory lock 而不是 MAX+1 事务

最直觉的 seq 分配是：

```sql
SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE session_id = $1
```

但这在并发下有竞态：两个写入者同时 MAX+1，拿到同一个 seq，`UNIQUE` 约束让其中一个失败重试。

AtomOS 的实际做法（`events.py`）是用 **PostgreSQL 的 advisory lock（会话级咨询锁）把同一会话的 seq 分配串行化**：

```python
seq = await conn.fetchval(
    "SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE session_id = $1",
    session_id,
)
```

模块 docstring 写明了设计意图：

> `append_event` is the single writer path: it assigns a per-session monotonic
> `seq` (serialized by a per-session advisory lock so the agent loop and the
> reconcile loop can append concurrently without colliding on
> `UNIQUE(session_id, seq)`)

**两个并发写入方**——Agent 主循环和调和（reconcile）循环——都可能往同一会话追加事件。advisory lock 保证同一时刻只有一个在分配 seq，MAX+1 从此安全。锁粒度是**会话级**：不同会话的写入互不阻塞，同一会话内串行——正好匹配业务语义（一个会话本来就该按顺序说话）。

## 四、双写投影：日志是事实源，投影只是缓存

事件日志本身不擅长"查当前状态"——要知道某次工具调用的结果，得把日志翻一遍。所以 AtomOS 维护了投影表（`agent_runs`、`tool_calls`），**在写事件的同一个事务里同步更新**：

```python
async def _project(conn, *, session_id, seq, run_id, kind, payload):
    if kind == "agent_run_started":
        await conn.execute(
            "INSERT INTO agent_runs "
            "(id,session_id,trigger_seq,model,status,base_checkpoint_id) "
            "VALUES ($1,$2,$3,$4,'running',$5) ON CONFLICT (id) DO NOTHING",
            ...
        )
        # Bump the session's last-activity time so the sidebar "age" chip and the
        # list's `ORDER BY updated_at DESC` reflect the last TURN, not just manual
        # metadata edits (rename/archive). Every top-level turn (user,
        # approval-resume) opens a run through here.
        await conn.execute(
            "UPDATE sessions SET updated_at = now() WHERE id = $1", session_id,
        )
```

投影细节有讲究：

- **`ON CONFLICT DO NOTHING` / `COALESCE`**：投影更新是幂等的，事件重放多少次投影都不坏
- 顺带的细节——**会话侧边栏的"最后活动时间"跟着 run 走**，不是跟着"改会话名"走。注释里点明：`ORDER BY updated_at DESC` 要反映最后一次**对话轮**，不是最后一次元数据编辑。产品语义精确到 SQL 的 UPDATE 触发点

**关键的角色声明**：`_safe` 包装（`append_event_safe`）让日志写入变成 best-effort——

> The `_safe` wrapper makes a log write best-effort — it must never break a chat turn (events is the source of truth, so a dropped projection row can be rebuilt later).

**投影可以丢，日志不能丢。** 投影表坏了？重放日志重建就是。这是事件溯源的标准分工：**日志 = 事实，投影 = 缓存**。

## 五、重放：前端 reducer 的后端镜像

有意思的地方来了——前端的 `reduceTimeline` 和后端的事件日志，是**同一个模式的两端**：

| 层 | 数据 | 折叠器 |
|---|---|---|
| 后端 | events 表的事件流 | `_project`（SQL 投影） |
| 前端 | WS/REST 到达的事件 | `reduceTimeline`（JS reducer） |

前端拿到的每条事件带着后端分配的 seq，前端用自己的 reducer 折叠出 UI。**后端投影和前端 reducer 互不通信，但收敛到同一结果**——因为它们折叠的是同一串事件，而事件是不可变的。

这也是"断线重连后重拉历史"可行的完整链条：

1. 重连后 REST 拉全量事件（带 seq）
2. 前端 reducer 以现有状态为基座逐条折叠
3. seq 已见过的事件被 `seenSeq` 挡掉
4. 没见过的事件补齐缺口

**任何一端崩溃、重连、补拉，都收敛到同一个状态。** 这就是"幂等 + 单调 seq + 不可变事件"三件套的威力。

## 六、Phase 1 的克制：additive 演进

这套设计不是推倒重来。注释里明确说了迁移策略：

> Phase 1 (#26) is additive: callers keep their existing `messages`/`jobs` writes
> and call `append_event_safe` alongside.

**旧表照写、事件日志旁边加写**——两套并存，事件日志先证明自己，后续再逐步切换读取路径。这是老系统引入事件溯源的标准姿势：additive（加法）演进，不做 big-bang 重写。

代价是暂时的双写开销和一致性维护，换来的是**随时可回退**。对生产系统，可回退比优雅值钱。

## 七、总结

1. **事件不可变、seq 会话内单调**，`(session_id, seq)` 唯一约束兜底
2. **seq 分配用 advisory lock 串行化**，Agent 循环和调和循环并发安全
3. **投影与事件同事务双写**，投影幂等（`ON CONFLICT DO NOTHING`），可随时重放重建
4. **日志是事实源，投影只是缓存**——投影坏了能重建，日志坏了才是真事故
5. **前端 reducer 是后端投影的镜像**——两端折叠同一事件流，自动收敛
6. **additive 演进**：旧表照写，新日志并行，不 big-bang

一句话：**把"发生过什么"存成不可变事实，把"现在是什么"当成可重建的缓存——状态从来不需要备份，因为事实不会变。**
