---
title: "给 LLM 的工具参数加围栏：模型会幻觉出越权参数"
date: "2026-09-28"
tags: [后端架构, AI Agent, 大模型应用, 工程实践]
cover: ""
description: "LLM 完全可能在工具参数里编出 namespace、serviceAccount 这类根本不在 schema 里的字段。本文讲解 AtomOS 如何用服务端保留字拦截模型幻觉参数、用 JSON Schema 预编译校验堵住畸形参数，以及审批策略为什么用 Decimal 而不是 float 比较资源阈值。"
---

# 给 LLM 的工具参数加围栏：模型会幻觉出越权参数

做 Agent 平台，有一条安全红线必须先想清楚：**模型输出的工具参数，和用户提交的表单一样，是不可信输入。**

但和表单校验不同的是，模型输出的"坏参数"不全是恶意注入——相当一部分是**幻觉**。这篇讲 AtomOS 的三层围栏。

## 一、先看一个真实威胁：模型会编造越权参数

假设工具 schema 里只声明了 `script`、`resources`、`timeout_seconds` 三个字段。模型完全可能在输出里给出：

```json
{
  "script": "...",
  "namespace": "kube-system",
  "serviceAccount": "admin"
}
```

`namespace` 和 `serviceAccount` **根本不在 schema 里**。但模型为什么会给？因为训练数据里"提交任务"的语境几乎总带着这些字段——Kubernetes 教程、CI 配置、部署文档。模型按语境惯性补全了它"觉得应该有"的参数。

这不是攻击，是统计惯性。但后果一样严重：**如果服务端把参数原样透传给执行层，模型就在事实上指定了运行环境**——哪个 namespace、什么权限、用哪个镜像。

AtomOS 的态度写在 README 里：

> Agent 不会接收客户端传入的 user、Project、namespace、PVC、image 或 ServiceAccount；这些信任上下文由服务端解析。

## 二、第一层围栏：服务端保留字

`agent-server/app/capabilities.py` 的 dispatch 入口处：

```python
reserved = {
    "user_id", "project_id", "session_id", "call_id", "namespace", "pvc",
    "image", "service_account", "serviceAccount", "runtime_class",
    "retry_of_job_id",
}
attempted = sorted(reserved.intersection(args))
if attempted:
    return {"error": f"server-controlled argument(s): {', '.join(attempted)}"}
```

任何撞上保留字的调用**直接拒绝，返回带原因的错误**——注意不是"忽略这个字段继续执行"，是拒绝整个调用。

为什么拒绝而不是静默丢弃？两个理由：

1. **静默丢弃会掩盖问题**。模型下次还会给，永远不知道自己错了。返回明确错误（`server-controlled argument(s): namespace, image`）让模型在下一轮自我修正
2. **拒绝是可观测的**。日志、事件流里能看到"模型试图传保留字"，这是安全审计信号

保留字清单本身也有讲究：`service_account` 和 `serviceAccount` 两种拼写都在——**模型会随训练语料的风格切换驼峰/下划线**，围栏必须按最坏情况封堵。

## 三、第二层围栏：JSON Schema 预编译校验

保留字拦截的是"不该有的字段"，那"该有的字段值不对"呢？比如 `cpu: "banana"`、`timeout_seconds: -5`。

AtomOS 在 Agent 运行时（`agent_runtime.py`）里做了一个 `ToolArgumentRegistry`：**把所有工具的参数 schema 用 `Draft202012Validator` 预编译成校验器，模型输出先过校验再进 dispatch**：

```python
class ToolArgumentRegistry:
    """Precompile the advertised function schemas and validate model output."""

    def __init__(self, schemas: Iterable[dict[str, Any]]) -> None:
        validators: dict[str, Draft202012Validator] = {}
        for schema in schemas:
            function = schema.get("function") or {}
            parameters = function.get("parameters")
            Draft202012Validator.check_schema(parameters)
            validators[name] = Draft202012Validator(parameters)
        self._validators = validators
```

校验分级不是二值的，而是三档：

| 状态 | 含义 | 后续处理 |
|---|---|---|
| `valid` | 参数合法 | 正常执行 |
| `schema_invalid` | 结构在、值不对（超长字符串、类型错误、缺必填） | 不执行，错误回给模型重试 |
| `malformed` | JSON 本身坏了（超过 256 KiB、解析失败、非对象） | 不执行，标记为不可重放 |

三档区分有个关键用途：`replay_safe` 属性——`valid` 和 `schema_invalid` 的调用**可以从持久化事件日志安全重放**（参数是结构完整的，重放时重新校验即可），`malformed` 的不能重放（字节本身有问题）。事件日志那篇会再展开。

