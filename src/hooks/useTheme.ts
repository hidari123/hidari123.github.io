/*
 * @Author: hidari
 * @Date: 2026-05-13 14:54:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 14:54:35
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    // 优先从 localStorage 读取
    const stored = localStorage.getItem("theme") as Theme;
    if (stored) return stored;

    // 其次检测系统偏好
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }

    localStorage.setItem("theme", theme);
  }, [theme]);

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem("theme");
      // 只有在没有手动设置过主题时才跟随系统
      if (!stored) {
        setTheme(e.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return { theme, toggleTheme };
};

/**
 * 只关心「现在是不是深色」的轻量 hook。
 *
 * 给 PostCover 这类渲染大量元素的组件用：它只需要在主题翻转时重算色板，
 * 不需要 toggleTheme，也不想订阅 useTheme 的全部状态。
 * 直接复用同一个 MutationObserver 机制，行为和 useTheme 完全一致。
 */
export const useIsDarkTheme = (): boolean => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "dark";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
};
