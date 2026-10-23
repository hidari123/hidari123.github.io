/*
 * AI 聊天面板（懒加载）
 *
 * 本体从 AIChat 拆出来，由 AIChat 在首次打开时动态 import。
 * react-markdown + remark-gfm 只出现在这一层，首屏 chunk 因此能小一大截。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Send, Loader2, AlertCircle, Bot, User, Sparkles } from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { useAIContext } from "@/context/AIContext";
import { askQuestion, chatMessage } from "@/services/aiService";
import type { Message as AIMessage } from "@/services/aiService";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface AIChatProps {
  content?: string;
}

interface AIChatPanelProps extends AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  /** 由 AIChat 从 useLocation 取好再传进来，本组件不需要再 hook 路由 */
  pathname: string;
}

export const AIChatPanel = ({ content, isOpen, onClose, pathname }: AIChatPanelProps) => {
  const { checkConfig, getCurrentConfig } = useAIProvider();
  const { currentArticleContent, currentArticleTitle } = useAIContext();

  // 检测是否在文章详情页
  const isBlogPostPage = pathname.startsWith("/blog/") && pathname !== "/blog";

  // 优先使用 props 传入的 content，否则使用全局上下文
  const articleContent = content || (isBlogPostPage ? currentArticleContent : null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastPathRef = useRef(pathname);

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

  // 首次打开时初始化欢迎消息（后续切换由 pathname 变化接管）。
  // open/close 事件由外层 AIChat 监听，所以面板卸载即失效，不会泄漏监听器。
  useEffect(() => {
    if (!isOpen) return;
    setMessages([{ id: "welcome", role: "assistant", content: getWelcomeMessage() }]);
  }, [isOpen, getWelcomeMessage]);

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
    if (isOpen && lastPathRef.current !== pathname) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: getWelcomeMessage(),
        },
      ]);
    }
    lastPathRef.current = pathname;
  }, [pathname, isOpen, getWelcomeMessage]);

  // 快捷键触发的打开路径要过一遍配置检查，弹窗点按钮也一样
  useEffect(() => {
    if (isOpen) checkConfig();
  }, [isOpen, checkConfig]);

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

      const assistantId = (Date.now() + 1).toString();
      let isFirstChunk = true;

      // 如果在文章页，使用文章内容作为上下文
      if (articleContent) {
        const response = await askQuestion(
          trimmedInput,
          articleContent,
          {
            ...config,
            apiKey: config.apiKey,
          },
          {
            onChunk: (chunk) => {
              if (isFirstChunk) {
                isFirstChunk = false;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: assistantId,
                    role: "assistant",
                    content: chunk,
                  },
                ]);
                setLoading(false);
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + chunk } : m,
                  ),
                );
              }
            },
            onComplete: () => {},
            onError: (err) => {
              setError(err.message);
              setLoading(false);
            },
          },
        );
        // 确保最终内容完整
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: response } : m)),
        );
        setLoading(false);
      } else {
        // 通用聊天模式（支持多轮对话）
        const conversationHistory: AIMessage[] = [];
        const recentMessages = messages.filter((m) => m.id !== "welcome").slice(-20);
        for (const msg of recentMessages) {
          conversationHistory.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
        conversationHistory.push({ role: "user", content: trimmedInput });

        const response = await chatMessage(
          conversationHistory,
          {
            ...config,
            apiKey: config.apiKey,
          },
          {
            onChunk: (chunk) => {
              if (isFirstChunk) {
                isFirstChunk = false;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: assistantId,
                    role: "assistant",
                    content: chunk,
                  },
                ]);
                setLoading(false);
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + chunk } : m,
                  ),
                );
              }
            },
            onComplete: () => {},
            onError: (err) => {
              setError(err.message);
              setLoading(false);
            },
          },
        );
        // 确保最终内容完整
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: response } : m)),
        );
        setLoading(false);
      }
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
      {/* 聊天窗口。悬浮按钮在外层 AIChat，这里只负责面板 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-40 w-[calc(100%_-_3rem)] sm:w-96 h-[32rem] max-h-[calc(100vh-12rem)] flex flex-col bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <span className="font-medium">AI 助手</span>
              </div>
              <button
                onClick={onClose}
                aria-label="关闭 AI 助手"
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
