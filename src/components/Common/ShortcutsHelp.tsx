/*
 * @Author: hidari
 * @Date: 2026-05-15 16:06
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:07:10
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard, Sparkles } from "lucide-react";

interface ShortcutItem {
  key: string;
  description: string;
  icon?: string;
}

const shortcuts: ShortcutItem[] = [
  { key: "?", description: "显示/隐藏快捷键帮助", icon: "❓" },
  { key: "J / ↓", description: "下一篇", icon: "⬇️" },
  { key: "K / ↑", description: "上一篇", icon: "⬆️" },
  { key: "T", description: "切换暗色/亮色主题", icon: "🎨" },
  { key: "/", description: "聚焦搜索框", icon: "🔍" },
  { key: "E", description: "打开 AI 助手", icon: "🤖" },
  { key: "Esc", description: "关闭弹窗", icon: "✨" },
];

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsHelp = ({ isOpen, onClose }: ShortcutsHelpProps) => {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={handleOverlayClick}
        >
          {/* 背景遮罩 - 渐变毛玻璃效果 */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#6366f1]/20 via-[#8b5cf6]/10 to-[#a78bfa]/20 backdrop-blur-md" />

          {/* 装饰性爱心 */}
          <div className="absolute top-10 left-10 text-4xl animate-bounce opacity-50">💕</div>
          <div className="absolute top-20 right-16 text-3xl animate-pulse opacity-40">✨</div>
          <div className="absolute bottom-20 left-20 text-3xl animate-pulse opacity-30">🌸</div>
          <div
            className="absolute bottom-10 right-10 text-4xl animate-bounce opacity-50"
            style={{ animationDelay: "0.5s" }}
          >
            💜
          </div>

          {/* 主弹窗 */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="relative w-full max-w-md bg-[var(--bg-card)] rounded-3xl shadow-2xl border border-[var(--border)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部装饰渐变条 */}
            <div className="h-2 bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300" />

            {/* 标题栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white shadow-lg shadow-[#6366f1]/30">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">键盘快捷键</h2>
                  <p className="text-sm text-[var(--text-secondary)]">Keyboard Shortcuts</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-white transition-all duration-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 快捷键列表 */}
            <div className="px-6 py-4 space-y-2 max-h-[400px] overflow-y-auto">
              {shortcuts.map((shortcut, index) => (
                <motion.div
                  key={shortcut.key}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-3 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--accent)]/5 transition-colors duration-200 group"
                >
                  {/* 快捷键标签 */}
                  <div className="flex items-center gap-2 min-w-[120px]">
                    {shortcut.icon && (
                      <span className="text-lg group-hover:scale-110 transition-transform">
                        {shortcut.icon}
                      </span>
                    )}
                    <kbd className="px-3 py-1.5 text-sm font-mono font-semibold bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm text-[var(--accent)] group-hover:border-[var(--accent)] group-hover:shadow-[var(--accent)]/20 transition-all duration-200">
                      {shortcut.key}
                    </kbd>
                  </div>

                  {/* 分隔符 */}
                  <div className="w-px h-6 bg-[var(--border)]" />

                  {/* 描述 */}
                  <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    {shortcut.description}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* 底部提示 */}
            <div className="px-6 py-4 border-t border-[var(--border)] bg-gradient-to-r from-[var(--bg-secondary)] to-transparent">
              <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
                <Sparkles className="w-4 h-4 text-[#6366f1]" />
                <span>快来试试这些快捷键吧！</span>
                <Sparkles className="w-4 h-4 text-[#8b5cf6]" />
              </div>
            </div>

            {/* 底部装饰渐变条 */}
            <div className="h-1 bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShortcutsHelp;
