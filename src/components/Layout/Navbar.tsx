/*
 * @Author: hidari
 * @Date: 2026-05-13 14:55:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:41:17
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/Common/ThemeToggle";
import { Bot, PenLine, Settings } from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { AISettingsModal } from "@/components/AI/AISettingsModal";

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const {
    currentProvider,
    showSettingsModal,
    setShowSettingsModal,
    saveProvider,
    saveKey,
    saveCustomConfig,
  } = useAIProvider();

  // 监听打开设置弹窗事件
  useEffect(() => {
    const handleOpenSettings = () => {
      setShowSettingsModal(true);
    };
    window.addEventListener("open-ai-settings", handleOpenSettings);
    return () => window.removeEventListener("open-ai-settings", handleOpenSettings);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "首页", path: "/" },
    { name: "博客", path: "/blog" },
    { name: "关于", path: "/about" },
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
            <div className="relative">
              <Bot className="w-8 h-8 text-[var(--accent)] group-hover:scale-110 transition-transform" />
              <PenLine className="w-3 h-3 absolute -bottom-1 -right-1 text-[var(--accent)]" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-[var(--accent)] to-purple-500 bg-clip-text text-transparent">
              我的博客
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  location.pathname === link.path
                    ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Right Side Buttons */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* AI Settings Button */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-all duration-300"
              title="AI 设置"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* AI Settings Modal */}
      <AISettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSave={(provider, key, baseURL, model) => {
          saveProvider(provider);
          saveKey(key);
          if (baseURL && model) {
            saveCustomConfig(baseURL, model);
          }
        }}
        currentProviderId={currentProvider.id}
      />
    </nav>
  );
};
