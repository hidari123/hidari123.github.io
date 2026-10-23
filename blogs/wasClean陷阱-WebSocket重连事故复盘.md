---
title: "wasClean 陷阱：一次滚动重启让聊天永久卡死"
date: "2026-09-25"
tags: [前端工程, AI Agent, React, WebSocket]
cover: ""
description: "e.wasClean 为 true 就不重连——这个看似合理的判断，让聊天界面在服务端滚动重启后永久卡死，而且没有任何报错。本文完整复盘这次事故的根因、修复原则，以及重连链条上三个反直觉的坑。"
---

# wasClean 陷阱：一次滚动重启让聊天永久卡死

这是 AtomOS 前端我印象最深的一次事故复盘。症状、根因、修复都很干净，值得完整写下来。

## 一、症状：没有报错的死界面

服务端发版，agent-server 滚动重启。用户正开着聊天页面，之后：

- 界面没有任何错误提示
- 状态栏还是"已连接"
- 发消息，输入框正常清空
- **但永远没有回复**

刷新页面，一切恢复。

## 二、根因：一个看似合理的判断

问题出在 WebSocket 的关闭处理上。最初的代码是这样的：

```typescript
ws.onclose = (e) => {
  if (e.wasClean) return;  // 正常关闭，不用重连
  // ... 重连逻辑
};
```

逻辑看起来无懈可击：`wasClean` 为 true 表示连接经过完整的关闭握手，是"正常关闭"，那就不用重连。异常关闭（网络断、超时）才需要重连。

**但这个理解是错的。**

`wasClean` 只说明**关闭过程是否完成了协议握手**，不说明**这次关闭是不是用户或代码主动发起的**。服务端滚动重启时的流程是：

1. 新 Pod 就绪
2. 旧 Pod 优雅关闭：发 WebSocket Close 帧，完成握手，然后退出
3. 客户端收到 CloseEvent：`code=1000`（正常关闭码），`wasClean=true`
4. 前端：正常关闭 → 不重连
5. 旧 Pod 已经没了，新 Pod 在跑，**但客户端连的还是那个已经死掉的连接对象**

更糟的是 `send()` 对已关闭的 socket 是静默失败——不抛错、不提示。于是用户发消息，消息进了死管道，界面毫无反应。

## 三、修复原则：永远重连

修复后的代码里有一段注释，把整个决策讲透了：

```typescript
// ALWAYS reconnect — there is no useful "clean close" case here. The
// only deliberate close we issue is via the effect's cleanup, which
// already sets `cancelled = true` above. Any other close (pod roll,
// server graceful shutdown, idle disconnect, network drop) should
// trigger the reconnect chain. The prior `if (e.wasClean) return`
// left the chat permanently stuck on agent-server rolling restarts:
// wasClean=true, no reconnect, send() silently failed against the
// dead socket while the UI showed no problem.
```

推理链是：

1. **代码里唯一合法的"不重连"场景**是组件卸载（effect cleanup），而那条路径已经用 `cancelled = true` 标记了
2. 除此之外的**任何**关闭——Pod 滚动、服务优雅关闭、空闲断开、网络故障——都应该重连
3. 既然"合法不重连"已经有专门的开关，`wasClean` 就没有存在的价值

这就是那条原则：**在长连接场景里，不要试图从关闭事件里推断"该不该重连"，而应该问"这次关闭是不是我们自己发起的"**。前者不可靠（协议无法区分服务端优雅关闭和客户端主动关闭），后者是确定性的。

## 四、坑一：过期 socket 的迟到 onclose

改成"永远重连"后，马上撞上第二个坑。

重连意味着会创建**新的 socket**。但旧 socket 的 `onclose` 可能**迟到**——在新连接建立之后才触发。如果不加防护，一次关闭会触发两条重连链，它们各自再开新 socket……连接数指数增长。

解法是一个守卫：

```typescript
ws.onclose = () => {
  if (cancelled) return;
  // Ignore a superseded socket's late close — only the current socket
  // drives reconnect, so a stale onclose can't start a parallel chain.
  if (wsRef.current !== ws) return;
  // ... 触发重连
};
```

`wsRef.current !== ws`：**只有"当前持有的那个 socket"的关闭事件才有权触发重连**。被替换掉的旧 socket 无论什么时候关闭、触发什么回调，都直接忽略。

## 五、坑二：重连之后的账要对不上

连接恢复了，但数据有缺口——断线期间发生的事件，新连接看不到。

这里有两个具体问题：

**问题 1：断线发生在回复中途，新连接只能流到回复的尾巴。**

解法是一个标记位：

```typescript
// A reconnect mid-turn means the new socket only streams the tail of the
// reply, so refetch once on the next text_done to get the full durable text.
let needsRefetchOnDone = false;
```

重连时把它置 true，等下一次 `text_done`（本轮回复彻底结束）时，重新拉一次全量历史。为什么不重连后立刻拉？因为**立即拉会拿到中间状态，而回复还在继续**，等于把一个会变的数据固化了。

**问题 2：断线期间那一轮对话可能已经结束了。**

客户端再也不会收到 `text_done`，composer 会永远处于"忙碌"状态，用户没法发下一条消息。所以在重连的收尾处补一个兜底：

```typescript
// Re-enable the composer: a turn that finished while we were
// disconnected won't deliver a text_done to re-enable it.
if (!cancelled) setBusy(false);
```

而重拉的历史通过上一篇文章讲的**幂等 reducer** 合并进来——重复的事件被 seq 去重，正在流的增量原样保留。两个设计在这里咬合：没有幂等归约，"重连后重拉历史"就不敢做，因为会制造重复条目。

## 六、坑三：退避要有上限

```typescript
const delay = Math.min(1000 * 2 ** attempts, 15000);
attempts += 1;
```

指数退避：1s、2s、4s……封顶 15s。服务端长时间不可用时避免重连风暴，服务端恢复后最多等 15 秒就能接上。`onopen` 时 `attempts = 0` 归零。

## 七、复盘清单

这次事故沉淀下来的规则，适用于任何 WebSocket 长连接前端：

1. **`wasClean` 不可作为"不重连"的依据**。唯一合法的不重连是组件卸载，用显式标记（`cancelled`）实现
2. **只有当前 socket 能驱动重连**。被替换的 socket 的迟到回调必须忽略，否则并行重连链
3. **重连后要考虑数据缺口**。中途重连只看到尾巴，等 turn 结束再拉全量；掉线期间 turn 可能已结束，忙碌状态要手动复位
4. **退避封顶**。`min(2^n, cap)` 一行解决
5. **重拉历史的前提是幂等归约**。没有事件级去重，任何"再拉一次"都是危险操作

最疼的一点其实是：**这个 bug 在开发环境几乎无法复现**。本地 dev 很少滚动重启，只有部署节奏上来之后，"每次发版聊天就死"的规律才浮现。而日志里什么都没有——静默失败比报错可怕得多。
