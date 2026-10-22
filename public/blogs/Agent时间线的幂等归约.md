---
title: "Agent 时间线的幂等归约：REST 与 WebSocket 走同一条路"
date: "2026-09-22"
tags: ["WebSocket", "React", "状态管理", "Agent UI", "前端架构"]
cover: ""
description: "Agent 对话的时间线有两个数据源：WebSocket 实时事件和 REST 历史记录。断线重连后两者必然重叠，本文讲解如何用一个纯函数 reducer 加双层去重，让任意顺序到达的事件流收敛到同一个 UI 状态。"
---

# Agent 时间线的幂等归约：REST 与 WebSocket 走同一条路

做 Agent 聊天界面，第一个绕开的架构问题就是：**时间线的数据从哪来？**

我们的答案有两个来源：

1. **REST 历史记录**——打开会话时 `GET /sessions/:id/timeline`，拉全量
2. **WebSocket 实时事件**——连接后逐条推送

单看任何一个都没问题。但把它们放进同一个页面，问题就来了：**断线重连后，REST 拉到的历史和 WS 已经收到的事件必然重叠**。同一个 `tool_call_finished` 事件，你可能会收到两次——一次来自 socket 重放，一次来自历史接口。

如果不处理，用户会看到时间线上出现重复的工具卡片、重复的气泡、重复的审批请求。

这篇文章记录 AtomOS 的解法：**让两条数据流走同一个幂等 reducer**。

## 一、核心决策：一个 reducer，两条入口

先看最关键的架构决策。挂载和重连时的历史加载是这样写的：

```typescript
const loadHistory = async () => {
  const history = await listSessionTimeline(projectId, id);
  if (cancelled) return;
  setTimeline((current) => history.events.reduce(reduceTimeline, current));
  // ...
};
```

注意 `reduce(reduceTimeline, current)`——历史事件不是"替换"当前状态，而是**逐条喂给同一个 reducer，以当前状态为初始值**。

而 WebSocket 收到消息时：

```typescript
ws.onmessage = (ev) => {
  const evt = JSON.parse(ev.data);
  // ...
  setTimeline((current) => reduceTimeline(current, structural));
};
```

完全一样的入口。

这个设计的价值在注释里写得很直白：

```typescript
// REST history and live events pass through the same idempotent reducer.
// Merging the full durable log into current state closes the fetch/socket race:
// events seen on both paths are removed by seq, while in-flight deltas survive.
```

翻译一下：**fetch 和 socket 的竞态，被"按 seq 去重"天然闭合了；而正在流式输出的 token 增量不受影响。**

为什么"在途增量能活下来"？因为去重发生在**事件级**，不在**文本级**。历史里的 `model_call_finished` 和 socket 里正在流的 `model_text_delta` 是不同事件，互不干扰；而重复的完整事件靠 seq 挡掉。

## 二、双层去重

reducer 的第一道闸是结构去重：

```typescript
function structural(state: TimelineState, event: TimelineEvent): TimelineState | null {
  if (event.seq == null) return state;
  if (state.seenSeq.has(event.seq)) return null;
  const seenSeq = new Set(state.seenSeq).add(event.seq);
  return { ...state, seenSeq, highestSeq: Math.max(state.highestSeq, event.seq) };
}
```

每个持久化事件都有服务端分配的单调 `seq`（这个后面写事件日志那篇再展开）。`seenSeq` 是一个 Set，见过就整条丢弃。

但流式 token 增量没有 seq——它们是高频小事件，为每个 delta 都写一行数据库太贵。所以有第二层：

```typescript
if (event.type === "model_text_delta" && event.model_call_id && event.content != null) {
  const deltaKey = `${event.model_call_id}:${event.delta_index ?? 0}`;
  if (next.seenDeltas.has(deltaKey)) return next;
  const seenDeltas = new Set(next.seenDeltas).add(deltaKey);
  // ...
}
```

delta 的幂等键是 `model_call_id:delta_index`。同一次模型调用里的第 N 个增量，只接受一次。

两层各司其职：**seq 层管"事件只发生一次"，delta 层管"字符只追加一次"**。

## 三、真正难的不是去重，是那些反直觉分支

去重逻辑本身不难。写过 reducer 的人都能写出来。这个 reducer 真正的价值在几个分支——每个都对应一个真实场景，而且第一直觉通常是错的。

### 分支 1：模型一次发了多个提问，但运行时只停在第一个

```typescript
// A model may emit several question tool calls in one batch, but the
// runtime pauses at the first question and never dispatches the later
// calls. They were already projected as started calls, so remove those
// speculative rows instead of presenting them as still running forever.
```

场景：模型在批量输出里调了三次 `ask_user_question`。前端的 `tool_call_started` 事件已经把三行"运行中"的卡片画出来了。但 Agent 运行时在第一个提问处**暂停等用户回答**，后两个调用根本不会执行。

