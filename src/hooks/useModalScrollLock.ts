import { useEffect } from "react";

/**
 * 模态框滚动锁
 *
 * 问题：遮罩是 `fixed inset-0`，看起来铺满了视口，但 body 本身没锁。
 * 结果是鼠标滚轮在遮罩上滚动时，遮罩和底层页面一起滚 —— 模态框内容
 * 看不全、关掉之后页面已经不在原来的位置。之前 AI 设置 / API Key /
 * 代码块三个模态框各自打了补丁，修出来的行为还不一样（有的锁了、
 * 有的滚一下就穿透），所以统一抽到这里。
 *
 * 三件事，缺一不可：
 *
 * 1. `overflow: hidden` 只是「不滚了」，但滚动条消失会让内容横向抖一下。
 *    所以要记录 scrollbar 宽度并补回 padding-right —— 这是最容易被忽略、
 *    但一眼就能看出来的那个 bug。
 *
 * 2. 嵌套调用要用引用计数。AI 设置里会再开 API Key 输入框，如果两个模态框
 *    各自「打开时加锁、关闭时解锁」，关掉内层会把外层的锁也解掉。
 *
 * 3. body 上已有的 inline style 要原样恢复。之前某个模态框自己加了
 *    `padding-right`，锁一次就被冲掉了。
 */

/** 当前锁的层数。> 0 表示有模态框持有锁 */
let lockCount = 0;

/** 上一次加锁时保存的 body style，用于精确还原 */
let savedStyle: { overflow: string; paddingRight: string } | null = null;

/** 算出滚动条宽度：window.innerWidth 减掉 documentElement.clientWidth */
function getScrollbarWidth(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

/**
 * 给 body 加滚动锁，返回解锁函数。
 *
 * 非 React 版本，方便测试和 React 之外调用。
 * 同一个函数可以被安全地调用多次，只有第一次真正改变 DOM。
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  lockCount += 1;

  // 只有第一层锁才动 DOM
  if (lockCount === 1) {
    const { body } = document;
    const scrollbarWidth = getScrollbarWidth();

    savedStyle = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };

    body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      // 已经手动加过 padding 的话不要叠加
      const currentPadding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
  }

  let released = false;
  return () => {
    // 幂等：同一个 unlock 被调两次不能把计数减成负数
    if (released) return;
    released = true;

    lockCount = Math.max(0, lockCount - 1);

    if (lockCount === 0 && savedStyle) {
      document.body.style.overflow = savedStyle.overflow;
      document.body.style.paddingRight = savedStyle.paddingRight;
      savedStyle = null;
    }
  };
}

/** 会滚动页面的按键。模态框打开时这些键应该被吞掉。 */
const SCROLL_KEYS = new Set([
  "Space",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
]);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    el?.tagName === "INPUT" ||
    el?.tagName === "TEXTAREA" ||
    el?.isContentEditable === true
  );
}

/**
 * React 用法：模态框打开时锁 body 并吞掉滚动类按键，关闭/卸载时释放。
 *
 *   useModalScrollLock(isOpen);
 *
 * 依赖数组里必须包含 open，否则 open 从 false 变 true 时不会加锁
 * （这正是"第一次点开正常，第二次点开就穿透"的成因）。
 */
export function useModalScrollLock(open: boolean): void {
  useEffect(() => {
    if (!open) return;

    const unlock = lockBodyScroll();

    const onKeyDown = (event: KeyboardEvent) => {
      // 输入框里的方向键要放行，否则无法在文本框里移动光标
      if (isTypingTarget(event.target)) return;
      if (SCROLL_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlock();
    };
  }, [open]);
}

/** 测试用：当前锁的层数 */
export function getScrollLockCount(): number {
  return lockCount;
}

/** 测试用：重置模块级状态 */
export function resetScrollLockForTest(): void {
  lockCount = 0;
  savedStyle = null;
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
}