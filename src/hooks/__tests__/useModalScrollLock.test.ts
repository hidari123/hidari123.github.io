/**
 * useModalScrollLock 的行为约束
 *
 * 这几条不是"实现细节"，是三个模态框能不能用对的前提：
 * - 嵌套（AI 设置里再开 API Key）关掉内层不能解锁外层
 * - 同一个 unlock 调两次不能把计数减成负数，否则第三个模态框再也锁不上
 * - body 上原有的 inline style 必须原样还原
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  lockBodyScroll,
  getScrollLockCount,
  resetScrollLockForTest,
} from "../useModalScrollLock";

describe("lockBodyScroll", () => {
  beforeEach(() => {
    resetScrollLockForTest();
  });

  it("加锁时给 body 加 overflow hidden，释放时还原", () => {
    const unlock = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");

    unlock();
    expect(document.body.style.overflow).toBe("");
    expect(getScrollLockCount()).toBe(0);
  });

  it("嵌套两层时，内层关闭不能解锁外层", () => {
    const unlockOuter = lockBodyScroll();
    const unlockInner = lockBodyScroll();
    expect(getScrollLockCount()).toBe(2);

    unlockInner();
    // 外层还开着，锁必须还在
    expect(getScrollLockCount()).toBe(1);
    expect(document.body.style.overflow).toBe("hidden");

    unlockOuter();
    expect(getScrollLockCount()).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("同一个 unlock 调两次是幂等的", () => {
    const unlockA = lockBodyScroll();
    const unlockB = lockBodyScroll();

    unlockA();
    unlockA(); // 多余的一次
    expect(getScrollLockCount()).toBe(1);

    unlockB();
    expect(getScrollLockCount()).toBe(0);
  });

  it("保留 body 上已有的 inline padding", () => {
    document.body.style.paddingRight = "10px";

    const unlock = lockBodyScroll();
    // 至少要保住已有的 10px（可能再叠加滚动条宽度）
    expect(parseFloat(document.body.style.paddingRight)).toBeGreaterThanOrEqual(10);

    unlock();
    expect(document.body.style.paddingRight).toBe("10px");

    document.body.style.paddingRight = "";
  });
});