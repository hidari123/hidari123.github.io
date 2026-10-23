/**
 * 回归护栏：代码块按钮不许成倍出现
 *
 * 这个 bug 之前一直查不出来，因为它在 React 的虚拟 DOM 里是「正确」的：
 * 探针实测 explain == wrapper == copy，一个按钮。
 * 多出来的那一个是**浏览器 HTML 解析器**造的——
 * `<pre>` 里面塞了块级元素，容错解析会闭合外层再开一个新的。
 *
 * 所以：
 *   - React DevTools 看：正常
 *   - 单元测试看：正常（jsdom 不做容错修正，容错发生在 HTML 解析阶段）
 *   - 真实浏览器看：两个「解释」叠在一起
 *
 * jsdom 不复现这个差异，但「pre 数量 == 代码块数量」这个结构不变式
 * 在两边都成立，且正是它被破坏的那一刻引入了 bug。
 * 断言这个不变式，就能在结构坏掉的第一时间拦住，
 * 而不是等上线以后靠肉眼发现。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

vi.mock("@/hooks/useAIProvider", () => ({
  useAIProvider: () => ({
    checkConfig: () => false,
    getCurrentConfig: () => ({ apiKey: "" }),
  }),
}));

vi.mock("@/utils/prismHighlight", () => ({
  highlightCode: async () => null,
}));

import { MarkdownCode, MarkdownPre } from "../MarkdownCode";

/** 和 BlogPost.tsx 里的渲染方式保持一致，改动必须同步 */
const renderMarkdown = (md: string) =>
  render(
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{ code: MarkdownCode, pre: MarkdownPre }}
      >
        {md}
      </ReactMarkdown>
    </div>,
  );

const MD = [
  "# 标题",
  "",
  "```ts",
  "const a: number = 1;",
  "const b = `x${a}`;",
  "```",
  "",
  "中间夹一句 `inline`，再一个块：",
  "",
  "```python",
  "def f():",
  "    return 1",
  "```",
  "",
  "> 引用里的 ``` 也要能正常渲染",
].join("\n");

describe("MarkdownCode 结构不变式", () => {
  afterEach(() => cleanup());

  it("每个代码块只有一个 pre（不允许嵌套 pre 造成解析器拆分）", () => {
    const { container } = renderMarkdown(MD);
    const wrappers = container.querySelectorAll(".code-block-wrapper");
    const pres = container.querySelectorAll("pre");

    expect(wrappers.length).toBe(2);
    // 关键断言：改之前这里是 4（每个代码块被拆成两个 pre）
    expect(pres.length).toBe(wrappers.length);
  });

  it("复制按钮和解释按钮各一个，且数量等于代码块数", () => {
    const { container } = renderMarkdown(MD);
    const wrappers = container.querySelectorAll(".code-block-wrapper").length;

    expect(container.querySelectorAll(".copy-button").length).toBe(wrappers);
    expect(container.querySelectorAll(".ai-explain-button").length).toBe(wrappers);
  });

  it("code-block-wrapper 不再是 pre 的子节点", () => {
    const { container } = renderMarkdown(MD);
    container.querySelectorAll(".code-block-wrapper").forEach((wrapper) => {
      expect(wrapper.parentElement?.tagName.toLowerCase()).not.toBe("pre");
    });
  });

  it("行内代码不受影响，仍是裸 <code>", () => {
    const { container } = renderMarkdown(MD);
    const inline = container.querySelector("p > code");
    expect(inline).not.toBeNull();
    expect(inline?.textContent).toBe("inline");
    expect(container.querySelectorAll(".code-block-wrapper").length).toBe(2);
  });

  it("代码块内只保留一层 pre > code，语言类名还在", () => {
    const { container } = renderMarkdown(MD);
    const wrapper = container.querySelector(".code-block-wrapper");
    const nestedPre = wrapper?.querySelectorAll("pre");
    expect(nestedPre?.length).toBe(1);
    expect(wrapper?.querySelector("pre > code.language-ts")).not.toBeNull();
    expect(wrapper?.querySelector("pre > code.language-python")).toBeNull();
  });

  /*
    回归测试：控件抢位。

    线上现象是 hover 代码块时右上角出现一块说不清形状的深灰东西，
    不知道背后叠了几个按钮。实测根因不是重复渲染，而是三个控件各自
    position:absolute + 靠 right 反推位置，互不知情：

      .code-lang         right 0        → 96×28
      .copy-button       right 5rem     → 32×27
      .ai-explain-button right 2.5rem   → 60×31

    三个 z-index 都是 1，平局靠 DOM 顺序，而 ai-explain-button 排在最后
    → 它盖住了前两个（交叠 1142 / 544 / 326 px²）。

    jsdom 不做布局，给不出真实坐标，但**结构**可以钉死：
    三个控件必须处在同一条 flex 工具条里，而不是各自绝对定位。
    这条测试的价值在于：谁再把按钮改回 position:absolute，这里就红。
  */
  it("代码块操作控件都在工具条内，不再各自绝对定位", () => {
    const { container } = renderMarkdown(MD);
    const wrapper = container.querySelector(".code-block-wrapper");
    expect(wrapper).not.toBeNull();

    const toolbar = wrapper?.querySelector(".code-toolbar");
    expect(toolbar).not.toBeNull();

    // 三个控件全部住在工具条里
    expect(toolbar?.querySelector(".code-lang")).not.toBeNull();
    expect(toolbar?.querySelector(".copy-button")).not.toBeNull();
    expect(toolbar?.querySelector(".ai-explain-button")).not.toBeNull();

    // 每个代码块有且只有一个工具条、一个按钮组
    expect(wrapper?.querySelectorAll(".code-toolbar").length).toBe(1);
    expect(wrapper?.querySelectorAll(".code-actions").length).toBe(1);
    // 每个按钮组里两个按钮各一个
    const actions = wrapper?.querySelector(".code-actions");
    expect(actions?.querySelectorAll(".copy-button").length).toBe(1);
    expect(actions?.querySelectorAll(".ai-explain-button").length).toBe(1);
  });

  it("工具条在 pre 之前：按钮不再压在代码文字上", () => {
    const { container } = renderMarkdown(MD);
    const wrapper = container.querySelector(".code-block-wrapper");
    const children = [...(wrapper?.children ?? [])];
    const toolbarIdx = children.findIndex((c) => c.classList.contains("code-toolbar"));
    const preIdx = children.findIndex((c) => c.tagName.toLowerCase() === "pre");
    expect(toolbarIdx).toBeGreaterThanOrEqual(0);
    expect(preIdx).toBeGreaterThanOrEqual(0);
    expect(toolbarIdx).toBeLessThan(preIdx);
  });
});