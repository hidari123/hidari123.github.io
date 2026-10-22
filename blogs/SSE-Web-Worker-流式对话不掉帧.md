---
title: "把 SSE 塞进 Web Worker：流式对话不掉帧的完整方案"
date: "2026-08-11"
tags: ["Web Worker", "SSE", "流式渲染", "性能优化", "AI", "架构设计"]
cover: ""
description: "AI Agent 时代，流式 token 增量渲染会持续压迫主线程。本文从真实项目出发，把 SSE 连接搬进 Web Worker，附带事件协议设计、取消机制与错误处理的完整实现。"
---

# 把 SSE 塞进 Web Worker：流式对话不掉帧的完整方案

做 AI 应用的前端，几乎第一天就会撞上这个问题：**流式输出**。

LLM 的响应是一个字一个字蹦出来的。你要做的是把它们接起来，边收边渲染。但当 token 流持续几十秒、输出上千字时，主线程开始出现你能明确感知到的卡顿——滚动发涩、输入框掉帧、动画断断续续。

更糟的是，如果解析逻辑写得重一点（比如每收到一个 chunk 就做一次 JSON.parse + 大量 React state 更新 + Markdown 重渲染），掉帧会稳定复现。

这篇文章记录我在 ScholarClub（一个 AI 学术研究平台）里的解决方案：**把整条 SSE 连接搬进 Web Worker**。

## 一、先定位问题：为什么会卡

在动手之前，值得先搞清楚卡顿的真正来源。大多数人第一反应是"渲染太重"，但实际上有三个叠加的问题：

**1. 网络回调在主线程上高频触发**

SSE 的 `onmessage` 每次触发都要跑主线程任务。一个 token 大约 3-10 个字符，一段 800 字的回答意味着上百次回调。如果每个回调耗时 2ms，主线程就被占掉 200-300ms——足以让交互明显掉帧。

**2. 每个 token 触发一次 React 重渲染**

如果直接在 `onmessage` 里 `setState`，那么一次回答会产生上百次渲染。对于 Markdown 内容（需要重新解析、需要 KaTeX 渲染公式、需要代码高亮），单次渲染成本并不低。

**3. SSE 的取消机制天生依赖主线程**

这是最容易被忽略的一点。原生 `EventSource` 的 `close()` 必须在**持有它的那个线程**上调用。如果连接建在主线程，用户点击"停止生成"时，主线程还要先去处理这个事件——如果此时主线程正忙，用户的点击会有明显的响应延迟。

**Worker 方案能一次性解决这三点**：网络回调、JSON 解析都在 Worker 线程完成；主线程只负责接收"已经整理好的数据"并批量渲染；取消通过 `postMessage('cancel')` 发出，Worker 收到后立刻 `close()`，不占用主线程时间。

## 二、原生 EventSource 的硬限制

在写 Worker 之前，先要绕过一个限制。

**原生 `EventSource` 不支持设置请求头。**

它的构造函数签名是 `new EventSource(url)`，仅此而已。没有第二个参数可以传 `headers`。而绝大多数需要鉴权的 API 都要求：

```
Authorization: Bearer <token>
```

这意味着你没法直接把 token 塞进去。三个常见变通方案：

| 方案 | 问题 |
|---|---|
| token 拼在 URL query 里 | 会被写进服务端访问日志、浏览器历史、Referer 头 |
| cookie 鉴权 | 服务端要支持 CORS credentials，跨域场景麻烦 |
| `event-source-polyfill` | ✅ 保留了 EventSource API，但支持 fetch 语义和 headers |

我用的是第三个：

```bash
npm install event-source-polyfill
```

它的 API 和原生几乎一致，只是多了 `headers` 支持选项。**关键是代码里要 import 这个 polyfill 而不是用全局 `EventSource`**，否则 polyfill 根本不生效——这个坑我踩过。

## 三、Worker 的完整实现

核心文件是 `chatWorker.ts`。注意开头这个：

```typescript
import { EventSourcePolyfill } from 'event-source-polyfill';
```

必须显式 import，polyfill 不会自动替换全局对象。

