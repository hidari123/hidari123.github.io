---
title: "人类审批流：把 Agent 的'请求确认'做成产品"
date: "2026-10-17"
tags: [AI Agent, 产品设计, React, 状态机]
cover: ""
description: "Agent 要提交 GPU 任务时暂停等人类点头，这个'暂停'在工程上是三件事：运行时的挂起语义、事件流里的审批协议、前端的状态机渲染。本文讲解 AtomOS 的 ApprovalContract 设计、审批期间的 composer 锁定、以及 Normal/Auto 两档策略的边界。"
---

# 人类审批流：把 Agent 的"请求确认"做成产品

Agent 平台有个绕不开的产品命题：**AI 想做的事，人不点头就不能做。**

AtomOS 是科研工作台，Agent 的一切执行动作——跑脚本、提交 GPU 任务、取消作业——都在"可能花真金白银资源"的边界上。human-in-the-loop 不是姿态，是安全边界。

这篇讲审批流怎么从"一个 if"做成一套产品体验。

## 一、审批的三层拆解

"Agent 请求确认"拆开是三层，各自独立演化：

1. **判定层**（后端）：什么动作需要确认？——上一篇讲过的 `approval_decision`
2. **协议层**（事件流）：审批请求如何在事件流里表达、决策如何回传
3. **呈现层**（前端）：用户看到什么、怎么操作、操作后发生什么

判定层之前写过了。这篇讲协议和呈现。

## 二、协议层：审批是时间线上的一等公民

审批不是弹窗——它是**事件流里的事件**。前端 reducer 收到的是：

```typescript
if (event.type === "approval_requested" && event.call_id) {
  const key = `approval:${runId ?? "unknown"}:${event.call_id}`;
  if (next.items.some((item) => item.key === key)) return next;
  return {
    items: sorted([...next.items, {
      key, kind: "approval", role: "system", text: event.plan?.title ?? event.name ?? "Approval required",
      order: seq, run_id: runId, call_id: event.call_id, status: "awaiting_approval",
      approval: {
        call_id: event.call_id,
        title: event.plan?.title ?? event.name ?? "Approval required",
        summary: event.plan?.summary ?? "",
        note: event.plan?.note,
        details: event.plan?.details,
        status: "pending",
      },
    }]),
  };
}
```

注意这个设计的关键点：

**审批卡片带完整的 ApprovalPlan**：`title` / `summary` / `note` / `details`（键值对列表）。Agent 不只说"我要跑任务"，而是说"我要跑什么脚本、用多少资源、为什么"——**决策所需信息随事件本体携带，前端不需要二次查询**。

**幂等键是 `approval:runId:callId`**：与时间线的其他条目同样有唯一键，断线重连、历史重放都不会出现两张审批卡。审批的去重逻辑与消息、工具调用完全同构——这就是前面"幂等归约"设计的红利，新的事件类型接入零成本。

**决策回传也是事件**：

```typescript
if (event.type === "approval_decision" && event.message_id) {
  // 找到 pending 的审批条目，写入 approved / declined
  const approved = event.decision === "approve" || (!event.decision && /approved/i.test(event.text ?? ""));
```

审批结果（`decision: "approve" | "deny"`）回到事件流，审批卡片的状态从 `awaiting_approval` 翻转为 `succeeded` / `cancelled`。**决策本身也是历史的一部分**——复盘"当时为什么放行"有据可查。

## 三、呈现层：ComposerSeat 的"占座"设计

前端最巧妙的部分是**审批期间输入框的处理**。审批等待中，用户的输入框不能照常可用——否则 Agent 还在等确认，用户又发了新消息，会话状态就乱了。

AtomOS 的组件叫 `ComposerSeat`（"输入座"），看它的结构：