尺寸限制也是围栏的一部分：

```python
_MAX_ARGUMENT_BYTES = 256 * 1024        # 整个参数 JSON 上限 256 KiB
_MAX_ARGUMENT_STRING_CHARS = 128 * 1024 # 单个字符串字段上限 128 KiB
```

以及一个递归检查——**超长字符串可能藏在嵌套结构深处**：

```python
def _contains_oversized_string(value: Any) -> bool:
    if isinstance(value, str):
        return len(value) > _MAX_ARGUMENT_STRING_CHARS
    if isinstance(value, dict):
        return any(_contains_oversized_string(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_oversized_string(item) for item in value)
    return False
```

`schema_invalid` 时返回的错误还带 JSON Path：`f"{path}: {first.message}"` → `"resources.cpu: 'banana' is not of type 'number'"`。**错误信息精确到字段，模型一次就能改对。**

## 四、第三层围栏：审批策略与 Decimal 阈值

前两层挡的是"参数形状"，第三层管"这个动作本身要不要人确认"。

`approval_decision` 的规则：

```python
def approval_decision(name: str, args_json: str, mode: str) -> tuple[bool, str]:
    if name == "cancel_job":
        return True, "Agent-initiated Job cancellation always requires confirmation"
    if name != "submit_job":
        return False, ""
    if mode == "normal":
        return True, "Background Job submission requires confirmation in normal mode"
    # auto 模式下解析资源再判断
```

三条硬规则值得注意：

1. **`cancel_job` 无条件要确认**——哪怕在 Auto 模式。取消别人的任务是破坏性操作，不设白名单
2. **Normal 模式下 `submit_job` 一律要确认**
3. Auto 模式下按资源阈值放行：CPU ≤ 4、内存 ≤ 16 GiB、timeout ≤ 3600s、**无 GPU**

阈值比较用的是一个容易被忽略的细节——`Decimal`：

```python
cpu = parse_resource_quantity(resources.cpu, "cpu")
memory = parse_resource_quantity(resources.memory, "memory")
if cpu > Decimal(4):
    return True, "Jobs above 4 CPU require confirmation in auto mode"
if memory > Decimal(16 * 1024**3):
    return True, "Jobs above 16 GiB RAM require confirmation in auto mode"
```

为什么不用 float？资源字符串是 `"1500m"`、`"16Gi"` 这种 Kubernetes 量纲格式。解析成 float 再比较，`16 * 1024**3` 这种量级会有精度误差，**边界上的值可能被错误放行或错误拦截**。Kubernetes 自己的资源解析就是精确算术，比较也要跟上。

还有个防御细节：资源解析失败时**降级为需要确认**，而不是放行：

```python
except (json.JSONDecodeError, TypeError, ValueError, ValidationError):
    return True, "Job resources could not be validated for automatic submission"
```

失败默认收紧（fail-closed），不默认放行。

## 五、参数值永远不进日志

最后一个细节。模型参数里可能有敏感内容（脚本内容、路径），AtomOS 的事件日志只存**形状不存值**：

```python
def redacted_argument_preview(raw: str, *, limit: int = 160) -> str:
    """Return shape-only diagnostics; argument values never enter events/logs."""
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return f"malformed JSON ({len(raw)} chars)"
    if not isinstance(value, dict):
        return f"JSON {type(value).__name__} ({len(raw)} chars)"
    keys = ", ".join(sorted(str(key)[:40] for key in value)[:12])
    suffix = ", ..." if len(value) > 12 else ""
    return f"object keys: {keys}{suffix}"[:limit]
```

诊断信息只回答"参数长什么样"（哪些键、多大），永远不回答"参数里写了什么"。

## 六、总结

三层围栏各管一段：

1. **保留字**：挡住模型幻觉出的越权字段，错误显式回给模型
2. **Schema 预编译 + 尺寸限制**：挡住畸形参数，错误带 JSON Path，分级决定能否重放
3. **审批策略**：动作层面的权限闸门，阈值用精确算术，解析失败 fail-closed

贯穿的原则只有一条：**把模型输出当成"会犯错的用户输入"对待——校验、拒绝、给精确反馈，但绝不透传。**

一个前端为什么要懂这个？因为围栏的每一层都会以具体 UI 形态出现在前端：参数被拒绝时时间线上要有可读的错误卡片、审批请求要渲染成确认对话框、Auto 模式的阈值要能配置展示。**围栏的规则在后端，围栏的体验在前端。**
