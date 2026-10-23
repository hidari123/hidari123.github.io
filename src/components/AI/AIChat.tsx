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
import { AISettingsModal } from "./AISettingsModal";
import { useAIProvider } from "@/hooks/useAIProvider";

const AIChatPanel = lazy(() =>
  import("./AIChatPanel").then((m) => ({ default: m.AIChatPanel })),
);

export const AIChat = ({ content }: AIChatProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const location = useLocation();
  const { saveProvider, saveKey, saveCustomConfig, currentProvider } = useAIProvider();
  const [showSettings, setShowSettings] = useState(false);

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
   * AI 设置弹窗原来从来没被挂载过——checkConfig() 在缺配置时
   * dispatch("open-ai-settings")，但没有任何组件监听这个事件，
   * 于是「点击 → 弹窗该出现 → 什么都没发生」。
   * 现在挂在全局唯一入口这里，顺手把 close-ai-chat 也一起接上。
   */
  useEffect(() => {
    const openSettings = () => setShowSettings(true);
    window.addEventListener("open-ai-settings", openSettings);
    return () => window.removeEventListener("open-ai-settings", openSettings);
  }, []);

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(true)}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="打开 AI 助手"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-lg shadow-[#6366f1]/30 flex items-center justify-center hover:shadow-xl hover:shadow-[#6366f1]/40 transition-shadow"
      >
        <MessageCircle className="w-6 h-6" />
      </motion.button>

      {mounted && (
        <ErrorBoundary title="AI 助手没能打开">
          <Suspense
            fallback={
              <div className="fixed bottom-24 right-6 z-40 w-[calc(100%_-_3rem)] max-w-[24rem] h-[32rem] rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl flex items-center justify-center">
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

      <AISettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        currentProviderId={currentProvider.id}
        onSave={(provider, key, baseURL, model) => {
          saveProvider(provider);
          if (baseURL && model) {
            saveCustomConfig(baseURL, model);
          } else {
            saveKey(key);
          }
          setShowSettings(false);
        }}
      />
    </>
  );
};