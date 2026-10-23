---
title: "顶部崩溃页的最后一道防线：一个 ErrorBoundary 的自我约束"
date: "2026-10-01"
tags: [前端工程, React]
cover: ""
description: "一个 40 行的 ErrorBoundary 为什么值得单独讲？因为它是应用里唯一一个'所有依赖都可能已经失效'的组件。AtomOS 的实现里藏着一条关键决策：这个组件禁止使用 i18n。"
---

# 顶部崩溃页的最后一道防线：一个 ErrorBoundary 的自我约束

ErrorBoundary 是前端最熟悉的模式：

```tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

教科书式的写法。AtomOS 的实现也是这个模式，但**它的注释里藏着一条违反常规的硬约束**：

```typescript
/**
 * Top-level crash boundary. Anything a component throws during render leaves
 * the app a blank white page without this; instead we show a centered card
 * with the error and a reload button.
 *
 * Text is hardcoded bilingual (zh/en) like App.tsx's unreachable-server card:
 * the crash may have taken i18n itself down, so we don't depend on it.
 */
```

**这个组件禁止使用 i18n。** 这是整段代码最值得学的地方。

## 一、依赖失效的递归困境

想象一个朴素实现：

```tsx
// 反例：直觉写法
function ErrorBoundary({ children }: { children: ReactNode }) {
  const [error, setError] = useState<Error | null>(null);
  const { t } = useTranslation("common");
  if (error) return <div>{t("error.somethingWrong")}</div>;
  return <>{children}</>;
}
```

看起来完全正常。但如果崩溃的根因是 i18n 本身呢？

```
i18next 初始化失败
  → App 渲染抛错
  → ErrorBoundary 捕获
  → 渲染错误页
  → useTranslation("common") 又抛错（i18n 没初始化好）
  → 错误页自己崩了
  → 边界已经捕获了错误，进入"已崩溃"状态，无法再捕获
  → 白屏
```

**用 React 类组件时 `getDerivedStateFromError` 也会再抛**——最终退化成 React 自己的默认错误处理（整页白屏加控制台堆栈）。

更隐蔽的版本：i18n 初始化了，但某个 translation chunk 加载失败、或者某次 `changeLanguage` 抛错——**同一个坑以不同形态反复出现**。

AtomOS 的注释直接点出这个推理链：

> `the crash may have taken i18n itself down, so we don't depend on it`

**这不是过度设计，是对失败模式的诚实推演。** 崩溃边界是最后一道防线，它的所有依赖都必须假设"可能已经死了"。

## 二、硬编码的双语文案

```tsx
<p className="crash-title">页面出错，请重载 / Something went wrong</p>
<p className="crash-detail">{this.state.error.message || String(this.state.error)}</p>
<button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
  重新加载 / Reload
</button>
```

三行文案，`zh / en` 并排。取舍：

**放弃 i18n 的优雅，换取边界一定渲染得出来。** 在正常的世纪，i18n 是标配；在崩溃的第 0 秒，能显示东西比风格统一重要一万倍。

而且用户**不懂技术**（他们看到的是自己点了几下就白了屏），给他们一段英文错误 + 一个 Reload 按钮，比一段读不懂的翻译有用。

注意 `error.message || String(error)`：**message 可能为空**（自定义错误、不继承 Error 的 throw），`String(error)` 是最后兜底——至少显示 `[object Object]` 或对象的字符串形式。

## 三、类组件不是过时，是有原因的

React 官方从 v16 起推荐 hooks，"函数组件 + hooks" 是现代写法。但错误边界是**唯一一个至今仍然只能用类组件**实现的 React 能力——hooks 没有对应的等价物。

```typescript
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in the console for triage; production reporting can hook here.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
```

这是 React 的 API 设计遗留，hooks 补不上。**ErrorBoundary 是类组件是规范要求，不是技术债。**

（未来 React 的 `use()` + Suspense 可能有更好的方案，但截至今天错误边界仍需类组件。）

## 四、componentDidCatch 里的信息

```typescript
console.error("[ErrorBoundary]", error, info.componentStack);
```

`info.componentStack` 是**组件栈**——React 渲染时组件嵌套的快照：

```
in Chat (at Chat.tsx:120)
in ChatLayout (at ChatLayout.tsx:45)
in App (at App.tsx:88)
```

这是排查的关键信息：知道"在哪个组件树分支崩的"。console 里只有 error message 时，你得手动搜代码；有了组件栈，直接定位。

注释里那句：

> `production reporting can hook here`

**这里是错误上报的接入点**。现在的实现只打 console，但这个 `componentDidCatch` 是天然的埋点位置——接 Sentry、接自建上报、接告警，都在这一行。

如果要做生产环境的错误追踪，ErrorBoundary 的 `componentDidCatch` 就是最小实现面。

## 五、role="alert"：让屏幕阅读器立刻播报

```tsx
<div className="crash-card" role="alert">
```

`role="alert"` 是 ARIA 的"重要消息"角色。屏幕阅读器遇到它会**立刻打断当前播报**，把注意力转到这块内容上。

对于一个崩溃页，这个语义完全正确——**页面全白了，用户可能毫无察觉，需要主动打断**。没有 role="alert" 的崩溃页对视障用户来说是完全静默的失败。

## 六、唯一的恢复手段：reload

```typescript
onClick={() => window.location.reload()}
```

`window.location.reload()` 而不是 React Router 的导航。

理由很实在：**错误边界已经捕获了渲染期异常，React 组件树的状态可能是脏的**。用路由导航试图"软恢复"，可能立刻再次撞上同一个错误（尤其是错误来源是组件的某种状态组合时）。

整页 reload 是**唯一能保证清空所有内存状态**的恢复手段。代价是丢失所有前端状态（未保存的编辑、展开的树），但崩溃页的用户不会在意这个——他们只想让页面能用了。

## 七、为什么只在最外层

```tsx
// main.tsx 大致结构
root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
```

只有一层，在最外。原因：

**ErrorBoundary 只能捕获它自己渲染的子树里抛出的错误**。放到 App 内部，只能捕获 App 的子组件错误——App 自己的渲染错误就漏了。

放在最外层，任何渲染错误都在射程内。虽然这个实现粒度很粗（一个错误边界覆盖整个应用），但**对"应用已经崩了"这个场景，粒度粗是对的**——用户要的是恢复，不是精确的错误隔离。

精细的错误边界（每个列表项一个、每张卡片一个）解决的是"局部失败不该拖垮全局"，那是另一个模式，需要在业务组件里按需添加。顶层这个只管"整体崩了"。

## 八、总结

1. **崩溃边界的所有依赖都可能已失效**——所以禁用 i18n
2. **硬编码双语文案**：放弃优雅，换取边界一定渲染得出来
3. **类组件是规范要求**：hooks 无法实现错误边界
4. **componentDidCatch 是上报接入点**：error + componentStack，天然埋点位置
5. **role="alert"**：崩溃对屏幕阅读器用户必须是显式事件
6. **只提供 reload**：组件树状态已脏，整页刷新是唯一可靠恢复
7. **顶层粗粒度**：整体崩了要的是恢复，不是精确隔离

一句话：**最后一道防线的设计原则是"不依赖任何东西"——它必须在系统最不可靠的时刻，依然能工作。**