import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TocSidebar } from "@/components/Blog/Toc";
import type { TocItem } from "@/utils/toc";
import { FloatLayer } from "@/components/Common/FloatLayer";

/**
 * 回归测试：上一版目录「完全不显示」的 bug。
 *
 * 之前只用 tsc/lint/build 验证过，全绿，但页面上就是没有目录 ——
 * 静态检查看不出 fixed 定位在运行期被谁改了。
 * 所以这里断言的是「结构」，正是上次漏掉的那一层。
 */

const items: TocItem[] = [
  { id: "a", text: "第一节", level: 2 },
  { id: "b", text: "第二节", level: 2 },
  { id: "c", text: "第三节", level: 3 },
];

describe("FloatLayer", () => {
  it("把子元素渲染到 document.body 下，而不是调用方的容器里", () => {
    const { container } = render(
      <FloatLayer>
        <div data-testid="floater">悬浮层</div>
      </FloatLayer>,
    );

    const el = screen.getByTestId("floater");
    // 关键断言：不在调用方容器内
    expect(container.contains(el)).toBe(false);
    expect(document.body.contains(el)).toBe(true);
  });
});

describe("TocSidebar", () => {
  it("目录挂在 body 上，脱离祖先的 transform 包含块", () => {
    render(<TocSidebar items={items} />);

    const aside = document.querySelector('aside[aria-label="目录侧边栏"]');
    expect(aside).toBeTruthy();

    // 逐级往上检查：绝不能是某个 transform 祖先的子节点
    let node = aside?.parentElement;
    const ancestors: string[] = [];
    while (node && node !== document.body) {
      ancestors.push(node.tagName);
      node = node.parentElement;
    }
    // 第一个非 body 祖先就是 body，说明没有任何中间层
    expect(aside?.parentElement).toBe(document.body);
    console.log("目录祖先链:", ancestors.join(" < "));
  });

  it("内容为空时不渲染任何东西", () => {
    const { container } = render(<TocSidebar items={[]} />);
    expect(container.querySelector("aside")).toBeNull();
    expect(document.querySelector('aside[aria-label="目录侧边栏"]')).toBeNull();
  });

  it("有章节时能看到全部标题", () => {
    render(<TocSidebar items={items} />);
    const aside = document.querySelector('aside[aria-label="目录侧边栏"]');
    expect(aside?.textContent).toContain("第一节");
    expect(aside?.textContent).toContain("第三节");
    // 章节数徽标
    expect(aside?.textContent).toContain("3 节");
  });
});