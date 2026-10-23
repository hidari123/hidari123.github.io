import { describe, it, expect } from "vitest";

/**
 * 回归测试：代码块「全是白的」这个 bug。
 *
 * 上次的教训：tsc / lint / build / 测试全绿，但页面上就是没颜色。
 * 所以这里验证的是两件运行期才暴露的事：
 *   1. Prism 真的被 import 到了（之前 package.json 有、globals.css 有主题、
 *      但全项目没有一句 import，等于三份死配置）
 *   2. highlight 真的产出了 .token 节点（能生成 token 不等于 CSS 命中）
 */

describe("prismHighlight", () => {
  it("能加载 prism 并为 typescript 代码生成 token 节点", async () => {
    const { highlightCode } = await import("@/utils/prismHighlight");

    const code = `const greet = (name: string): string => \`hello \${name}\`;`;
    const html = await highlightCode(code, "typescript");

    expect(html).not.toBeNull();
    expect(html).toContain("token");
    // 关键字应该被单独切出来
    expect(html).toMatch(/token keyword/);
    console.log("TS 高亮结果:", html);
  });

  it("python 代码能高亮", async () => {
    const { highlightCode } = await import("@/utils/prismHighlight");
    const html = await highlightCode("def f(x):\n    return x + 1", "python");
    expect(html).toMatch(/token/);
  });

  it("bash / json / sql 都能高亮", async () => {
    const { highlightCode } = await import("@/utils/prismHighlight");

    expect(await highlightCode("echo 'hi'", "bash")).toMatch(/token/);
    expect(await highlightCode('{"a": 1}', "json")).toMatch(/token/);
    expect(await highlightCode("SELECT * FROM t;", "sql")).toMatch(/token/);
  });

  it("别名能映射（js -> javascript, py -> python, sh -> bash）", async () => {
    const { highlightCode } = await import("@/utils/prismHighlight");
    expect(await highlightCode("const a = 1;", "js")).toMatch(/token/);
    expect(await highlightCode("print(1)", "py")).toMatch(/token/);
    expect(await highlightCode("ls -la", "sh")).toMatch(/token/);
  });

  it("text/plain 一律返回 null（本来就是纯文本，不需要高亮）", async () => {
    const { highlightCode } = await import("@/utils/prismHighlight");
    expect(await highlightCode("随便什么", "text")).toBeNull();
    expect(await highlightCode("随便什么", "plaintext")).toBeNull();
  });

  it("未注册的语言返回 null 而不是抛错（降级到纯文本）", async () => {
    const { highlightCode } = await import("@/utils/prismHighlight");
    expect(await highlightCode("xxxx", "brainfuck-not-real")).toBeNull();
  });

  it("tsx 能高亮（文章里用得最多的两种之一）", async () => {
    const { highlightCode } = await import("@/utils/prismHighlight");
    const html = await highlightCode(
      `export const A = () => <div className="x">hi</div>;`,
      "tsx",
    );
    expect(html).toMatch(/token/);
  });
});

describe("token 主题选择器", () => {
  it("CSS 里不再有 [data-theme=\"light\"] 选择器", async () => {
    // useTheme 在亮色模式下是 removeAttribute，不是设成 "light"，
    // 所以带 [data-theme="light"] 前缀的规则一条都匹配不上。
    // 那 80 条规则曾经让整个亮色模式下的代码块没有颜色。
    const fs = await import("node:fs");
    const path = await import("node:path");
    const css = fs.readFileSync(
      path.join(process.cwd(), "src/styles/globals.css"),
      "utf8",
    );

    // 只统计真正的规则选择器，注释里提到的不算
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/\[data-theme="light"\]\s+\.token/);
    // 变量方案要存在
    expect(withoutComments).toContain("--tok-keyword");
    expect(withoutComments).toContain("--tok-string");
  });
});