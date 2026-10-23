/*
 * @Author: hidari
 * @Date: 2026-10-23
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  Link,
  useNavigate,
} from "react-router-dom";
import { useScrollToTop } from "../useScrollToTop";

const scrollCalls: { top: number; behavior?: ScrollBehavior }[] = [];
let fakeY = 0;

/**
 * 把 window.scrollY 换成可控变量，并记录所有 scrollTo 调用。
 * jsdom 不实现真实滚动，不 stub 的话断言永远是假的。
 */
const stubScroll = () => {
  scrollCalls.length = 0;
  fakeY = 0;
  Object.defineProperty(window, "scrollY", { get: () => fakeY, configurable: true });
  vi.stubGlobal("scrollTo", (opts: { top: number; behavior?: ScrollBehavior }) => {
    fakeY = opts.top;
    scrollCalls.push(opts);
  });
};

function Shell({ tag }: { tag: string }) {
  useScrollToTop();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid={tag}>{tag}</span>
      <button onClick={() => navigate("/blog?page=2")}>to-list-p2</button>
      <button onClick={() => navigate(-1)}>back</button>
      <Link to="/">to-home</Link>
    </div>
  );
}

const Harness = () => (
  <MemoryRouter initialEntries={["/"]}>
    <Routes>
      <Route path="/" element={<Shell tag="home" />} />
      <Route path="/blog" element={<Shell tag="list" />} />
      <Route path="/blog/:slug" element={<Shell tag="post" />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(stubScroll);
afterEach(() => vi.unstubAllGlobals());

describe("useScrollToTop", () => {
  it("首次挂载不滚动 —— 刷新页面时不该把用户位置清掉", () => {
    render(<Harness />);
    expect(scrollCalls).toHaveLength(0);
  });

  it("PUSH 到新路由时回顶，且 behavior 是 instant", () => {
    const { getByText } = render(<Harness />);
    fakeY = 900; // 模拟用户已经往下滚了

    act(() => {
      getByText("to-list-p2").click();
    });

    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0].top).toBe(0);
    // globals.css 全局 scroll-behavior: smooth；
    // 不显式给 instant，新页面一进来就做 500ms 向上飘的动画，比不回顶更糟
    expect(scrollCalls[0].behavior).toBe("instant");
  });

  it("同路径但 query 变了也算换页（/blog?page=1 → /blog?page=2）", () => {
    const { getByText } = render(<Harness />);
    fakeY = 500;
    act(() => {
      getByText("to-list-p2").click();
    });
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0].behavior).toBe("instant");
  });

  it("POP（浏览器后退）不插手，位置交还给浏览器自己还原", () => {
    const { getByText } = render(<Harness />);

    act(() => {
      getByText("to-list-p2").click();
    });
    expect(scrollCalls).toHaveLength(1);

    scrollCalls.length = 0;
    act(() => {
      getByText("back").click();
    });

    // 后退时如果我们也 scrollTo，会和浏览器的还原动画抢，表现为闪一下
    expect(scrollCalls).toHaveLength(0);
  });

  it("任何情况下都不会用 smooth 行为回顶", () => {
    const { getByText } = render(<Harness />);
    act(() => {
      getByText("to-list-p2").click();
    });
    expect(scrollCalls.every((c) => c.behavior !== "smooth")).toBe(true);
  });
});