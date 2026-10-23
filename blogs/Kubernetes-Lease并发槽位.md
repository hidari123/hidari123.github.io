---
title: "Kubernetes Lease 做并发槽位：为什么数 Running Job 是竞态"
date: "2026-10-05"
tags: [后端架构, Go, Kubernetes]
cover: ""
description: "限制每用户在途任务数，最直觉的写法是数一数 Running 状态的任务再决定放不放行——但这在并发下是错的。本文讲解 AtomOS 如何用一组固定 Lease 加 CAS 抢占实现构造性有界的并发槽，以及为什么泄漏自愈比完美释放更重要。"
---

# Kubernetes Lease 做并发槽位：为什么数 Running Job 是竞态

AtomOS 的执行层要限制**每个用户同时在跑的任务数**（比如 N=4）。这个需求看起来简单到不值得设计——数一下 Running 状态的 Job，不到 N 就放行，到了就排队。

但调度器代码里有一段注释，直接否决了这个写法：

```go
// Counting "Running" ExecutionJobs instead would be a count-then-write race.
```

一个 count-then-write 竞态。这篇讲清楚它为什么是竞态，以及替代方案。

## 一、数数为什么是错的

想象两个并发请求同时到达：

```
时刻 T0: 请求A 查询 Running 数 → 3（上限 4）
时刻 T1: 请求B 查询 Running 数 → 3（上限 4）
时刻 T2: 请求A 创建 Job    → 现在 4 个
时刻 T3: 请求B 创建 Job    → 现在 5 个，超限
```

两个请求都在"数到 3、判断没满"之后才写入，各自都以为自己没问题。**数和写之间没有原子性**，并发窗口内的判断全部基于过期快照。

你可能会想：加个数据库行锁，或者把"数+写"放进一个事务？可以，但这是把并发控制绑在了一个**外部状态**上——Running 计数会随任务完成、失败、超时不断变化，任何"基于当前状态的判断"都要面对"状态刚变了"的问题。而且这里要控制的不是数据库里的记录数，是 **Kubernetes 集群里真实占用的资源**——真相在集群，不在数据库。

## 二、替代方案：N 个固定的 Lease 槽

AtomOS 的做法是**把"名额"物化成 N 个固定对象**：

```go
const (
    SlotPoolLabel = "execution.atomos.dev/slot-pool"
    SlotPoolValue = "worker"
    SlotFinalizer = "execution.atomos.dev/slot-release"
)

// slotLeaseName is the deterministic name of slot i in a namespace's pool.
func slotLeaseName(i int) string { return fmt.Sprintf("atomos-toolslot-%d", i) }
```

每个用户 namespace 下固定有 N 个 `coordination.k8s.io/Lease` 对象：`atomos-toolslot-0` 到 `atomos-toolslot-3`。

规则：

- Job 创建前，controller 必须**认领一个空闲 slot**（在 Lease 上写上持有者信息）
- 所有 slot 被占满 → 新 Job 排队等待
- Job 终止或被删除 → 释放 slot

并发正确性靠**认领动作本身的原子性**保证——Lease 认领是一次带 `resourceVersion` 的 CAS（Compare-And-Swap）更新：

> a Lease is claimed via resourceVersion CAS (a plain Update), so two concurrent reconciles can't both win the same slot

两个 controller 同时想认领 slot-2？Kubernetes API Server 的乐观并发控制会拒绝后到的那个（`resourceVersion` 冲突），**同一时刻只有一个赢家**。不需要任何锁，原子性是 API Server 替你保证的。

对比一下两种思路的本质区别：

| 方案 | 判断依据 | 并发正确性 |
|---|---|---|
| 数 Running Job | 当前状态快照 | 无——数与写之间有窗口 |
| N 个 Lease 槽 | 对固定对象的抢占结果 | CAS 原子性，构造性有界 |

"数数"是**检查后行动**（check-then-act），"抢槽"是**行动本身即检查**——抢到了就是有名额，没抢到就是满了。后者天然免疫并发。

## 三、泄漏自愈：比完美释放更重要

设计一个"释放"机制很容易，难的是**释放失败之后怎么办**：

- controller 在"认领成功、Job 还没创建"之间崩溃——slot 被占，但没有任何 Job 会去释放它
- Job 的释放代码有 bug、被跳过
- 用户 force-delete 了 ExecutionJob CR，释放路径根本没执行