如果不管它们，UI 上会永远挂着两个转圈的提问卡片。

处理方式是收到 `question_requested` 时，把同批次其他未落地的提问调用**主动清掉**：

```typescript
const itemsWithoutSpeculativeQuestions = next.items.filter((item) => !(
  item.tool === "ask_user_question"
  && item.status === "running"
  && item.call_id !== event.call_id
  && item.run_id === runId
  && (!event.model_call_id || item.model_call_id === event.model_call_id)
));
```

注意过滤条件的严谨性：排除的是**同 run、同 model_call、还在 running、且不是当前这个 call_id** 的项。这个条件多一分则误伤，少一分则漏删。

### 分支 2：工具调用成功了，但它报告的作业还在跑

```typescript
// `event.status` is the tool-call lifecycle status. A Job result may
// legitimately report `running` after inspect_job has completed.
job_status: jobId && typeof summary.status === "string" ? summary.status : undefined,
```

场景：Agent 调 `inspect_job` 去查一个后台作业的状态。**这次工具调用本身成功了**（它拿到了作业状态并返回），但返回的内容里写着"作业还在 running"。

如果 UI 只有一个 status 字段，就会陷入矛盾：这个卡片到底是完成还是进行中？

答案是拆成两个字段：`status` 描述**工具调用的生命周期**（这次调用结束了吗），`job_status` 描述**作业本身的生命周期**（那个后台任务怎么样了）。二者语义正交，强行合并必然丢信息。

### 分支 3：模型调完了，但可见文本是空的

```typescript
if (event.type === "model_call_finished" && event.model_call_id) {
  // ...
  if (!visible) {
    if (index >= 0) items.splice(index, 1);
    return { ...next, items, activeModelCalls };
  }
  // ...
}
```

场景：模型这次调用只输出了 reasoning（思考过程），没有可见文本。流式阶段可能已经创建了一个空气泡挂在时间线上。结束时必须把它**撤掉**，否则永远留着一个空气泡。

同样，被用户取消的调用（`error_code === "cancelled_by_user"`）也要把对应的流式气泡整体移除，而不是留一个半截文本加错误标记。

## 四、状态与展示分离：segmentation 是另一个纯函数

reducer 维护的是**持久化顺序**——`items` 数组按 `order` 排列，忠实反映事件流的时序。

但用户看到的不是一串平铺的条目，而是**回合（turn）**：用户一条消息、一堆工具活动、一条助手回复，构成一个视觉单元。

这个从"事件列表"到"对话回合"的转换，是另一个独立的纯函数 `segmentConversationTimeline`：

```typescript
/** Build presentation-only turns; durable event ordering remains owned by the reducer. */
export function segmentConversationTimeline(state: Pick<TimelineState, "items" | "activeModelCalls">): ConversationTurn[] {
  // ...
}
```

注释里的分工声明值得抄下来：**展示层的回合划分，不碰持久化顺序；顺序归 reducer 所有**。

切分逻辑本身也有讲究：

- 连续的工具/作业条目合并成一个 `TimelineActivityGroup`，视觉上折叠成"活动块"
- `isAttentionItem`（审批、提问、错误）不允许被折叠——它们需要用户看见并行动
- `thinking` / `working` / `null` 三态只对**最后一个回合**有意义（`isLast`），历史回合不会再"思考"

```typescript
const canCollapse = Boolean(user && (entries.length > 1 || activityState) && !hasAttention);
```

## 五、工程收益：可测试性

因为 reducer 是纯函数、状态更新全部不可变（`Set` / `Map` 的复制而不是原地修改），测试变得极其直白：

```typescript
const state1 = reduceTimeline(emptyTimeline(), eventA);
const state2 = reduceTimeline(state1, eventA);  // 重放同一条
expect(state2).toBe(state1);  // 引用相等——完全无操作
```

"同一事件重放 N 次，结果不变"这个性质，不是靠小心翼翼地避免重复，而是**类型系统层面构造出来的**。`structural` 返回 `null` 时上层直接 `return state`，连对象都不新建。

## 六、总结

回头看这个设计，三条原则撑起了全部：

1. **单一入口**：REST 和 WS 走同一个 reducer，竞态在数据结构里消解，不在业务代码里打补丁
2. **双层幂等键**：seq 管事件，`model_call_id:delta_index` 管增量，各管各的频段
3. **顺序与展示分离**：reducer 只负责忠实排序，回合划分是展示层的纯函数

如果只能记一句话：**当两条数据流可能重叠时，不要在"什么时候拉历史"上做时序文章，让每条事件自带幂等键，重复投递就变成了无害操作。**

下一篇讲这个体系里最疼的一个事故：`wasClean` 陷阱——一个看似合理的判断，让聊天在滚动重启后永久卡死。
