---
title: "双租户隔离：一个用户的 Kubernetes namespace 是什么体验"
date: "2026-10-18"
tags: [后端架构, 工程实践, Kubernetes]
cover: ""
description: "AtomOS 给每个用户分配真实的 Kubernetes namespace、每个 Project 独立 PVC，数据库用 RLS 和复合外键兜底。本文讲解为什么本地开发也用真隔离、可信身份如何在 Go 网关注入、以及为什么 Agent 永远不接收客户端传来的身份参数。"
---

# 双租户隔离：一个用户的 Kubernetes namespace 是什么体验

多数本地开发环境的"用户隔离"是个假把式：一个共享数据库、一张 users 表、查询里带个 `user_id` 条件——"反正本地嘛"。

AtomOS 反着来：**本地开发也用真实的 per-user Kubernetes namespace**。README：

> 本地开发也使用真实 per-user Kubernetes namespace；数据库使用 RLS 和复合外键，Project runtime 与 PVC 按 Project 创建。

这是"隔离不是环境属性，是架构属性"的立场。这篇讲它怎么落地。

## 一、隔离的三层结构

AtomOS 的隔离不是一层墙，是三道独立的防线：

```
第1道：身份层 —— atomos-api（Go）持有登录态，注入可信身份头
第2道：计算层 —— per-user namespace + per-Project PVC/Shell
第3道：数据层 —— PostgreSQL RLS + 复合外键
```

**任何一道被绕过，剩下两道还在**。这是纵深防御在多租户里的标准形态。

## 二、身份层：可信身份头，Agent 不收身份参数

第一篇（工具参数围栏）埋了个伏笔：Agent 的保留字参数清单里有 `user_id`、`project_id`、`namespace`……**为什么模型连传都不许传？**

因为身份的注入路径是唯一的：

```
浏览器 → atomos-api（验证 JWT/会话）
       → 注入 X-AtomOS-User-Id + X-AtomOS-Admin 头
       → 转发给 tenant Agent Server
```

`atomos-api` 是**唯一浏览器入口**（README 架构图），它的职责是：

1. 校验会话（登录、OIDC BFF 流程）
2. **从服务端会话解析出身份**，写进可信头
3. 把请求转发到对应租户的服务

下游服务（tenant Agent Server）拿到身份的**唯一途径**是这个头——**身份由服务端注入，不由任何客户端输入决定**。浏览器无法伪造 `X-AtomOS-User-Id`，因为它先得过 atomos-api 的会话校验，校验通过后头会被**重写**而非透传。

这才闭环了"Agent 不接收身份参数"的设计：模型的工具参数里出现 `user_id` 会被保留字拦截（第1篇），客户端请求里的身份头会被网关重写——**身份从两个方向都被封死了，只剩服务端会话这一条真源**。

## 三、计算层：namespace 即租户边界

每个用户一个 Kubernetes namespace：

```
User researcher → namespace researcher-xxxx
  ├── Project A: PVC-A + Shell deployment + ServiceAccount
  └── Project B: PVC-B + ...
User scientist  → namespace scientist-xxxx
  └── ...
```

**namespace 是 Kubernetes 原生的软隔离边界**：ResourceQuota、NetworkPolicy、RBAC 都可以按 namespace 挂。AtomOS 在此之上：

- **Project 再切一层**：每个 Project 独立 PVC（`/workspace` 读写挂载）和 runtime，Project 之间文件互不可见
- **执行层（ExecutionJob CRD）也在 namespace 里**：槽位 Lease、worker Job 全部按 namespace 隔离——第 4 篇讲的并发槽，天然就是"每用户各自的池子"
- **Shell 空闲缩容**：30 分钟不用缩到 0，首次请求自动唤醒——隔离边界不增加常驻成本

`atomos-lifecycle`（Go/Kubebuilder）负责这套的自动化：用户创建时建 namespace + RBAC，删除时全量回收。

## 四、数据层：RLS + 复合外键

数据库不依赖"查询都写了 WHERE user_id"这种君子协定：

**RLS（Row Level Security）**：PostgreSQL 行级安全策略——连接以特定角色执行时，**表级别的策略自动限定可见行**。应用代码忘了加 WHERE 也漏不了别人的数据，因为数据库自己就把不符合策略的行滤掉了。

**复合外键**：比如 `(project_id, id)` 形态的复合键——一个 Project 的子记录（session、job、memory……）**在键结构上就拴死了所属 Project**。跨 Project 的 JOIN 在外键层面就不可能"接错线"。

两层配合：RLS 管"读不到别人的"，复合外键管"写不进别人的"。

## 五、为什么本地开发也要真隔离

这是最反直觉、也最值得想通的一点。共享一套假环境的问题：

1. **隔离 bug 在本地埋下、到生产才炸**：RLS 策略没配对、namespace 名拼错、"反正本地用 admin"——这些问题在真隔离的本地环境**第一次运行就暴露**
2. **双用户验收需要真实拓扑**：AtomOS 的 E2E（`make dev-app-e2e`）明确覆盖"双用户隔离"——两个真实用户、两个 namespace、验证互不可见。假环境根本演不了这个剧本
3. **心智成本**：开发者天天在真隔离环境里工作，对"哪些数据属于谁"的敏感度完全不同

代价是本地环境更重（K3s + 多服务）。AtomOS 的选择是把重量前置到开发期，换取"隔离正确性从一开始就被验证"。

## 六、前端视角：隔离在 UI 上的投影

隔离架构对前端不是透明的：

- **会话与 cookie**：前端所有请求同源（经 atomos-api），身份由 cookie 承载——`api.ts` 的注释明确写着 "All URLs are same-origin"
- **403 的语义**：跨 Project 访问资源会收到 403，前端要把它渲染成"无权访问"而不是"不存在"——泄露资源存在性也是信息泄露
- **管理员的边界**：`X-AtomOS-Admin` 头让 Admin 能看到更多，但 Admin UI 的能力边界要跟后端策略对齐——前端不能"假装"给了管理员权限

## 七、总结

1. **三道防线**：身份头注入（Go 网关）、namespace 隔离（K8s 原生）、RLS + 复合外键（数据库）——纵深防御
2. **身份只有一条真源**：服务端会话 → 注入头；模型参数和客户端输入两个方向都被封死
3. **namespace 即租户**，Project 再切 PVC——执行、存储、网络全部按隔离边界部署
4. **本地 = 生产拓扑**：隔离 bug 在开发期暴露，双用户 E2E 有真实舞台
5. **前端同源 + 403 语义**：隔离的体验细节也属地化

一句话：**多租户隔离不是部署时才开启的开关，是从身份注入到数据库外键贯穿始终的架构属性——连本地开发都不例外。**
