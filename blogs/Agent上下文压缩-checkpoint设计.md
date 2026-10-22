---
title: "Agent 上下文压缩：跨厂商可移植的 checkpoint 设计"
date: "2026-10-08"
tags: ["LLM", "Agent", "上下文管理", "架构设计", "AI 工程"]
cover: ""
description: "长对话必然撞上下文窗口。厂商原生的 compact 接口各不相同且不可迁移，本文讲解 AtomOS 的替代方案：用固定 schema 的 JSON checkpoint 做可移植摘要，按闭合回合分组切分历史，以及如何防止摘要本身丢掉关键事实。"
---

# Agent 上下文压缩：跨厂商可移植的 checkpoint 设计

Agent 会话跑得久了，上下文必然超窗口。工具调用的参数、返回值、思考过程——一条条往 messages 里堆，几十轮之后 token 轻松破十万。

压缩（compact）是所有 Agent 平台的必修课。但**怎么压**，各家的做法差异很大，而且大多数方案有个隐患：**绑定单一厂商的原生接口**。

## 一、为什么不用厂商原生 compact

主流厂商的上下文管理接口互不兼容：

- OpenAI Responses API 有服务端状态（`previous_response_id` + `store=True`）
- 有些厂商提供原生的 conversation summary 接口
- 有些厂商压根没有，要你自己拼

AtomOS 的决策写在 README 里：

> AtomOS 对所有 provider 使用统一的 client-side portable compact，不调用 provider 原生 compact 接口。

"portable"（可移植）是关键词。一旦用了厂商 A 的原生 compact，会话状态就存在厂商 A 的服务端；换厂商 B、或者 A 改接口，历史对话全部作废。而 Agent 平台的会话是要**长期保存、随时复活**的——今天的会话明天换个模型继续聊，是刚需。

所以压缩必须发生在**客户端**，产出**厂商无关**的格式。

## 二、checkpoint 的 schema：一个固定结构的 JSON

AtomOS 的摘要不是自由文本，而是**固定七个键的 JSON 对象**：

```python
_CHECKPOINT_KEYS = (
    "objective",          # 目标：这个会话在干什么
    "confirmed_facts",    # 已确认的事实
    "artifacts",          # 产出物
    "failed_approaches",  # 失败的尝试——重要！
    "pending",            # 待办
    "current_plan",       # 当前计划
    "next_steps",         # 下一步
)
```

生成摘要的 prompt 要求非常严格：

```python
instruction = (
    "Create an AtomOS portable checkpoint. Return one JSON object with exactly "
    "these keys: objective (string), confirmed_facts (array), artifacts (array), "
    "failed_approaches (array), pending (array), current_plan (array), next_steps "
    "(array). Merge the previous checkpoint with new canonical evidence. Preserve "
    "canonical /workspace paths, checksums, IDs, uncertainties, and actions that "
    "must not be repeated. Use only supplied visible text and structured evidence. "
    "Do not include hidden reasoning, chain of thought, or provider state."
)
```

几个值得注意的约束：

1. **`failed_approaches` 单独成键**——"试过什么、为什么不灵"是最容易被通用摘要丢掉、又最不该丢的信息。丢了它，模型会把失败的方案再试一遍
2. **保留 canonical 路径、校验和、ID**——这些是精确字符串，摘要时改写一个字符就废了
3. **只用可见文本和结构化证据**，明确排除 chain of thought——摘要来自"发生过什么"，不来自"当时怎么想的"
4. **合并式更新**：`Merge the previous checkpoint with new canonical evidence`，增量压缩而不是每次从头总结

schema 校验也是严格的——键集必须**恰好**等于七个，多一个少一个都拒：

```python
if not isinstance(value, dict) or set(value) != set(_CHECKPOINT_KEYS):
    raise ValueError("checkpoint must contain the portable schema keys")
```

还有尺寸上限（512 KiB）和 code fence 剥离——模型爱把 JSON 包进 ```` ```json ````，得剥掉再解析。

## 三、切分：绝不切断一个回合

压缩哪段历史、保留哪段，切分点不是随便找的。核心约束：**assistant 的 tool_calls 和对应的 tool 结果必须待在一起**。

```python
def closed_round_groups(messages):
    """Group messages without ever splitting an assistant/tool-call round."""
