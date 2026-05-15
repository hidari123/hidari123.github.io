/*
 * @Author: hidari
 * @Date: 2026-05-13 14:56:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:25:32
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AIChat } from "@/components/AI/AIChat";
import { BackToTop, ScrollProgress } from "@/components/Common/BackToTop";
import { CustomCursor } from "@/components/Common/CustomCursor";
import { ShortcutsHelp } from "@/components/Common/ShortcutsHelp";
import { ToastProvider } from "@/components/Common/Toast";
import { PerformancePanel } from "@/components/Common/PerformancePanel";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTheme } from "@/hooks/useTheme";
import { Lightbulb } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { toggleTheme } = useTheme();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 注册搜索框引用
  useEffect(() => {
    const registerSearchInput = () => {
      // 查找页面中的搜索框
      const searchInput = document.querySelector(
        'input[type="text"], input[placeholder*="搜索"]',
      ) as HTMLInputElement;
      if (searchInput) {
        searchInputRef.current = searchInput;
      }
    };

    // 初始注册
    registerSearchInput();

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
      registerSearchInput();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // 聚焦搜索框
  const focusSearch = useCallback(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // 打开 AI 聊天
  const openAIChat = useCallback(() => {
    window.dispatchEvent(new CustomEvent("open-ai-chat"));
  }, []);

  // 关闭弹窗（用于 Esc 键）
  const closeModals = useCallback(() => {
    window.dispatchEvent(new CustomEvent("close-ai-chat"));
  }, []);

  // 使用键盘快捷键
  const { isHelpVisible, setIsHelpVisible } = useKeyboardShortcuts({
    onToggleHelp: () => {
      // hook 内部已经处理状态切换，这里不需要重复处理
      // 只需要做额外的操作（如派发事件）时使用
    },
    onNextPost: () => {
      // 派发自定义事件，让博客列表或详情页处理
      window.dispatchEvent(new CustomEvent("shortcut-next-post"));
    },
    onPrevPost: () => {
      // 派发自定义事件，让博客列表或详情页处理
      window.dispatchEvent(new CustomEvent("shortcut-prev-post"));
    },
    onToggleTheme: toggleTheme,
    onFocusSearch: focusSearch,
    onToggleAIChat: openAIChat,
    onCloseModal: closeModals,
  });

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* 自定义光标 */}
      <CustomCursor />

      {/* 星星装饰层 */}
      <div className="cute-decoration" />

      {/* 亮色主题漂浮爱心层 */}
      <div className="floating-hearts" />

      {/* 暗色主题闪闪星光层 */}
      <div className="twinkle-stars" />

      {/* 三个漂浮毛绒球 */}
      <div className="fluffy-ball fluffy-ball-1" />
      <div className="fluffy-ball fluffy-ball-2" />
      <div className="fluffy-ball fluffy-ball-3" />

      {/* 页面滚动进度条 */}
      <ScrollProgress />

      <Navbar />

      <main className="flex-grow pt-16 relative z-10">{children}</main>

      <Footer />

      {/* 全局 AI 聊天组件 */}
      <AIChat />

      {/* 快捷键帮助弹窗 */}
      <ShortcutsHelp isOpen={isHelpVisible} onClose={() => setIsHelpVisible(false)} />

      {/* Toast 提示组件 */}
      <ToastProvider />

      {/* 快捷键提示 */}
      <ShortcutsHint />

      {/* 返回顶部按钮 */}
      <BackToTop />

      {/* 性能监控面板 */}
      <PerformancePanel />
    </div>
  );
};

// 快捷键提示组件
const ShortcutsHint = () => {
  const [isVisible, setIsVisible] = useState(true);

  // 3秒后自动隐藏提示
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-20 left-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] shadow-lg"
    >
      <Lightbulb className="w-4 h-4 text-[#fbbf24]" />
      <span className="text-sm text-[var(--text-secondary)]">
        按{" "}
        <kbd className="px-1.5 py-0.5 mx-1 text-xs font-semibold bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 rounded">
          Shift
        </kbd>
        <kbd className="px-1.5 py-0.5 mx-1 text-xs font-semibold bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 rounded">
          ?
        </kbd>{" "}
        查看快捷键
      </span>
    </motion.div>
  );
};
