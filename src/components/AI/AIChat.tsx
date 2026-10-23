/*
 * AI 聊天入口
 *
 * 性能要点：这个文件只负责悬浮按钮，聊天面板本体在 AIChatPanel 里，
 * 首次点开时才动态 import。
 *
 * 原先单文件写法的问题：AIChat 被 Layout 静态引入，而它静态 import 了
 * react-markdown + remark-gfm，连带一整条 micromark/mdast 解析链
 * （实测约 60KB）全部进了首屏 chunk——而绝大多数访客根本不会点这个按钮。
 * 拆开之后，首屏不再为「可能永远不用的功能」付费。
 */

import { useState, useEffect, lazy, Suspense, useCallback } from "react";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import type { AIChatProps } from "./AIChatPanel";
import { ErrorBoundary } from "@/components/Common/ErrorBoundary";

const AIChatPanel = lazy(() =>
  import("./AIChatPanel").then((m) => ({ default: m.AIChatPanel })),
);

export const AIChat = ({ content }: AIChatProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const location = useLocation();

  // 面板已打开过就不再卸载，避免反复进出时重新拉 chunk
  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  const closeChat = useCallback(() => setIsOpen(false), []);

  // 全局快捷键 / Layout 通过自定义事件打开聊天
  useEffect(() => {
    const open = () => setIsOpen(true);
    const close = () => setIsOpen(false);
    window.addEventListener("open-ai-chat", open);
    window.addEventListener("close-ai-chat", close);
    return () => {
      window.removeEventListener("open-ai-chat", open);
      window.removeEventListener("close-ai-chat", close);
    };
  }, []);

  /*
    这里原来还有一份 AISettingsModal + 一个 open-ai-settings 监听。

    Navbar 里也有一份，两边都监听同一个事件，
    dispatch 一次就弹出两层一模一样的设置弹窗，
    关一次只关掉最上面那层 —— 表现就是「点关闭还会再弹一次」。

    现在弹窗统一挂在 Layout（useAISettingsModal），
    AIChat 只负责聊天本身：
      缺 API Key 时 checkConfig() → dispatch open-ai-settings
      → 唯一的订阅者（Layout）打开那一个弹窗。
  */

  return (
    <>
      {/*
        z-50 而不是 z-40。

        目录侧边栏也是 z-40，目录走 FloatLayer portal 到 body，在 DOM 里
        位于 AIChat 之后 —— z 相同就比绘制顺序，目录赢。实测：

          buttonZ "40"  asideZ "40"  overlap true
          elementFromPoint(按钮中心) → DIV.overflow-y-auto（目录的滚动容器）
          topElementIsButton: false

        也就是说按钮被目录盖住且**点不动**，不是只“看起来被挡”。
        层级约定（同样写进 TOOLS.md）：
          目录侧边栏 / 折叠 tab → z-40
          chat 悬浮按钮 / 面板   → z-50
          Modal                  → z-[10000]

        注意：注释写在 JSX 标签**外面**。写在 <motion.button> 的属性列表中间
        会让 TSX 解析器把后面的 className 当成注释内容，抛一串
        TS1003 / TS17015 之类的语法错误。
      */}
      <motion.button
        onClick={() => setIsOpen(true)}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="打开 AI 助手"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-lg shadow-[#6366f1]/30 flex items-center justify-center hover:shadow-xl hover:shadow-[#6366f1]/40 transition-shadow"
      >
        <MessageCircle className="w-6 h-6" />
      </motion.button>

      {mounted && (
        <ErrorBoundary title="AI 助手没能打开">
          <Suspense
            fallback={
              <div className="fixed bottom-24 right-6 z-50 w-[calc(100%_-_3rem)] max-w-[24rem] h-[32rem] rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl flex items-center justify-center">
                <span className="text-sm text-[var(--text-secondary)]">加载中...</span>
              </div>
            }
          >
            <AIChatPanel
              content={content}
              isOpen={isOpen}
              onClose={closeChat}
              pathname={location.pathname}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
};