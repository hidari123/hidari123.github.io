/*
 * @Author: hidari
 * @Date: 2026-05-13 14:55:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 16:02:10
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/Common/ThemeToggle";
import { Bot, Settings, Home, BookOpen } from "lucide-react";
import { openAISettings } from "@/hooks/useAISettingsModal";

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  /*
    这里不再持有 AISettingsModal，也不再监听 open-ai-settings。

    原来 Navbar 和 AIChat 各挂了一个 AISettingsModal，
    两边都监听同一个事件，于是 dispatch 一次弹两层，
    关一次只能关掉最上面那层 —— 表现就是「点关闭还会再弹一次」。
    而且两边各调一次 useAIProvider()，内部的 showSettingsModal
    是彼此独立的 useState，保存完 key 两边状态不同步。

    弹窗现在统一挂在 Layout，Navbar 只保留按钮。
  */

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 使用 lucide-react 图标
  const navLinks = [
    { name: "首页", path: "/", icon: Home },
    { name: "博客", path: "/blog", icon: BookOpen },
    { name: "AI", path: "/ai", icon: Bot },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[var(--glass-bg)]/90 backdrop-blur-xl shadow-lg border-b border-[var(--glass-border)]/50"
          : "bg-transparent"
      }`}
    >
      <div className="container">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center space-x-2 text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors duration-300 group"
          >
            <Bot className="w-8 h-8 text-[var(--accent)] group-hover:scale-110 transition-transform" />
            <span className="text-xl font-bold bg-gradient-to-r from-[var(--accent)] to-purple-500 bg-clip-text text-transparent">
              Hitari's Blog
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  location.pathname === link.path
                    ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                }`}
              >
                <link.icon className="w-4 h-4" />
                {link.name}
                {/* 下划线动画 */}
                {location.pathname === link.path && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/80" />
                )}
              </Link>
            ))}
          </div>

          {/* Right Side Buttons */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* AI Settings Button */}
            <button
              onClick={() => openAISettings()}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-all duration-300"
              title="AI 设置"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      </nav>
  );
};
