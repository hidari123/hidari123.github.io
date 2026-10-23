/**
 * 读取系统的「减少动态效果」设置
 *
 * 站点里有多处常驻动画（自定义光标、飘心、kawaii 浮动、卡片 hover）。
 * 这些对前庭功能障碍的用户是负担，所以在 JS 动画分支上也读一次，
 * 不能只靠 CSS 的 prefers-reduced-motion 去覆盖 framer-motion 的 transform
 * （framer-motion 走的是内联 style，CSS 覆盖不完全可靠）。
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);

    // Safari < 14 只有 addListener
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}