这些场景都会让 slot **永久泄漏**——池子慢慢被死槽占满，用户再也提交不了任务。而且泄漏是静默的：没有报错，只是"怎么永远在排队"。

AtomOS 的答案不是"把释放写得更完美"，而是**每次认领前先做回收**：

> every claim attempt first reclaims any slot whose holder ExecutionJob is gone or terminal (a missed release, a crash between claim and Job-create, a force-deleted CR all self-heal)

认领流程的第一步：扫描所有 slot，**凡是持有者已经不存在或已终态的，直接回收**。一个 force-deleted 的 CR、一次 controller 崩溃、一段没跑到的释放代码——全都在下一次认领时自愈。

这就是注释里的那句话：

> Leak-proof by reconciliation, NOT only by the happy-path release

**靠调和循环兜底，而不是指望快乐路径上每一步都完美执行。** 这是 Kubernetes 风格的核心思想：控制器的每个动作都应该是可重入的，任何中间状态都会在下一次调和时被修正。

配套细节：finalizer 在**第一次认领之前**就加到 CR 上：

```go
// The finalizer is added BEFORE the first claim so a delete always
// routes through releaseSlot.
```

这样哪怕用户直接删除 CR，Kubernetes 也会因为 finalizer 的存在阻塞删除，直到 controller 走完释放流程。**顺序先于动作**，不是"创建成功后再补 finalizer"——那又是一个 count-then-write 式的窗口。

## 四、诚实的注释：已知缺陷照写不误

这套设计的注释里还列了**明确承认的不足**：

> DEFERRED to a follow-up slice: holding the slot until the worker Pods are *observably* terminated (today released at ExecutionJob terminal phase — a few seconds of over-admission while a Pod drains), epoch fencing + fixed-name-Job-per-slot, and strict FIFO ordering.

三条已知妥协：

1. **释放时机偏早**：Job 到达终态就释放 slot，但 worker Pod 可能还在排空（drain）——这几秒内实际资源占用超过 N。窗口很小，被明确接受
2. **没有 epoch 隔离**：理论上存在旧持有者与新认领者竞争的边界情况
3. **没有严格 FIFO**：排队顺序不保证先来先服务

以及一句自我评估，点出了优先级判断：

> The GC-on-claim above already prevents leaks and slot theft from a live job, which is the load-bearing safety property

**"load-bearing"（承重的）这个措辞很精准**：防泄漏和防活锁是安全底线，必须先做；超额准入几秒钟和排队顺序是体验问题，可以延后。工程不是消除所有缺陷，是把缺陷按危险程度排序。

## 五、为什么一个前端要懂这个

三个理由。

**第一，前端是这些规则的展示层。** Auto 模式的免确认阈值（CPU≤4、内存≤16GiB）放行了，并发上限 N 就是平台层的闸门。用户在前端看到"排队中"，背后就是"所有 slot 已满"——理解槽位机制才能把排队状态、预计等待、失败原因讲清楚。

**第二，这是"把并发问题物化"的通用思想。** 前端一样会遇到 count-then-write：两个组件同时判断"缓存里没有就写入"，就可能在竞态下覆盖彼此。Lease 槽的启示是：**把名额变成固定对象、把判断变成抢占动作**，竞态就消失了。表单的提交按钮防重复点击、乐观锁的 `expected_revision`，都是同构问题。

**第三，"调和兜底"是调试利器。** 理解了"任何中间状态都会被下一次调和修正"，你对系统行为的预期就从"每步都正确"变成"最终会正确"——这直接改变你看日志、查问题的方式。

## 六、总结

1. **count-then-write 是竞态**：数 Running 再放行，并发窗口内判断全部失效
2. **把名额物化成 N 个固定 Lease**，认领即 CAS 抢占，原子性由 API Server 保证，**总量构造性有界**
3. **泄漏靠认领前回收自愈**，不指望快乐路径——crash、force-delete、bug 释放全部覆盖
4. **finalizer 先于首次认领**，保证删除必经释放路径
5. **已知缺陷写进注释并排优先级**：防泄漏是承重墙，准入精度是装修

一句话：**当你发现自己在"先检查再行动"，问一句——能不能把这个检查变成一次原子抢占？**
