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
