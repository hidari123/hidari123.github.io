/**
 * react-markdown 的 code 渲染适配器
 *
 * react-markdown v9 不再传 `inline` 属性（v8 才有）。区分行内代码和代码块的
 * 可靠方式是看 className：围栏代码块会被 mdast 加上 `language-xxx`，行内代码没有。
 *
 * 抽成独立文件而不是在 JSX 里内联，是为了能正常调用 useState/useCallback——
 * 原来那份写法在 `if (!match) return <code>` 之后才调 useEffect，
 * 属于 Hook 调用顺序违规，React 在开发模式下会直接抛警告，
 * 而且行内代码和代码块混排时状态会串。
 *
 * ── 为什么还导出了 MarkdownPre ──
 * 围栏代码块在 mdast 里是 `code` 节点外面套一层 `pre`。
 * 我们只接管了 `code`，于是结构变成：
 *
 *     <pre>                             ← react-markdown 自己发的外壳
 *       <div class="code-block-wrapper">  ← CodeBlock
 *         <pre><code>…</code></pre>      ← CodeBlock 内部自己又有一个
 *       </div>
 *     </pre>
 *
 * `<pre>` 里面不允许再出现块级元素（HTML 内容模型要求 phrasing content）。
 * 浏览器容错解析遇到嵌套 `<pre>` 时，会自动闭合外层再新开一个，
 * 于是真实 DOM 变成：
 *
 *     <pre></pre>                       ← 解析器造出来的空壳
 *     <div class="code-block-wrapper">
 *       <pre><code>…</code></pre>
 *     </div>
 *
 * 实测（渲染全部 36 篇文章）：改之前 pre 数量是代码块数量的整整 2 倍。
 * 那个多出来的空壳和真代码块共享同一段绝对定位坐标系，
 * 两个壳各画一次「复制 / 解释」—— 就是页面上那两个重叠的「解释」。
 *
 * 值得记一笔的是：React 的虚拟 DOM 里其实只有一个按钮
 * （探针实测 explain == wrapper == copy），
 * 多出来的那份是 HTML 解析器造的，不是渲染了两遍。
 * 所以这个 bug 在 React DevTools、单元测试、SSR 里全都看不出来，
 * 只有真实浏览器里才现形——也是为什么之前一直查不出来。
 *
 * 修法：把 `pre` 这一层也接管掉，只透传 children，
 * 让 CodeBlock 内部的 `<pre>` 成为页面里唯一的 pre。
 */

import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

/**
 * 剥掉 react-markdown 发的 pre 外壳，只留下 children。
 *
 * 不能直接把 `<pre>` 换成 `<div>`：CSS 是按 `.markdown-body pre` 选的，
 * 而 CodeBlock 自己已经渲染了一个带相同样式的 `<pre>`。
 * 这里只透传，才是真正的一进一出。
 */
export const MarkdownPre = ({ children }: { children?: ReactNode }) => <>{children}</>;

/** react-markdown 传进来的 children 可能是字符串，也可能是嵌套数组 */
function flattenChildren(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flattenChildren).join("");
  return "";
}

interface MarkdownCodeProps {
  className?: string;
  children?: ReactNode;
}

export const MarkdownCode = ({ className, children }: MarkdownCodeProps) => {
  const match = /language-(\w+)/.exec(className ?? "");
  const text = flattenChildren(children).replace(/\n$/, "");

  // 行内代码：保持最简，只给样式类
  if (!match) {
    return (
      <code className={className}>{children}</code>
    );
  }

  return <CodeBlock code={text} language={match[1]} />;
};