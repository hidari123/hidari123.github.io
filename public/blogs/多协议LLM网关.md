---
title: "多协议 LLM 网关：Chat Completions、Responses 与不守规矩的模型"
date: "2026-10-13"
tags: ["LLM", "网关", "API 设计", "Python", "AI 工程"]
cover: ""
description: "同一个 Agent 循环要接 OpenAI Responses、Chat Completions 和 MiniMax，而真实世界里的模型连 tool calling 的输出格式都不统一。本文讲解 AtomOS 的多协议适配层：状态模式的双轨设计、XML 风格 tool call 的兜底解析、以及流式事件如何归一成统一形状。"
---

# 多协议 LLM 网关：Chat Completions、Responses 与不守规矩的模型

Agent 平台接模型，理想是"一套代码接所有厂商"，现实是——**每个厂商的 API 都有微妙的方言，甚至同一厂商的不同模型都不守自己的规矩**。

AtomOS 的 `model_gateway` 模块就是干这个的。这篇讲三个层次：协议归一、状态管理、格式兜底。

## 一、协议层：两种 API 的归一

OpenAI 系有两代 API，结构差异不小：

| | Chat Completions | Responses |
|---|---|---|
| 消息形态 | `messages` 数组 | `items` / `input` |
| 工具声明 | `tools[].function` | `tools[].type: "function"` 扁平结构 |
| 状态 | 无（每次全量传） | 服务端状态（`previous_response_id`） |
| 流式 | SSE chunk | SSE event，item 结构 |

网关的第一件事是把工具声明从 Chat 风格转成 Responses 风格（`normalize_tools`）——因为 Agent 循环内部只有一个统一的工具目录表示。

而 provider 层面有明确的**专属性约束**，`responses.py` 的 docstring 开门见山：

> The adapter is intentionally provider-specific: only the ``openai`` profile may
> use it. Provider-owned output items are retained only in the caller's in-memory
> continuation state; the durable transcript remains the portable AtomOS form.

两个要点：

1. **Responses 协议只允许 openai profile 用**——别的厂商就算兼容 Responses 也可能有微妙差异，宁可不开这个口子
2. **provider 私有的输出 items 只留在内存的续接状态里，持久化转录永远是 AtomOS 自己的可移植格式**——这是上一篇（checkpoint 设计）讲的"可移植性优先"在协议层的落点

## 二、状态模式：item_replay 与 previous_response_id

Responses 协议的续接有个开关（`responses_state_mode`）：

```python
if state_mode not in {"item_replay", "previous_response_id"}:
    raise ValueError(...)
```

两种模式的取舍（上一篇详细算过账，这里补充协议视角）：

**`previous_response_id` 模式**：

```python
if state_mode == "previous_response_id" and latest and latest.previous_response_id:
    payload["previous_response_id"] = latest.previous_response_id
payload["store"] = state_mode == "previous_response_id"
```

客户端只传增量，服务端 `store=True` 存状态。**省 token，但会话状态寄存在厂商手里**。

**`item_replay` 模式（默认）**：

```python
payload["input"] = (messages, states if state_mode == "item_replay" else [])
```

每次全量重放 items。多花 token，换来：换模型不丢会话、厂商侧无状态依赖、调试时请求自包含。

AtomOS 的默认值选了 `item_replay`——又一次"用 token 买可移植性"。

## 三、兜底解析：模型连 tool calling 都不守规矩

协议归一解决的是"API 长什么样"，但真实麻烦在于：**模型的输出不一定符合它自己声明的协议**。

标准 Chat Completions 的 tool calling 走结构化字段：

```json
{"tool_calls": [{"function": {"name": "bash_run", "arguments": "{...}"}}]}
```

但有些模型（尤其小尺寸或开源模型）会把工具调用**以 XML 形式写进正文**。AtomOS 的 `llm.py` 里有两个专门的解析器：

```python
def _parse_xml_tool_calls(text: str) -> list[ToolCall]:
```

以及一个更通用的：

```python
def _recover_tool_calls(text: str) -> list[ToolCall]:
```

`_recover_tool_calls` 的存在本身就是个声明：**结构化字段缺失时，从纯文本里"捞回"工具调用是必要能力**。这不是 hack，是承认现实的工程——上游模型的质量是外生变量，网关必须比模型更宽容。

同样的问题也存在于参数值层面。`_coerce_scalar` 处理的是：模型把 `42` 写成 `"42"`、把 `true` 写成 `"true"`——**类型混乱的参数要能被矫正后再过 schema 校验**，否则用户看到的就是无穷无尽的"参数类型错误"重试循环。

## 四、流式归一：事件形状统一

Agent 循环不想关心"这条事件来自 SSE chunk 还是 SSE event"。网关把所有协议的流式输出归一成统一的 `ModelStepResult` 序列：

```python
@dataclass
class ModelStepResult:
    ...
```

包含规范化后的 tool call（`NormalizedToolCall`）、用量（`ModelUsage`）、续接状态（`ProviderContinuationState`）。

`NormalizedToolCall` 的存在让下游（参数围栏、审批策略）完全不用感知协议差异——上一篇的 `ToolArgumentRegistry` 校验的就是这个归一结构。

## 五、重试与退避：把 429 当成常态

多厂商意味着**速率限制策略也各异**。`llm.py` 的重试逻辑带三个专门函数：

```python
def _retry_backoff(attempt: int, *, status: int | None) -> float: ...
def _parse_retry_after(val: str | None) -> float | None: ...
def _status_retry_delay(resp: httpx.Response, attempt: int) -> float: ...
```

`_parse_retry_after` 单独存在，说明**尊重 `Retry-After` 头**是一等公民——429 之后等多久，厂商说了算，不是自己拍指数退避。有 `Retry-After` 用它，没有才退回指数。

## 六、前端视角：为什么这些都在前端射程内

- **模型管理 UI**：Admin → Models 的表单里，`provider_profile` / `api_protocol` / `supports_tools` / `reasoning_control` 全是要渲染的配置项——不懂协议差异，表单的校验和提示就没法写
- **Probe（探测）**：保存模型后有个"最小协议检查"按钮，一次真实调用验证配置——它的本质就是网关归一链路的 smoke test
- **fallback 模型**：`fallbacks` 配置意味着前端要展示"主模型失败后自动切到哪个"——这是网关重试策略的 UI 投影
- **流式 UI**：前端时间线收到的事件形状，就是网关归一后的形状——上游协议再乱，前端只认一种

## 七、总结

1. **协议归一是网关的本职**：工具声明、消息形态、流式事件全部折叠成内部统一结构
2. **provider 专属能力要显式圈禁**：Responses 适配器只对 openai profile 开放，不给"兼容"留后门
3. **状态模式双轨**：`item_replay` 默认（可移植），`previous_response_id` 可选（省 token）
4. **格式兜底是常态工程**：XML tool call 解析、参数标量矫正、缺失恢复——模型的输出质量是外生变量
5. **Retry-After 是一等公民**：429 的等待时长听厂商的

一句话：**网关的本质是"把厂商的方言翻译成一种语言，并且容忍说话结巴"。**
