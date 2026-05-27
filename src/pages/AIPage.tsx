/*
 * @Author: hidari
 * @Date: 2026-05-19
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-27 15:19:26
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  User,
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  MessageCircle,
  Settings,
  Trash2,
  Copy,
  CheckCircle,
  BookOpen,
  Database,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { chatMessage } from "@/services/aiService";
import type { Message as AIMessage } from "@/services/aiService";
import { indexBlogPosts, askWithRAGStream, isRAGReady, getRAGStats } from "@/services/ragService";
import { getAllBlogContents } from "@/services/blogContentService";

// RAGSource 类型定义
interface RAGSource {
  text: string;
  source: string;
  title?: string;
  similarity: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: RAGSource[];
}

const WELCOME_MESSAGE = `👋 你好！我是这个博客的 AI 助手。

我可以帮助你：

• 了解项目的基本信息和功能
• 解答关于博客系统的技术问题
• 讨论编程、React、TypeScript 等话题
• 或者随便聊聊天

💡 **提示**：点击上方的"索引博客"按钮，可以让我基于博客文章回答更专业的问题！

有什么我可以帮助你的吗？`;

export const AIPage = () => {
  const { checkConfig, getCurrentConfig, setShowSettingsModal } = useAIProvider();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // RAG 相关状态
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0 });
  const [indexStatus, setIndexStatus] = useState("");
  const [ragReady, setRagReady] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 自动调整输入框高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // 检查 RAG 状态
  useEffect(() => {
    setRagReady(isRAGReady());
  }, []);

  // 初始化欢迎消息
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: WELCOME_MESSAGE,
          timestamp: Date.now(),
        },
      ]);
    }
  }, []);

  // 索引博客文章
  const handleIndexBlogs = async () => {
    if (!checkConfig()) {
      return;
    }

    const config = getCurrentConfig();
    if (!config.apiKey) {
      setError("请先配置 API Key");
      return;
    }

    setIsIndexing(true);
    setIndexProgress({ current: 0, total: 0 });
    setError(null);

    try {
      // 加载所有博客内容
      const blogs = await getAllBlogContents();

      if (blogs.length === 0) {
        throw new Error("没有找到博客文章");
      }

      // 开始索引
      setIndexStatus("加载博客文章...");
      console.log("开始索引博客文章...");
      await indexBlogPosts(
        blogs.map((b) => ({ path: b.path, content: b.content })),
        (current: number, total: number, status: string) => {
          console.log(`进度更新: ${current}/${total} - ${status}`);
          // 使用 setTimeout 确保状态更新被处理
          setTimeout(() => {
            flushSync(() => {
              setIndexProgress({ current, total });
              setIndexStatus(status || `进度 ${current}/${total}`);
            });
          }, 0);
        },
      );

      setRagReady(true);

      // 显示成功消息
      const stats = getRAGStats();
      const successMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `✅ 索引完成！已加载 ${blogs.length} 篇文章，生成了 ${stats.chunkCount} 个文本块。\n\n现在你可以问我关于博客内容的问题了，我会基于文章内容给出准确的回答！`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev.slice(-19), successMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "索引失败，请重试";
      setError(`索引失败: ${errorMessage}`);
    } finally {
      setIsIndexing(false);
    }
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
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev.slice(-19), userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const config = getCurrentConfig();
      if (!config.apiKey) {
        throw new Error("请先配置 API Key");
      }

      const assistantId = (Date.now() + 1).toString();
      let sources: RAGSource[] | undefined;
      let isFirstChunk = true;

      // 优先使用 RAG 回答（如果已索引）
      if (ragReady) {
        console.log("🔍 使用 RAG 检索回答（流式）...");
        const ragResult = await askWithRAGStream(
          trimmedInput,
          config.apiKey,
          config.apiUrl,
          config.model,
          (chunk) => {
            if (isFirstChunk) {
              isFirstChunk = false;
              // 第一个 chunk 到达时才创建消息，替换 loading 状态
              setMessages((prev) => [
                ...prev,
                {
                  id: assistantId,
                  role: "assistant",
                  content: chunk,
                  timestamp: Date.now(),
                },
              ]);
              setLoading(false);
            } else {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
              );
            }
          },
          () => {
            // 流式完成
          },
          (err) => {
            setError(err.message);
            setLoading(false);
          },
        );
        sources = ragResult.sources;
        // 确保最终内容完整
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: ragResult.answer,
                  sources: sources && sources.length > 0 ? sources : undefined,
                }
              : m,
          ),
        );
        setLoading(false);
      } else {
        // 通用聊天模式（支持多轮对话）
        console.log("💬 通用聊天模式（流式）...");
        // 构建对话历史（最近10轮）
        const conversationHistory: AIMessage[] = [];
        const recentMessages = messages.filter((m) => m.id !== "welcome").slice(-20);
        for (const msg of recentMessages) {
          conversationHistory.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
        // 添加当前用户消息
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
                // 第一个 chunk 到达时才创建消息，替换 loading 状态
                setMessages((prev) => [
                  ...prev,
                  {
                    id: assistantId,
                    role: "assistant",
                    content: chunk,
                    timestamp: Date.now(),
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
            onComplete: () => {
              // 流式完成
            },
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

  const handleClearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: WELCOME_MESSAGE,
        timestamp: Date.now(),
      },
    ]);
    setError(null);
  };

  const handleCopyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const toggleSource = (messageId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] py-8">
      <div className="container">
        <div className="max-w-4xl mx-auto">
          {/* 标题 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                <Bot className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-4">AI 助手</h1>
            <p className="text-[var(--text-secondary)] text-lg">
              问我任何关于项目的问题，或者随便聊聊
            </p>
          </motion.div>

          {/* RAG 状态栏 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4"
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    ragReady
                      ? "bg-gradient-to-br from-green-500 to-emerald-500"
                      : isIndexing
                        ? "bg-gradient-to-br from-yellow-500 to-orange-500"
                        : "bg-gradient-to-br from-gray-500 to-gray-600"
                  }`}
                >
                  {isIndexing ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : ragReady ? (
                    <Database className="w-5 h-5 text-white" />
                  ) : (
                    <BookOpen className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="font-medium text-[var(--text-primary)] flex items-center gap-2">
                    博客知识库
                    {ragReady && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-500 rounded-full">
                        已就绪
                      </span>
                    )}
                    {isIndexing && (
                      <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-500 rounded-full">
                        索引中
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {isIndexing
                      ? indexStatus ||
                        `正在生成向量... ${indexProgress.current}/${indexProgress.total}`
                      : ragReady
                        ? `已索引 ${getRAGStats().chunkCount} 个文本块，可基于博客内容回答`
                        : "点击按钮加载博客文章，构建知识库"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleIndexBlogs}
                disabled={isIndexing}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  isIndexing
                    ? "bg-gray-500/20 text-gray-500 cursor-not-allowed"
                    : ragReady
                      ? "bg-green-500/20 text-green-500 hover:bg-green-500/30"
                      : "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:shadow-lg hover:shadow-[#6366f1]/30"
                }`}
              >
                {isIndexing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    索引中...
                  </>
                ) : ragReady ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    重新索引
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    索引博客
                  </>
                )}
              </button>
            </div>
          </motion.div>

          {/* 聊天容器 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-lg"
          >
            {/* 聊天头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-gradient-to-r from-[#6366f1]/10 to-[#8b5cf6]/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-[var(--text-primary)]">
                    AI 对话
                    {ragReady && (
                      <span className="ml-2 text-xs px-2 py-0.5 bg-green-500/20 text-green-500 rounded-full">
                        RAG 模式
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {ragReady ? "基于博客文章知识库回答" : "基于项目信息进行回答"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-all"
                  title="AI 设置"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button
                  onClick={handleClearChat}
                  className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-500/10 transition-all"
                  title="清空对话"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 消息列表 */}
            <div className="h-[32rem] overflow-y-auto p-6 space-y-6">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-start gap-3 group ${
                    message.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  {/* 头像 */}
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                      message.role === "user"
                        ? "bg-gradient-to-br from-[#6366f1] to-[#8b5cf6]"
                        : "bg-[var(--bg-secondary)]"
                    }`}
                  >
                    {message.role === "user" ? (
                      <User className="w-5 h-5 text-white" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-[#6366f1]" />
                    )}
                  </div>

                  {/* 消息内容 */}
                  <div
                    className={`max-w-[75%] ${
                      message.role === "user" ? "items-end" : "items-start"
                    } flex flex-col gap-1`}
                  >
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                        message.role === "user"
                          ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-tr-sm"
                          : "bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-tl-sm"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code: ({ className, children }) => {
                                const match = /language-(\w+)/.exec(className || "");
                                const isInline = !match && !className;
                                return isInline ? (
                                  <code className="px-1.5 py-0.5 bg-[var(--bg-card)] rounded text-[var(--accent)]">
                                    {children}
                                  </code>
                                ) : (
                                  <code
                                    className={`block p-3 bg-[var(--bg-card)] rounded-lg ${className}`}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>

                    {/* 引用来源（仅 RAG 模式下显示） */}
                    {message.role === "assistant" &&
                      message.sources &&
                      message.sources.length > 0 && (
                        <div className="mt-2 w-full">
                          <button
                            onClick={() => toggleSource(message.id)}
                            className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>{message.sources.length} 个参考来源</span>
                            {expandedSources.has(message.id) ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                          {expandedSources.has(message.id) && (
                            <div className="mt-2 space-y-2">
                              {message.sources.map((source, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-xs"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[var(--text-secondary)] font-medium">
                                      来源 {idx + 1}: {source.source}
                                    </span>
                                    <span className="text-green-500">
                                      {(source.similarity * 100).toFixed(1)}% 相似
                                    </span>
                                  </div>
                                  <p className="text-[var(--text-secondary)] line-clamp-2">
                                    {source.text}...
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                    {/* 消息操作 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopyMessage(message.content, message.id)}
                        className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-all"
                        title="复制"
                      >
                        {copiedId === message.id ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* 加载状态 */}
              {loading && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[#6366f1]" />
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
                <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 text-red-500">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* 输入框 */}
            <form
              onSubmit={handleSubmit}
              className="p-6 border-t border-[var(--border)] bg-[var(--bg-secondary)]/50"
            >
              <div className="flex items-end gap-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={ragReady ? "输入关于博客内容的问题..." : "输入你的问题..."}
                  rows={1}
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 transition-all"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="flex-shrink-0 px-6 py-3 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[#6366f1]/30 transition-all flex items-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  <span className="hidden sm:inline">发送</span>
                </button>
              </div>
              <p className="mt-3 text-xs text-center text-[var(--text-secondary)]">
                按 Enter 发送，Shift + Enter 换行
              </p>
            </form>
          </motion.div>

          {/* 功能说明 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-3">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">智能问答</h3>
              <p className="text-sm text-[var(--text-secondary)]">可以询问关于项目的任何问题</p>
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">代码解释</h3>
              <p className="text-sm text-[var(--text-secondary)]">可以帮你解释代码和技术概念</p>
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-3">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">闲聊陪伴</h3>
              <p className="text-sm text-[var(--text-secondary)]">也可以随便聊聊其他话题</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
