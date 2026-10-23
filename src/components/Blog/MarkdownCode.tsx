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
 */

import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

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