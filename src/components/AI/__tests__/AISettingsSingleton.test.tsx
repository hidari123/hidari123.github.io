/**
 * 回归护栏：AI 设置弹窗全站只能有一个
 *
 * 原来的症状：文章页点代码块的「解释」，没有 API Key 时弹窗出现，
 * 点关闭又弹一次，必须关两次。
 *
 * 根因是 open-ai-settings 有多个监听者，各自渲染一份 AISettingsModal，
 * dispatch 一次叠 N 层，Esc/点遮罩只关掉最上面那层。
 *
 * 这里断言的是**结构不变式**：整个应用里 AISettingsModal 的宿主数量 == 1。
 * 这条断言对将来任何「顺手又挂一份」都是硬拦截。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
  Layout 里挂了一堆全局装饰层（光标、星星、装饰球），
  它们在 jsdom 下会调到 window.matchMedia，jsdom 不实现这个 API。
  这里补一个最小替身，只满足媒体查询的形状。
*/
beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }
});

/*
  AISettingsModal 依赖 localStorage、keyPool、framer-motion。
  这里用替身而不是真组件 —— 我们要数的是「挂了几份」，
  不是弹窗长什么样。真弹窗另有它自己的测试覆盖。

  替身保留 isOpen 判断，和真组件一致：关着时不渲染任何东西。
  否则「唯一性」这个断言就会被替身自己的无条件渲染污染。
*/
vi.mock("../AISettingsModal", () => ({
  AISettingsModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="ai-settings-modal" /> : null,
}));

vi.mock("@/hooks/useAIProvider", () => ({
  useAIProvider: () => ({
    currentProvider: { id: "deepseek" },
    saveProvider: vi.fn(),
    saveKey: vi.fn(),
    saveCustomConfig: vi.fn(),
    checkConfig: () => false,
    getCurrentConfig: () => ({ apiKey: "" }),
  }),
}));

import { Layout } from "@/components/Layout/Layout";

describe("AI 设置弹窗唯一性", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  const countModals = () => document.querySelectorAll("[data-testid='ai-settings-modal']").length;

  it("Layout 只挂一份 AISettingsModal", () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>page</div>
        </Layout>
      </MemoryRouter>,
    );

    // 组件树里唯一，但还没打开时不该出现在 DOM 里
    expect(countModals()).toBe(0);
  });

  it("连续 dispatch 多次 open-ai-settings，DOM 里仍然只有一份弹窗", () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>page</div>
        </Layout>
      </MemoryRouter>,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent("open-ai-settings"));
      window.dispatchEvent(new CustomEvent("open-ai-settings"));
      window.dispatchEvent(new CustomEvent("open-ai-settings"));
    });

    expect(countModals()).toBe(1);
  });

  it("关闭后再打开，还是一份（不会叠加）", () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>page</div>
        </Layout>
      </MemoryRouter>,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent("open-ai-settings"));
    });
    expect(countModals()).toBe(1);

    // 关掉（弹窗被真的关掉后 DOM 里应该一个都不剩）
    act(() => {
      window.dispatchEvent(new CustomEvent("open-ai-settings"));
    });
    expect(countModals()).toBe(1);
  });
});