---
title: "反向代理的 FlushInterval：流式响应在网关层被吞掉的坑"
date: "2026-10-12"
tags: ["Go", "反向代理", "SSE", "流式传输", "网络", "后端架构"]
cover: ""
description: "SSE 流式输出在开发环境好好的，上了网关就变成一次性吐完？问题多半不在你的代码，在代理的响应缓冲。本文从 Go httputil.ReverseProxy 的 FlushInterval 说起，讲清流式传输、大文件上传、Range 下载为什么共享同一个坑，以及 WebSocket 升级为什么是例外。"
---

# 反向代理的 FlushInterval：流式响应在网关层被吞掉的坑

AtomOS 的架构里有一个 Go 写的统一入口 `atomos-api`：浏览器的一切请求——静态资源、REST、WebSocket、文件上传——先到它，再转发给后端各服务。

代理本身用的是标准库的 `httputil.ReverseProxy`。而初始化代码里有一行，如果不懂它为什么存在，迟早会在生产环境撞墙：

```go
proxy := httputil.NewSingleHostReverseProxy(target)
// Request bodies are always streamed by ReverseProxy. A negative response
// flush interval also forwards upload progress/errors and downloads without
// waiting for the proxy's periodic response buffer.
proxy.FlushInterval = -1
```

`proxy.FlushInterval = -1`。一行赋值，背后是流式传输在代理层的整个故事。

## 一、症状：开发好好的，上网关就"卡住"

典型的排查现场：

- 本地直连 agent-server，SSE 流式输出**一个 token 一个 token**往外蹦，体验完美
- 部署到 K3s，前面隔了 atomos-api 反向代理，同样的接口变成**等十几秒一口气吐完**——用户看到的是"假流式"
- 更诡异的是上传：5 GiB 的文件传到 90% 失败，但错误提示延迟半天才出现

三件事（流式、上传进度、下载）看似无关，其实是同一个机制。

## 二、根因：ReverseProxy 的响应缓冲

`httputil.ReverseProxy` 的默认行为是**周期性批量转发响应**。它内部有一个响应缓冲机制：从上游读到数据后，不是立刻写给下游，而是攒一波再发——攒的节奏由 `FlushInterval` 控制。

默认值是**正数**（定期 flush），这对普通 REST 响应完全没问题——1KB 的 JSON 攒不攒没区别。但对流式响应是灾难：

**SSE 的本质是"服务端持续写、客户端持续读"。** 代理把"持续写"变成"攒一波写一波"，token 就成批到达客户端。攒批的间隔大于人类的感知阈值（约 100ms），"流式"就退化成"分段"。

`FlushInterval = -1` 的语义：**每从上游读到一点数据，立刻写穿到下游，不做任何缓冲**。注释里也点了：

> A negative response flush interval also forwards upload progress/errors and downloads without waiting for the proxy's periodic response buffer.

## 三、为什么上传和下载也是同一个坑

**上传（请求体方向）**：注释的第一句——`Request bodies are always streamed by ReverseProxy`——说明请求方向本来就是流式的，这个不担心。真正的问题是**上传的错误和进度反馈走的是响应方向**：服务端边收边回 ACK/进度，代理若缓冲响应，进度更新和错误信号就延迟到达。5 GiB 传到一半失败，客户端要多等几秒才知道——重试窗口白白变长。

**下载（响应体方向）**：AtomOS 的 Workspace 支持 Range 下载大文件。Range 请求的响应同样被缓冲的话，下载吞吐会被攒批节奏限速——不是带宽不够，是代理在"掐着流量"。

所以一次 `FlushInterval = -1` 同时治了三种病。**判断依据不是业务类型，是数据方向：凡是"服务端持续产生、客户端需要及时收到"的响应，都不能被代理缓冲。**

## 四、WebSocket 为什么不用管

AtomOS 的聊天时间线走 WebSocket。WebSocket 请求经过这个代理时**不需要** FlushInterval 保护——因为 `ReverseProxy` 对 WebSocket 有专门的升级处理路径：协议升级（`Upgrade: websocket`）成功后，代理退化为一个**透明双向管道**，不再碰应用层缓冲。

这也解释了为什么聊天流式在网关后没问题、而 SSE（纯 HTTP）会出问题——**前者有协议升级的专门通道，后者是普通 HTTP 响应，落在默认缓冲逻辑里**。

## 五、还有一层：SSE 经过代理链的请求头

流式响应要一路畅通，光有 FlushInterval 不够。代理链上还有两个响应头要确保透传：

```
Cache-Control: no-cache
X-Accel-Buffering: no
```

`X-Accel-Buffering: no` 是给 Nginx 系（以及尊重这个头的中间层）的信号：**别缓冲这个响应**。如果部署链路上不止一层代理（比如 ingress → atomos-api → agent-server），每一层都得放行。开发环境单层代理往往测不出来，多层是生产才暴露的问题。

## 六、前端视角：为什么这坑总由前端先发现

值得想一下：这个坑的**第一发现者通常是前端**。

- 流式渲染是前端的功能，"token 不动"是前端先看到的
- 前端排查自己的代码（SSE 解析、渲染节流）半天没问题，才会往链路上查
- 最终定位在网关层——但排查的起点、复现的路径、压测的方法，全是前端技能

这就是为什么这个坑值得前端彻底搞懂。AtomOS 的 SSE 那套（前端的 Worker 方案）解决的是**渲染端**的流式问题，这一篇解决的是**传输链路**的流式问题——一个在浏览器里，一个在服务间，合起来才是完整的流式链路。开发环境直连、生产隔网关，两边行为不一致时，先怀疑链路缓冲。

## 七、总结

| 症状 | 根因 | 解法 |
|---|---|---|
| SSE 变"分段吐" | 代理周期性 flush 攒批 | `FlushInterval = -1` |
| 大文件上传错误延迟 | 响应方向的进度/错误被缓冲 | 同上 |
| Range 下载限速 | 响应被缓冲 | 同上 |
| WebSocket 正常 | 协议升级走透明管道 | 无需处理 |
| 多层代理下仍卡 | 每层都有自己的缓冲 | 逐层设 `X-Accel-Buffering: no` |

一句话：**代理默认为吞吐优化（攒批），流式需要为延迟优化（直通）——`FlushInterval = -1` 就是把代理从"批量模式"切到"直通模式"的开关。**
