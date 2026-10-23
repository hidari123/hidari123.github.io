/**
 * 目录提取的回归测试
 *
 * 这组用例对应一个真实 bug：原来 extractToc 直接对整篇 markdown 做
 * /^(#{1,3})\s+/ 匹配，代码块里的 shell 注释被当成章节，
 * 35 篇文章里一共产出 20 条点不动的死链。
 */

import { describe, it, expect } from "vitest";
import { extractToc, toPlainText } from "../toc";

describe("extractToc", () => {
  it("提取标题并按层级输出", () => {
    const md = ["# 标题一", "内容", "## 标题二", "内容", "### 标题三"].join("\n");
    const toc = extractToc(md);

    expect(toc).toHaveLength(3);
    expect(toc.map((t) => t.level)).toEqual([1, 2, 3]);
    expect(toc[0].text).toBe("标题一");
  });

  it("忽略代码块里的 # 注释（真实 bug 的回归用例）", () => {
    const md = [
      "# 真实的标题",
      "```bash",
      "# 这是 shell 注释，不是章节",
      "## 同样是注释",
      "```",
      "## 真实的二级标题",
    ].join("\n");

    const toc = extractToc(md);
    expect(toc.map((t) => t.text)).toEqual(["真实的标题", "真实的二级标题"]);
  });

  it("忽略波浪线围栏", () => {
    const md = ["# A", "~~~", "# fake", "~~~", "## B"].join("\n");
    expect(extractToc(md).map((t) => t.text)).toEqual(["A", "B"]);
  });

  it("代码块未闭合时也不产出假标题（宁可全漏不可错出）", () => {
    const md = ["# 真标题", "```js", "# 注释"].join("\n");
    expect(extractToc(md).map((t) => t.text)).toEqual(["真标题"]);
  });

  it("id 遵循 github-slugger 规则，与 rehype-slug 对得上", () => {
    const toc = extractToc("# Hello World\n## 你好，世界\n## API 限流设计");

    expect(toc[0].id).toBe("hello-world");
    // 标点直接删除，中文保留 —— 不额外插连字符
    expect(toc[1].id).toBe("你好世界");
    expect(toc[2].id).toBe("api-限流设计");
  });

  it("重名标题自动去重，和 rehype-slug 行为一致", () => {
    const toc = extractToc("## 概述\n## 概述\n## 概述");

    expect(toc.map((t) => t.id)).toEqual(["概述", "概述-1", "概述-2"]);
  });

  it("每次调用都从干净的 slugger 开始，编号不会跨文章漂移", () => {
    const first = extractToc("## 概述\n## 概述");
    const second = extractToc("## 概述\n## 概述");

    expect(first.map((t) => t.id)).toEqual(second.map((t) => t.id));
  });

  it("去掉行内标记，目录显示纯文本", () => {
    const toc = extractToc("## **加粗**标题\n## `code` 与 [链接](https://x.com)");

    expect(toc[0].text).toBe("加粗标题");
    expect(toc[1].text).toBe("code 与 链接");
  });

  it("丢弃 h4 及更深层级", () => {
    const toc = extractToc("# a\n## b\n### c\n#### d\n##### e");
    expect(toc.map((t) => t.level)).toEqual([1, 2, 3]);
  });

  it("去掉标题尾部的手写闭合井号", () => {
    expect(extractToc("## 标题 ##")[0].text).toBe("标题");
  });

  it("空内容返回空数组", () => {
    expect(extractToc("")).toEqual([]);
    expect(extractToc("纯文本没有标题")).toEqual([]);
  });
});

describe("toPlainText", () => {
  it("剥离标记后仍保留代码块内的内容语义之外的可读文本", () => {
    const text = toPlainText("# 标题\n\n正文有 **加粗** 和 `代码`。\n\n```js\nconst a = 1;\n```");

    expect(text).not.toContain("```");
    expect(text).toContain("正文有 加粗 和 代码。");
  });

  it("图片 alt 转成文字而不是整段丢弃", () => {
    expect(toPlainText("![架构图](a.png) 说明")).toContain("架构图");
  });
});