```typescript
import { EventSourcePolyfill } from 'event-source-polyfill';

interface ApiParamsType {
  [key: string]: string | boolean | undefined;
}

interface WorkerParams {
  url: string;          // 接口 URL
  params: ApiParamsType; // 查询参数
  token: string | null;  // 鉴权 token
}

let currentEventSource: EventSourcePolyfill | null = null;

self.onmessage = (event: MessageEvent) => {
  const { url, params, token } = event.data as WorkerParams;

  // 处理取消请求
  if (event.data === 'cancel') {
    if (currentEventSource) {
      currentEventSource.close();
      currentEventSource = null;
      self.postMessage({ type: 'cancelled' });
    }
    return;
  }

  // 构造 URL 并追加查询参数
  const apiUrl = new URL(url, self.location.origin);
  Object.keys(params).forEach((key) => {
    if (params[key] !== undefined) {
      apiUrl.searchParams.append(key, String(params[key]));
    }
  });

  // 设置请求头
  const headers: { [name: string]: string } = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // 关闭已存在的连接，保证同一时间只有一条流
  if (currentEventSource) {
    currentEventSource.close();
  }

  currentEventSource = new EventSourcePolyfill(apiUrl.toString(), { headers });

  currentEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // 业务错误检测：服务端把错误信息放在数组首元素
      if (Array.isArray(data) && data.length > 0) {
        const firstItem = data[0];
        if (
          typeof firstItem === 'string' &&
          (firstItem === 'Budget has been exceeded!' ||
            firstItem.includes('Budget has been exceeded'))
        ) {
          self.postMessage({
            type: 'error',
            data: { code: 402, message: 'Budget has been exceeded!' },
          });
          currentEventSource?.close();
          currentEventSource = null;
          return;
        }
      }

      // 正常数据转发给主线程
      self.postMessage({ type: 'message', data });
    } catch (error) {
      console.error('Failed to parse event data', error);
    }
  };

  currentEventSource.onerror = (error) => {
    if (currentEventSource && 'status' in currentEventSource) {
      const es = currentEventSource as any;
      if (es.status === 402) {
        self.postMessage({
          type: 'error',
          data: {
            code: 402,
            message: 'Budget has been exceeded!',
            status: es.status,
          },
        });
      } else {
        self.postMessage({ type: 'error', error });
      }
    } else {
      self.postMessage({ type: 'error', error });
    }
    currentEventSource?.close();
    currentEventSource = null;
  };
};

// Worker 环境没有 export default，必须导出 null 占位
export default null as any;
```

最后那行 `export default null as any` 是必需的——Vite 用 ES module 方式加载 Worker 文件，如果文件没有任何导出，编译会报错。

## 四、主线程侧：Worker 的封装

直接把 Worker 裸露在业务代码里很快就不可维护了。我做了一层薄封装，把 `postMessage` / `onmessage` 的细节收进去，并返回一个**取消函数**：

```typescript
import Worker from './chatWorker.ts?worker';
import { getToken } from '@/store/tokenStore';

export const getChatPdfResponseApi = (
  params: ChatHistoryApiParamsType,
  onMessage: (data: MyObjectType | ['DONE']) => void,
  onError?: (error: Event) => void,
): (() => void) => {
  const token = getToken();
  const worker = new Worker();

  worker.postMessage({
    url: '/api/v2/paperinsight/get_chat_answer',
    params: {
      chat_id: params.chat_id,
      dialog_id: params.dialog_id,
      dialog_source: params.dialog_source ?? 0,
      chat_query: params.chat_query,
      selected_text: params.selected_text,
      stream: params.stream,
    },
    token,
  });

  worker.onmessage = (event: MessageEvent) => {
    const { type, data } = event.data;
    if (type === 'message') {
      onMessage(data);
    } else if (type === 'error' && onError) {
      onError(data);
    }
  };

  // 返回取消函数
  return () => {
    worker.postMessage('cancel');
  };
};
```

调用方拿到的就是一个干净的接口：

```typescript
const cancel = getChatPdfResponseApi(
  { chat_id, chat_query, dialog_source: 0, dialog_id, stream: true },
  (data) => setMessages((prev) => [...prev, data]),
  (err) => setError(err.message),
);

// 用户点击"停止生成"
cancelButton.onclick = cancel;
```

注意 `import Worker from './chatWorker.ts?worker'` 这个 `?worker` 后缀——这是 Vite 的语法糖，会自动处理 worker 的打包和 base path。