```typescript
export function ComposerSeat({ approval, question, approvalSubmitting, questionSubmitting, onApproval, onAnswer, children }) {
  const active = approval || question;
  return <>
    {approval?.approval && <section className={styles.approval} aria-live="polite">
      <header><ShieldAlert size={17} aria-hidden /><div><span>Approval required</span><strong>{approval.approval.title}</strong></div></header>
      <p>{approval.approval.summary}</p>
      {approval.approval.details?.length ? <dl>{approval.approval.details.map((detail) => <div key={`${detail.label}:${detail.value}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl> : null}
      {approval.approval.note && <aside>{approval.approval.note}</aside>}
      <footer>
        <button type="button" disabled={approvalSubmitting} onClick={() => onApproval("deny")}>Cancel</button>
        <button type="button" className="primary" disabled={approvalSubmitting} onClick={() => onApproval("approve")}>
          {approvalSubmitting ? "Submitting..." : "Confirm & run"}
        </button>
      </footer>
    </section>}
    {question && <div className={styles.question}><QuestionCard item={question} onAnswer={onAnswer} submitting={questionSubmitting} /></div>}
    <div className={`${styles.composerLayer}${active ? ` ${styles.hidden}` : ""}`}>{children}</div>
  </>;
}
```

三个设计决策：

**1. 审批卡片"占据"输入框的位置**（`composerLayer hidden`）——不是弹窗盖在上面，是**替换**。视觉语义准确：此刻对话的控制权不在你手里，在等你决策。弹窗会被关掉、会被忽略，占座不会被忽略。

**2. `aria-live="polite"`**——屏幕阅读器会主动播报审批请求。这是安全相关 UI 的可访问性底线：视障用户不能因为看不到红色警告就错过确认环节。

**3. 按钮的提交态防抖**——`approvalSubmitting` 期间两个按钮都 disabled，防止双击发出两个决策事件（决策事件虽然幂等，但用户体验上双击会造成困惑）。

`question`（提问卡片）与审批共用这个"占座"机制——它们本质是同一件事：**Agent 主动发起的、阻塞会话的人类输入请求**。基础设施复用，交互模式统一，用户学一次就会。

## 四、状态机：审批卡片的完整生命周期

把审批卡片的状态翻一遍，它是个小状态机：

```
(事件流) approval_requested
    → status: awaiting_approval, approval.status: pending
(用户点 Confirm) → approvalSubmitting: true（按钮锁）
(事件流) approval_decision
    → status: succeeded | cancelled, approval.status: approved | declined
```

边界情况：

- **审批期间断线**：重连后 `loadHistory` 重放事件，`approval:runId:callId` 幂等键保证审批卡不重复；pending 状态照旧
- **审批期间会话切换**：组件卸载，`cancelled = true`，重连链停
- **Agent 超时自动取消**：服务端发 `approval_decision`（declined），前端卡片翻成 cancelled
- **双击/重复决策**：事件幂等 + 按钮锁双保险

## 五、Normal / Auto：策略的两档边界

判定层的策略值得再强调一遍设计立场：

| 场景 | Normal | Auto |
|---|---|---|
| `bash_run`（短时） | 直接执行 | 直接执行 |
| `submit_job`（CPU≤4 / 16GiB / ≤1h / 无GPU） | 需确认 | **免确认** |
| `submit_job`（超阈值或有 GPU） | 需确认 | 需确认 |
| `cancel_job` | 需确认 | **无条件需确认** |

Auto 模式的免确认范围**只圈住"低资源、短时长、无 GPU"的 CPU 任务**。GPU 任务哪怕在 Auto 也要确认——一次 GPU 任务的算力成本是 CPU 的几十倍，而且科研场景下 GPU 资源经常是共享池，占用的机会成本很高。

`cancel_job` 的无条件确认更值得说：**取消是破坏性操作，哪怕它看起来"只是停个任务"**。Agent 误判进度、被注入诱导、或者单纯理解错了用户意图时，取消掉一个跑了 8 小时的任务，损失不可逆。破坏性操作不设自动通道，这是把"不可逆"当成最高优先级的判断依据。

## 六、为什么审批是产品而不是功能

回头看，AtomOS 的审批流和"弹个 confirm()"的差别在于：

1. **它是事件流的公民**——审批请求和决策都是不可变历史的一部分，可审计、可回放、可复盘
2. **它带着完整上下文**——脚本、资源、理由随事件携带，用户**拥有决策所需的全部信息**，不是"允许/拒绝"的二选一盲盒
3. **它有明确的控制权语义**——占座设计让"会话此刻归谁"变成显式状态，不是靠禁用输入框含糊表达
4. **它的降级路径完备**——断线、超时、自动取消、双击，每条边界都有归宿

科研用户对这个功能的信任感，就是这么一点一点攒出来的。**Human-in-the-loop 的体验成本很高，但它就是 Agent 产品的信任基础设施。**

## 七、总结

1. **审批 = 判定（后端策略）+ 协议（事件流）+ 呈现（前端状态机）**，三层独立演化
2. **审批请求是携带完整决策上下文的事件**，幂等键与其他条目同构
3. **占座设计**：审批期间输入框被替换而非遮挡，控制权语义显式化
4. **破坏性操作（cancel）不设自动通道**，不可逆性是最高判断依据
5. **Auto 模式的免确认圈只围低资源 CPU 任务**，GPU 一律人工确认

一句话：**审批不是打断 Agent 的弹窗，是会话状态机里的一个一等状态——它有协议、有历史、有上下文、有归宿。**
