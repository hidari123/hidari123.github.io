/*
 * @Author: hidari
 * @Date: 2026-05-15 16:06
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:07:10
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { motion } from "framer-motion";
import {
  X,
  Keyboard,
  Sparkles,
  Sparkle,
  Flower,
  HelpCircle,
  ArrowDown,
  ArrowUp,
  Palette,
  Search,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/Common/Modal";

interface ShortcutItem {
  key: string;
  description: string;
  /** 图标组件而不是 emoji 字符串 */
  Icon: LucideIcon;
}

/*
 * 快捷键列表。
 *
 * icon 改成 lucide 组件而不是 emoji 字符串：
 * emoji 在不同系统上是不同字体渲染的，同一行里大小基线都对不齐，
 * 颜色也不跟着主题走。换成图标组件后能和文字严格对齐、
 * 跟随 currentColor，深色模式下不用单独处理。
 */
const shortcuts: ShortcutItem[] = [
  { key: "?", description: "显示/隐藏快捷键帮助", Icon: HelpCircle },
  { key: "J / ↓", description: "下一篇", Icon: ArrowDown },
  { key: "K / ↑", description: "上一篇", Icon: ArrowUp },
  { key: "T", description: "切换暗色/亮色主题", Icon: Palette },
  { key: "/", description: "聚焦搜索框", Icon: Search },
  { key: "E", description: "打开 AI 助手", Icon: Bot },
  { key: "Esc", description: "关闭弹窗", Icon: Sparkle },
];

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsHelp = ({ isOpen, onClose }: ShortcutsHelpProps) => {
  // 滚动锁、Esc 关闭、遮罩点击都在 Modal 外壳里了。
  // 这里的面板用的是弹簧入场（spring），和别的弹窗的 duration 不同，
  // 所以面板动画保留在自己的 JSX 里，Modal 只接管外壳。
  const decorations = (
    <>
      {/*
        装饰元素改成图标：
        emoji 不吃 currentColor，粉色爱心在暗色模式下会变成一团脏粉色。
        用 lucide + currentColor 后它们自动跟随主题的强调色。
      */}
      <Sparkles className="absolute top-10 left-10 w-8 h-8 text-[#f472b6] opacity-50 animate-bounce" />
      <Sparkle className="absolute top-20 right-16 w-6 h-6 text-[#a78bfa] opacity-40 animate-pulse" />
      <Flower className="absolute bottom-20 left-20 w-6 h-6 text-[#c4b5fd] opacity-30 animate-pulse" />
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      panelClassName="max-w-md"
      backdropClassName="bg-gradient-to-br from-[#6366f1]/20 via-[#8b5cf6]/10 to-[#a78bfa]/20 backdrop-blur-md"
      decorations={decorations}
    >
      {/* 主弹窗 */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="w-full bg-[var(--bg-card)] rounded-3xl shadow-2xl border border-[var(--border)] overflow-hidden"
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
                    <shortcut.Icon className="w-4 h-4 text-[var(--accent)] group-hover:scale-110 transition-transform shrink-0" />
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
    </Modal>
  );
};

export default ShortcutsHelp;
