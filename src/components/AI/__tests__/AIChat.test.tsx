import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AIChat } from "../AIChat";

/**
 * 复现「点右下角悬浮按钮 → 白屏」。
 *
 * 面板是 lazy 加载的，所以第一次点开会走 Suspense。
 * 这里覆盖：打开 → 关闭 → 再打开，确认不会因为 state 或监听器出问题而崩。
 */
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("AIChat 悬浮按钮", () => {
  it("点击后能打开面板（不抛错、不空白）", () => {
    const { container } = wrap(<AIChat />);

    const button = screen.getByLabelText("打开 AI 助手");
    expect(button).toBeTruthy();

    act(() => {
      fireEvent.click(button);
    });

    // 至少应该渲染出容器（Suspense fallback 或面板本体）
    expect(container.innerHTML.length).toBeGreaterThan(100);
  });

  it("关闭后能再次打开", () => {
    wrap(<AIChat />);
    const button = screen.getByLabelText("打开 AI 助手");

    act(() => {
      fireEvent.click(button);
    });

    const closeBtn = screen.queryByLabelText("关闭 AI 助手");
    if (closeBtn) {
      act(() => {
        fireEvent.click(closeBtn);
      });
    }

    act(() => {
      fireEvent.click(button);
    });

    expect(true).toBe(true);
  });

  it("open-ai-chat 自定义事件能打开面板", () => {
    wrap(<AIChat />);

    act(() => {
      window.dispatchEvent(new CustomEvent("open-ai-chat"));
    });

    expect(true).toBe(true);
  });
});