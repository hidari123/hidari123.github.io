---
title: "大文件工作台：5 GiB 上传、Range 下载与流式校验"
date: "2026-10-14"
tags: ["文件上传", "Range 请求", "流式处理", "Go", "前端工程"]
cover: ""
description: "科研文件动辄几百 MB 到几 GiB，普通表单上传和整文件下载都会崩。本文讲解 AtomOS Workspace 的文件链路：为什么上传是原始字节流 PUT 而不是 multipart、Range 下载如何支持断点续看、以及 5 GiB 上限和路径校验的安全设计。"
---

# 大文件工作台：5 GiB 上传、Range 下载与流式校验

生物分子的结构文件（PDB/mmCIF）、设计产物、模拟轨迹——科研数据动辄几百 MB，大文件是常态。AtomOS 的 Workspace 要支撑单文件 5 GiB 的上传下载，这逼出了一套与"普通 web 文件"完全不同的链路设计。

## 一、上传：原始字节流 PUT，不是 multipart

传统表单上传用 `multipart/form-data`：文件被编码进 multipart 边界里，服务端解析边界、剥离头尾、重组文件。

对小文件这没问题。对 5 GiB：

- multipart 解析要**在内存或临时文件里缓冲整个段**——5 GiB 的缓冲区不可接受
- 边界扫描是逐字节的 CPU 开销，摊到 GiB 级数据上很可观
- 上传进度难以精确反映（边界和编码开销混在里面）

AtomOS 的选择是**原始字节流直传**——`PUT /api/projects/{id}/workspace/content`，请求体**就是文件内容本身**，没有任何封装：

```go
func isProjectWorkspaceUpload(r *http.Request) bool {
    if r.Method != http.MethodPut {
        return false
    }
    parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
    return len(parts) == 5 && parts[0] == "api" && parts[1] == "projects" &&
        parts[2] != "" && parts[3] == "workspace" && parts[4] == "content"
}
```

Go 侧甚至有专门的路径判别函数，把这个上传端点从通用代理逻辑里**挑出来单独处理**——因为它的请求体是流，不能按普通请求缓冲转发。

原始字节流的收益：

| 维度 | multipart | 原始 PUT |
|---|---|---|
| 内存占用 | 缓冲整段 | 恒定（流式写盘） |
| CPU | 边界扫描 | 近零 |
| 进度语义 | 混合编码开销 | 字节即字节 |
| 断点续传 | 难（编码后字节不对齐） | 天然对齐（但当前未实现，README 明示） |

README 如实写着 `不支持断点续传`——5 GiB 上传中途断了就得重来，这是已知限制而不是隐藏缺陷。**承认边界比假装没有边界好。**

## 二、下载：Range 请求支撑大文件查看

下载侧用的是标准 HTTP Range 机制：

```
GET /api/projects/{id}/workspace/content?path=...
Range: bytes=1048576-2097151
```

Range 对大文件场景的意义：

- **预览不用全量下载**：几百 MB 的文件，前端只拉头几 MB 判断格式、渲染预览
- **播放/查看器按需拉取**：结构查看器只需要文件里坐标部分，不需要拓扑和注释
- **失败重传粒度变细**：一段 Range 失败只重拉那段

配合 `atomos-api` 代理层的 `FlushInterval = -1`（另一篇讲过），Range 响应不会被代理缓冲——下载吞吐不受攒批拖累。

前端侧的下载入口很朴素：

```typescript
<a className="icon-button" href={selectedUrl} download={selected.name}>
```

原生 `<a download>` + 同源 URL——**浏览器自己处理 Range 分块和断点**，前端不需要手写下载器。把浏览器已经做好的事交给浏览器，是这个链路里最容易被忽略的"减法设计"。

## 三、5 GiB 上限：写在刀刃上的约束

上限不是随便拍的。README：

> 单文件上限为 5 GiB，当前不支持断点续传。

5 GiB 是三层现实的交点：

1. **请求体超时**：5 GiB 在慢速链路上要传几小时，反向代理、LB、网关的默认超时都会先扛不住
2. **重试成本**：不支持断点续传时，上限越高，失败重传的代价越大——5 GiB 是"单次重传还能接受"的经验边界
3. **存储配额**：Project PVC 的容量规划按"单文件上限 × 并发任务数"估

上限是**产品承诺**：它告诉用户"超过这个规模请先拆分或用命令行工具"——明确拒绝优于含糊失败。

## 四、路径安全：上传端点的白名单校验

上传端点既然接收任意路径（`?path=/workspace/xxx`），就必须防路径穿越。前端有对称的校验（`reference.ts` 里见过）：

```typescript
export function isValidWorkspacePath(path: string): boolean {
  if (!path.startsWith("/workspace/")) return false;
  if (path.includes("\\") || /[\u0000-\u001f]/u.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== ".." && segment !== ".");
}
```

四条规则：

1. **必须以 `/workspace/` 开头**——上传永远落在 Project 边界内，`/etc`、`../../` 之类的路径直接拒绝
2. **禁止反斜杠**——Windows 路径分隔符在 Linux 侧是非法输入，也是常见的穿越试探
3. **禁止控制字符**——`\u0000-\u001f` 覆盖 null byte 和控制符，null byte 截断是老牌攻击手法
4. **逐段拒绝 `..` 和 `.`**——不靠"规范化后再检查"，而是**逐段白名单**：每个路径段必须是真实名字，不允许任何相对段

前端和后端（Go 侧的 `validateProjectWorkspaceUpload`）**双侧都校验**——前端的校验是为了即时反馈，后端的才是安全边界。前端校验永远可以被绕过，所以后端不信任它是铁律。

## 五、为什么这套值得写

因为它示范了**大文件链路的通用决策树**：

| 问题 | 决策 | 依据 |
|---|---|---|
| 怎么传？ | 原始字节流 PUT | 内存恒定、进度精确、续传可行 |
| 怎么收？ | 流式写盘 | 不缓冲整个请求体 |
| 怎么看？ | Range 按需拉取 | 预览不等于全量 |
| 怎么下？ | 原生 `<a download>` | 浏览器的 Range/断点比手写好 |
| 多大算大？ | 明确上限 5 GiB | 超时、重传、配额的交点 |
| 怎么防穿越？ | 逐段白名单 + 双侧校验 | null byte、相对段全拒绝 |

每一条都是"把约束变成显式工程"——含糊处理的地方，迟早变成半夜的事故。

## 六、总结

1. **原始 PUT 替代 multipart**：流式处理让内存与文件大小解耦
2. **Range 是大文件查看的正确姿势**：预览、按需、细粒度重试三收益
3. **上限是产品承诺**：明确拒绝优于含糊失败，README 里如实标注"不支持续传"
4. **路径校验逐段白名单**：`..`/`.`/反斜杠/控制字符全拒，前后端双侧执行
5. **能用浏览器的不自己写**：下载交给原生 `<a download>`

一句话：**大文件工程的核心不是"撑住大"，是让内存、进度、失败恢复都不随文件大小线性恶化。**
