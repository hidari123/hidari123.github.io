/**
 * CustomCursor 拖尾测试
 *
 * 背景：用户反馈「跟随鼠标的浅粉色小球没有了」。
 * 定位到两个叠加的原因：
 *  - keyframes 里的 scale() 顶掉了内联的 translate(-50%,-50%)，粒子偏出光标
 *  - a11y.css 的 reduced-motion 规则把动画压到 0.01ms，粒子直接跳到 opacity:0
 *
 * 还有第三个：原来只在「单次事件位移 > 15px」时补一个点，快速划过时
 * mousemove 事件间隔大，轨迹变成孤立的点而不是一串球。
 * 现在改成沿轨迹按 12px 间距插值补点，这里验证插值确实发生了。
 *
 * 注意：不能用 vi.useFakeTimers()。它会连 performance.now() 一起 mock，
 * 而拖尾的节流逻辑依赖真实时间戳，mock 之后时间不走，
 * 测试会假失败（第一版就是这么写错的）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CustomCursor } from "../CustomCursor";

const move = (x: number, y: number) => {
  act(() => {
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
  });
};

const particles = (c: HTMLElement) => c.querySelectorAll(".cursor-particle");

afterEach(() => cleanup());

describe("CustomCursor 拖尾", () => {
  it("第一次移动只定位，不补粒子（没有基准点）", () => {
    const { container } = render(<CustomCursor />);
    move(100, 100);
    expect(particles(container).length).toBe(0);
  });

  it("快速划过会沿轨迹补出一串粒子，而不是一个孤立点", () => {
    const { container } = render(<CustomCursor />);

    move(100, 100);
    // 一次跨 100px：按 12px 间距应该补出多个点
    move(200, 100);

    expect(particles(container).length).toBeGreaterThan(1);
  });

  it("微小抖动不补粒子，避免在原地堆一坨", () => {
    const { container } = render(<CustomCursor />);

    move(100, 100);
    // 2px < 12px 间距
    move(102, 101);

    expect(particles(container).length).toBe(0);
  });

  it("粒子是浅粉色渐变小圆球", () => {
    const { container } = render(<CustomCursor cursorType="ghost" />);

    move(100, 100);
    move(200, 200);

    const p = container.querySelector(".cursor-particle") as HTMLElement;
    expect(p).toBeTruthy();
    expect(p.style.borderRadius).toBe("50%");
    expect(p.style.background).toContain("249, 168, 212");
    // 定位和层级都交给 CSS class（见内联 <style>），
    // 内联 style 只留颜色和尺寸
    expect(p.style.position).toBe("");
    expect(p.style.transform).toBe("");

    // 层级必须够高：粒子要压在正文和悬浮按钮之上，但不能盖住自定义光标本体
    const styleTag = container.querySelector("style")?.textContent ?? "";
    expect(styleTag).toContain("z-index: 9998");
  });

  it("particle-fade 动画里保留了居中位移", () => {
    const { container } = render(<CustomCursor />);
    const styleTag = container.querySelector("style")?.textContent ?? "";

    // 少了 translate(-50%,-50%) 粒子就会被 scale 顶偏，这是原来的 bug
    expect(styleTag).toContain("translate(-50%, -50%) scale(1)");
    expect(styleTag).toContain("translate(-50%, -50%) scale(0.3)");
  });

  it("reduced-motion 下粒子不被设为透明", () => {
    const { container } = render(<CustomCursor />);
    const styleTag = container.querySelector("style")?.textContent ?? "";

    expect(styleTag).toContain("@media (prefers-reduced-motion: reduce)");
    // 该媒体查询里必须是 animation: none + opacity: 0.7，
    // 不能被全局的 0.01ms 规则压成 opacity: 0
    const reducedBlock = styleTag.slice(styleTag.indexOf("prefers-reduced-motion"));
    expect(reducedBlock).toContain("animation: none");
    expect(reducedBlock).toContain("opacity: 0.7");
  });
});