---
title: "对话式 UI 的"最小惊讶"：从 Auto 模式选择到 Thinking 折叠"
date: "2026-10-11"
tags: ["AI Agent", "UX 设计", "React", "产品设计", "前端工程"]
cover: ""
description: "Agent 对话界面的信息密度极高：思考过程、工具调用、审批请求、流式回复同时发生。本文拆解 AtomOS 聊天 UI 的几个微决策：活动条目的动词化标签、Thinking 状态的语义、自动模式的 UI 明示、以及为什么错误卡片和成功卡片要有不同的视觉重量。"
---

# 对话式 UI 的"最小惊讶"：从 Auto 模式选择到 Thinking 折叠

Agent 对话界面的难点不是"把内容显示出来"，是**当 6 种事情同时发生时，用户依然知道自己看到的是什么**。

- 模型在流式输出正文
- 同时在调用工具（工具又分运行中/完成/失败）
- 审批请求弹了出来
- 上一轮的错误还没处理
- 状态栏显示着连接状态

这篇拆 AtomOS 聊天 UI 里几个"小但关键"的决策。

## 一、活动条目：动词化的工具标签

工具调用在时间线上显示为一行简短的活动条目。标签不是工具名，是**动词化的描述**：

```typescript
function traceVerb(item: TimelineItem) {
  const tool = item.tool ?? "tool";
  if (/ask_user_question/i.test(tool)) return "Asked";
  if (/open_artifact/i.test(tool)) return "Opened";
  if (/user_skill/i.test(tool)) return "Loaded";
  if (/read|inspect|list/i.test(tool)) return "Read";
  if (/search|grep|find/i.test(tool)) return "Searched";
  if (/write|edit|patch|create/i.test(tool)) return "Edited";
  if (/run|bash|command|exec/i.test(tool)) return "Ran";
  if (item.kind === "job") return "Started";
  return "Used";
}
```

`bash_run` → "Ran"、`read_skill_file` → "Read"、`submit_job` → "Started"。

为什么不直接显示工具名？因为**工具名是系统语言，动词是用户语言**。用户不需要知道工具叫 `bash_run`，需要知道 Agent"跑了命令"。动词把系统行为翻译成动作语义，扫一眼就知道发生了什么。

配套的还有宾语（`traceTarget`/`traceLabel`）：

```typescript
function traceLabel(item: TimelineItem) {
  if (item.tool === "bash_run") return "command";
  if (item.tool === "edit" || item.tool === "apply_patch") return item.path ? "file" : "files";
  if (item.tool === "read_skill_file") return "file";
  if (item.tool === "open_artifact") return "artifact";
  if (item.tool === "ask_user_question") return "a question";
  if (item.tool === "user_skill") return "skill";
  if (item.kind === "job") return "job";
  return item.tool ?? "tool";
}
```

"Ran command"、"Edited file"、"Started job"——主谓宾齐全的微语句。**信息设计的颗粒度对齐了用户的扫读速度**。

## 二、状态图标：四种状态各归各位

```typescript
function statusIcon(status: string, size = 15) {
  if (status === "running")
    return <LoaderCircle size={size} className={styles.spinning} aria-hidden />;
  if (SUCCESS_STATUSES.has(status)) return <CheckCircle2 size={size} aria-hidden />;
  if (FAILURE_STATUSES.has(status)) return <XCircle size={size} aria-hidden />;
  if (status === "awaiting_approval" || status === "awaiting_input")
    return <CircleHelp size={size} aria-hidden />;
  return <Clock3 size={size} aria-hidden />;
}
```

- **running** → 旋转的圈（动的状态用动图标）
- **成功** → 实心对勾
- **失败** → 叉
- **等待输入/审批** → 问号（**这个状态的语义是"在等你"，不是"在跑"**——问号准确表达"球在你这边"）
- **其他/未知** → 时钟

注意成功和失败是 **Set 匹配**（`SUCCESS_STATUSES`），不是严格相等——上游事件的状态字段可能是 `succeeded`/`ok`/`completed` 的任何一种（lifecycleStatus 归一化之前的历史数据）。**展示层对输入的宽容是必须的，因为数据来自多个版本的事件流。**

## 三、活动分组与折叠：可折叠性的判定

回看时间线归约那篇讲过的 `segmentTurn`，有个字段值得单独拎出来：

```typescript
const canCollapse = Boolean(user && (entries.length > 1 || activityState) && !hasAttention);
```

一串工具活动可以折叠成"活动块"的条件：**没有需要用户注意的条目**（`hasAttention`）。审批、提问、错误——任何一个出现，这组活动就**不许折叠**。

这是"最小惊讶"的典型应用：折叠的目的是降噪，但**降噪不能吞掉需要用户行动的东西**。把审批请求折叠进活动块等于把它藏起来——用户永远看不到，Agent 永远在等。

## 四、Thinking 状态：语义精确的"思考中"

```typescript
const thinking = isLast && activeModelCalls && !nonUser.some((item) => item.role === "assistant" && item.pending);
```

`thinking` 的判定不是"模型在跑"，是**"模型在跑且还没有任何可见输出"**——一旦有第一个字落屏，状态就从 thinking 切到流式输出。

这个区分很值钱：**"思考中"和"打字中"是两种不同的用户预期**。思考中可能持续几十秒（长 reasoning），用户需要的是"它没死"的确认；打字中用户开始阅读，需要的是流畅的追加渲染。把两者混为一个"loading"，用户要么在打字阶段还在等"什么时候开始"，要么在思考阶段以为卡死了。

## 五、Auto 模式的 UI 明示

Auto/Normal 的选择直接改变了 Agent 的行为边界（哪些任务免确认）。UI 上这个状态**必须显眼**，因为它决定了"我发一句话之后会发生什么"：

- Normal 模式：用户预期"重要操作前会问我"——UI 要让"接下来会问我"可预期
- Auto 模式：用户预期"低资源任务直接跑"——UI 要让"哪些会直接跑"可推断

审批卡片（ComposerSeat 那篇详述）出现时占座替换输入框——这个位置本身就是最强的信号："现在球在你这边"。反过来，Auto 模式下审批卡不出现 = 信任的沉默。

## 六、错误卡片：视觉重量不同于成功

错误在时间线上是独立的 `error` 条目（红色系），且：

- 不可折叠（`isAttentionItem` 包含 error）
- 文案带错误码：`Model call failed (rate_limited)`
- 被取消的调用（`cancelled_by_user`）**不显示为错误**——用户自己取消的，不是事故

最后一条尤其体现语义精度：**"用户取消"和"系统失败"是两种性质完全不同的事件**。前者是正常流程（用户改主意了），渲染成红色错误会让用户怀疑"我是不是搞坏了什么"。

## 七、总结

1. **动词化标签**：系统语言 → 用户语言，"Ran command" 不是 "bash_run"
2. **状态图标各有语义**：等待输入用问号不用转圈——"在等你"不是"在跑"
3. **可折叠性排除注意力条目**：降噪不能吞掉审批/提问/错误
4. **Thinking ≠ 打字中**：预期管理拆成两态
5. **取消不是错误**：用户主动行为的视觉归类独立
6. **宽容解析上游状态**：展示层对多版本数据格式鲁棒

一句话：**对话式 UI 的品质 = 每个微状态都被赋予精确语义的总和——用户扫一眼就知道"现在球在谁那边"。**