```

一个"闭合回合"= 一条带 `tool_calls` 的 assistant 消息 + 它引用的所有 tool 结果消息。切分逻辑沿着闭合边界走，**半开回合直接跳过、既不发送也不摘要**：

```python
if expected and len(seen) == len(expected):
    groups.append(round_messages)
    index = cursor
else:
    # Never send or summarize a half-closed round.
    index += 1
```

为什么这么严格？因为大多数 API 对 `tool_calls` 和 tool 结果的**配对完整性**有硬性要求——一条 assistant 消息声明了 3 个调用，后面就必须跟 3 份结果，缺一个直接 400。压缩时若把回合切两半，历史就永久损坏了。

保留的"近期尾巴"大小跟模型窗口挂钩：

```python
tail_target = max(512, effective_trigger_tokens // 8)
```

**触发阈值的八分之一，下限 512 token**——窗口大的模型留更多近期的完整上下文，但至少保底。

## 四、重放状态：item_replay 的代价与收益

前文提到 OpenAI Responses 协议有两种状态模式。AtomOS 的默认是 `item_replay`：

```python
state_mode = responses_state_mode or "item_replay"
```

- **`previous_response_id`**：让服务端记住状态，客户端只传增量——省 token，但状态在厂商手里
- **`item_replay`**：每次请求都把完整 items 重放——费 token，但状态完全在客户端

默认选后者。代价是每次请求的 token 更多，收益是**换模型、换厂商、迁移部署时历史完整可用**。对"科研工作台"这种会话生命周期可能以周计的产品，这个取舍是对的。

README 里也如实记录了现状：真实 provider 的 Responses 契约"仍需进一步系统测试"——诚实的未完成声明。

## 五、防循环：不止是压缩

同一个模块里还有个小而精的设计——`ProgressGuard`，防 Agent 原地打转：

```python
def before_action(self, signature: str) -> str | None:
    if (
        signature == self.consecutive_failure_signature
        and self.consecutive_failures >= 2
    ):
        return "same failing tool action was blocked before a third execution"
    return None
```

两个维度检测死循环：

1. **同一个动作连续失败 2 次后，第 3 次直接拦截**——"signature"是动作名+参数的规范哈希，不是表面文本
2. **同一动作+同一结果重复 3 次**——连结果都一模一样，说明模型在空转：

```python
cycle = f"{signature}:{result_fingerprint(result)}"
if cycle == self.last_cycle_signature:
    self.repeated_cycles += 1
# ...
if self.repeated_cycles >= 3:
    return "same tool action and result repeated three times without progress"
```

这和压缩放同一个模块是有道理的：**长会话的两大风险就是"上下文爆掉"和"原地打转"**，前者靠压缩，后者靠循环检测，都是 agent_runtime 的守卫职责。

## 六、前端视角：压缩对 UI 意味着什么

- **压缩时机可配置**：`auto_compact_trigger_tokens` 是模型管理里的一栏，管理员能看能改——前端要渲染配置表单和生效阈值
- **压缩是可观测事件**：触发 seq、摘要模型 ID、源区间都写进了事件日志，时间线上能展示"此处上下文已压缩"
- **复活旧会话时**，前端拉到的是"checkpoint 摘要 + 近期尾巴"的组合，渲染逻辑要能区分"摘要块"和"真实消息"

## 七、总结

1. **压缩要在客户端做、产出厂商无关格式**——会话的寿命比厂商的接口稳定
2. **checkpoint 用固定 schema 的 JSON**，七键缺一不可，`failed_approaches` 必须单独保留
3. **切分沿闭合回界**，半开回合宁可丢弃也不发送
4. **item_replay 用 token 换可移植性**，对长寿命会话是正确取舍
5. **防打转和防爆炸同属一个模块**——都是长会话守卫

一句话：**摘要丢什么都可以商量，丢"失败记录"和"精确标识符"不行。**