## 五、两个值得单独说的设计细节

### 5.1 SSE 无法自定义错误状态码

SSE 协议只定义了 `event`、`data`、`id`、`retry` 四种字段，**没有错误状态码的位置**。HTTP 200 之后的流里，没法告诉你"这一条数据代表的是错误还是正常内容"。

我们后端当时的做法是把错误信息塞进数据里：

```json
["Budget has been exceeded!", ...]
```

这是个 hack，但业界很常见。Worker 里对应的处理就是：拿到数据先看数组首元素是不是那个错误字符串，是就转成 error 事件。

**如果你的后端可以改，更好的方案是在流结束时发一个约定字段**，比如 `{"type": "done"}` 或 `{"type": "error", "code": 402}`。这样协议是自描述的，不需要靠字符串匹配去猜。

### 5.2 `getToken()` 在主线程读，token 不进 URL

注意封装代码里 token 是通过 `postMessage` 单独传的，没有拼进 URL：

```typescript
worker.postMessage({
  url: '/api/v2/paperinsight/get_chat_answer',
  params: { ... },     // 只有业务参数
  token,               // 鉴权信息单独走 message
});
```

这样 Worker 内部构造 URL 时，token 只进 header，不进 query string。

## 六、配套：开发环境下的 SSE 代理配置

如果你在 Vite 开发环境下直连后端，代理一定要**禁用缓冲**，否则流式会被代理攒着一次性吐出来，等于没有流式：

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://your-backend',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, '/v1'),
      configure: (proxy) => {
        proxy.on('proxyRes', (proxyRes) => {
          if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
            proxyRes.headers['cache-control'] = 'no-cache';
            // 关键：告诉 nginx 类代理不要缓冲
            proxyRes.headers['x-accel-buffering'] = 'no';
          }
        });
      },
    },
  },
}
```

`x-accel-buffering: no` 是给 nginx 用的。如果你的生产环境前面有 nginx，**没有这一行，流式会被缓冲成一次性返回**。这是自建部署最常见的"流式不流式"故障原因。

## 七、这套方案的收益与边界

**收益：**

- 主线程只处理"整理好的数据"，网络解析开销归零
- 取消操作不占用主线程时间
- 单例约束清晰：Worker 里 `currentEventSource` 保证同一时刻只有一条活跃连接
- Worker 崩溃不会带崩整个页面

**边界，要诚实说清楚：**

- `postMessage` 本身有结构化克隆的开销。如果每个 chunk 只有几十字节，主线程侧 `postMessage` 的开销可能接近你省下来的部分。**收益主要来自"解析逻辑重"和"回调密集"的场景**——比如需要 JSON.parse、需要复杂转换逻辑时。纯文本流、chunk 很大的情况下，收益有限。
- Worker 不能访问 DOM。需要在 DOM 上做操作（比如滚动到底部、获取容器尺寸）必须回到主线程。
- 调试比普通代码麻烦一层，DevTools 的 Sources 面板里可以单独打开 Worker 上下文。

## 八、什么时候你不需要这套方案

不是所有流式场景都值得上 Worker。判断标准：

| 场景 | 是否需要 Worker |
|---|---|
| chunk 较大（>1KB），回调次数少 | ❌ 主线程直接处理即可 |
| 每 chunk 只需 `appendChild`，无重解析 | ❌ 直接处理反而更简单 |
| 每 chunk 需要 JSON.parse + 复杂转换 | ✅ |
| 需要频繁取消 / 重连 | ✅ |
| Markdown / 代码高亮 / 公式渲染，逐 token 更新 | ✅ |
| 多个对话窗口同时流式 | ✅ 天然隔离 |

**判断的简化版本：如果你的流式渲染只是往一个 `<div>` 末尾追加纯文本，不要上 Worker。如果你每收到一个 token 就要更新 React state 并重新解析内容，上。**

## 结语

流式输出看起来是"网络问题"，实际上它同时是**并发问题**（回调密集）、**渲染问题**（高频 setState）和**生命周期问题**（取消/重连）。把连接放进 Worker，是把这三类问题一次性隔离出去的最直接手段。

它的实现成本并不高——一个文件，二百来行——但它解决的问题 quite 硬核。这也是我在 ScholarClub 里做过最有"投入产出比"的一个前端优化。