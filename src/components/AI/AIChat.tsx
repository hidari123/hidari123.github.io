/*
 * @Author: hidari
 * @Date: 2026-05-14 09:54
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:09:07
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocation } from "react-router-dom";
import { MessageCircle, X, Send, Loader2, AlertCircle, Bot, User, Sparkles } from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { useAIContext } from "@/context/AIContext";
import { askQuestion } from "@/services/aiService";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AIChatProps {
  content?: string;
}

// 项目信息
const PROJECT_INFO = `
项目信息：
- 项目名称：Hitari's Blog（一个现代化的博客系统）
- 作者 GitHub：https://github.com/hidari123
- 技术栈：React + TypeScript + Vite + Tailwind CSS
- 功能：支持博客文章展示、Markdown 渲染、评论系统、AI 增强功能
- AI 功能：支持 AI 摘要、AI 问答、代码解释
- AI 服务商：支持 DeepSeek（推荐）、OpenAI、自定义 API
`;

export const AIChat = ({ content }: AIChatProps) => {
  const { checkConfig, getCurrentConfig } = useAIProvider();
  const { currentArticleContent, currentArticleTitle } = useAIContext();
  const location = useLocation();

  // 检测是否在文章详情页
  const isBlogPostPage = location.pathname.startsWith("/blog/") && location.pathname !== "/blog";

  // 优先使用 props 传入的 content，否则使用全局上下文
  const articleContent = content || (isBlogPostPage ? currentArticleContent : null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastPathRef = useRef(location.pathname);

  // 获取欢迎消息
  const getWelcomeMessage = useCallback(() => {
    if (articleContent) {
      const title = currentArticleTitle || "当前文章";
      return `👋 你好！我是 AI 助手，当前正在阅读《${title}》。

你可以：\n
• 询问文章相关的问题\n
• 让我解释代码或概念\n
• 讨论文章中的观点\n
• 或者随便聊聊\n
有什么我可以帮助你的吗？`;
    }
    return `👋 你好！我是这个博客的 AI 助手，可以回答关于项目的问题，也可以闲聊！

我可以帮助你了解：\n
• 项目的基本信息\n
• 作者的相关信息\n
• 技术实现细节\n
• 或者其他任何问题\n
有什么我可以帮助你的吗？`;
  }, [articleContent, currentArticleTitle]);

  // 监听外部打开/关闭事件（用于键盘快捷键控制）
  useEffect(() => {
    const handleOpenAIChat = () => {
      if (!checkConfig()) return;
      setIsOpen(true);
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: getWelcomeMessage(),
        },
      ]);
    };

    const handleCloseAIChat = () => {
      setIsOpen(false);
    };

    window.addEventListener("open-ai-chat", handleOpenAIChat);
    window.addEventListener("close-ai-chat", handleCloseAIChat);

    return () => {
      window.removeEventListener("open-ai-chat", handleOpenAIChat);
      window.removeEventListener("close-ai-chat", handleCloseAIChat);
    };
  }, [checkConfig, getWelcomeMessage]);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, scrollToBottom]);

  // 自动调整输入框高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // 监听路径变化，当切换页面时更新欢迎消息
  useEffect(() => {
    if (isOpen && lastPathRef.current !== location.pathname) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: getWelcomeMessage(),
        },
      ]);
    }
    lastPathRef.current = location.pathname;
  }, [location.pathname, isOpen, getWelcomeMessage]);

  const handleOpen = () => {
    // 检查配置
    if (!checkConfig()) {
      return;
    }
    setIsOpen(true);
    // 每次打开都更新欢迎消息（因为文章可能变了）
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: getWelcomeMessage(),
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || loading) return;

    // 检查配置
    if (!checkConfig()) {
      return;
    }

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmedInput,
    };
    setMessages((prev) => [...prev.slice(-9), userMessage]); // 保留最近 10 条消息
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const config = getCurrentConfig();
      if (!config.apiKey) {
        throw new Error("请先配置 API Key");
      }

      // 获取实际的文章内容
      const effectiveContent = articleContent || PROJECT_INFO;

      const response = await askQuestion(trimmedInput, effectiveContent, {
        ...config,
        apiKey: config.apiKey,
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "回答生成失败，请重试";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <>
      {/* 聊天按钮 */}
      <motion.button
        onClick={handleOpen}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-lg shadow-[#6366f1]/30 flex items-center justify-center hover:shadow-xl hover:shadow-[#6366f1]/40 transition-shadow"
      >
        <MessageCircle className="w-6 h-6" />
      </motion.button>

      {/* 聊天窗口 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-40 w-[calc(100%-3rem)] sm:w-96 h-[32rem] max-h-[calc(100vh-12rem)] flex flex-col bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <span className="font-medium">AI 助手</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-start gap-2 ${
                    message.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      message.role === "user" ? "bg-[#6366f1]" : "bg-[var(--bg-secondary)]"
                    }`}
                  >
                    {message.role === "user" ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-[#6366f1]" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      message.role === "user"
                        ? "bg-[#6366f1] text-white rounded-tr-sm"
                        : "bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-tl-sm"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      message.content
                    )}
                  </div>
                </motion.div>
              ))}

              {/* 加载状态 */}
              {loading && (
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-[#6366f1]" />
                  </div>
                  <div className="bg-[var(--bg-secondary)] px-4 py-3 rounded-2xl rounded-tl-sm">
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">思考中...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 错误提示 */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* 输入框 */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-[var(--border)]">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={articleContent ? "输入问题..." : "随便聊聊或问我关于项目的问题..."}
                  rows={1}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 transition-all text-sm"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="flex-shrink-0 p-2.5 rounded-xl bg-[#6366f1] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#4f46e5] transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-2 text-xs text-center text-[var(--text-secondary)]">
                {articleContent ? "基于当前文章内容回答" : "可回答项目相关问题或闲聊"}
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
