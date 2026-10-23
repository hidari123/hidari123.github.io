/*
 * @Author: hidari
 * @Date: 2026-05-19
 * @LastEditors: hidari
 * @LastEditTime: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  Settings,
  Trash2,
  Copy,
  CheckCircle,
  BookOpen,
  Database,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Square,
  Download,
  Coins,
} from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { useSeo } from "@/hooks/useSeo";
import {
  streamChat,
  trimMessagesToBudget,
  estimateTokens,
  type ChatMessage,
  type LLMParams,
  type Usage,
  DEFAULT_PARAMS,
} from "@/services/llmService";
import { indexBlogPosts, askWithRAGStream, isRAGReady, getRAGStats, ensureIndex } from "@/services/ragService";
import { getAllBlogContents } from "@/services/blogContentService";
import { getPostIndex } from "@/services/blogService";
import { ModelParams } from "@/components/AI/ModelParams";
import { UsageMeter } from "@/components/AI/UsageMeter";
import { PromptTemplates, type PromptTemplate } from "@/components/AI/PromptTemplates";

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
  usage?: Usage;
  /** 停止原因：stop / length / aborted */
  finishReason?: string;
}

const WELCOME_MESSAGE = `👋 你好！我是这个博客的 AI 助手。

我可以帮助你：

• 了解项目的基本信息和功能
• 解答关于博客系统的技术问题
• 讨论编程、React、TypeScript 等话题
• 或者随便聊聊天

💡 **提示**：点击上方的"索引博客"按钮，可以让我基于博客文章回答更专业的问题！

有什么我可以帮助你的吗？`;

/** 上下文预算：超过这个 token 数就裁剪最老的历史 */
const CONTEXT_BUDGET = 8000;

export const AIPage = () => {
  const { checkConfig, getCurrentConfig, setShowSettingsModal } = useAIProvider();

  useSeo({
    title: "AI 助手",
    description:
      "多模型适配、流式输出、浏览器内向量检索的 LLM 对话助手，支持参数调优与随时中断。",
    path: "/ai",
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // LLM 参数与用量
  const [params, setParams] = useState<LLMParams>(DEFAULT_PARAMS);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [totalUsage, setTotalUsage] = useState<Usage | null>(null);

  // RAG 相关状态
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0 });
  const [indexStatus, setIndexStatus] = useState("");
  const [ragReady, setRagReady] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** 中断当前请求用 */
  const abortRef = useRef<AbortController | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 累计用量
  const addUsage = useCallback((u: Usage) => {
    setUsage(u);
    setTotalUsage((prev) => ({
      promptTokens: (prev?.promptTokens ?? 0) + u.promptTokens,
      completionTokens: (prev?.completionTokens ?? 0) + u.completionTokens,
      totalTokens: (prev?.totalTokens ?? 0) + u.totalTokens,
    }));
  }, []);

  // 索引博客文章
  const handleIndexBlogs = async () => {
    if (!checkConfig()) return;

    const config = getCurrentConfig();
    if (!config.apiKey) {
      setError("请先配置 API Key");
      return;
    }

    setIsIndexing(true);
    setIndexProgress({ current: 0, total: 0 });
    setError(null);

    try {
      const blogs = await getAllBlogContents();
      if (blogs.length === 0) throw new Error("没有找到博客文章");

      setIndexStatus("加载博客文章...");
      const index = await getPostIndex();

      // 先查缓存，命中就不重算。35 篇文章 ≈ 300 个块，
      // 在浏览器 CPU 上重新推理要几秒到几十秒，而文章没变时结果完全一样。
      const { fromCache } = await ensureIndex(
        index,
        blogs.map((b) => ({ path: b.path, title: b.title, content: b.content })),
        (current: number, total: number, status: string) => {
          setIndexProgress({ current, total });
          setIndexStatus(status || `进度 ${current}/${total}`);
        },
      );

      setRagReady(true);

      const stats = getRAGStats();
      const successMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: fromCache
          ? `✅ 索引已就绪（命中缓存，${stats.chunkCount} 个文本块）。\n\n可以直接提问了。`
          : `✅ 索引完成！已加载 ${blogs.length} 篇文章，生成了 ${stats.chunkCount} 个文本块。\n\n现在你可以问我关于博客内容的问题了，我会基于文章内容给出准确的回答！`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev.slice(-19), successMessage]);
    } catch (err) {
      setError(`索引失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setIsIndexing(false);
    }
  };

  /** 把界面消息转成 API 消息格式（去掉 welcome，裁剪到预算内） */
  const buildHistory = useCallback((): ChatMessage[] => {
    const history: ChatMessage[] = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));

    const { kept, dropped } = trimMessagesToBudget(history, CONTEXT_BUDGET);
    if (dropped > 0) {
      console.info(`[上下文裁剪] 丢弃 ${dropped} 条较早的消息以适配 ${CONTEXT_BUDGET} token 预算`);
    }
    return kept;
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || loading) return;
    if (!checkConfig()) return;

    const config = getCurrentConfig();
    if (!config.apiKey) {
      setError("请先配置 API Key");
      return;
    }

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
    setUsage(null);

    const assistantId = Date.now() + 1 + "";
    let isFirstChunk = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (ragReady) {
        // ---- RAG 模式：先检索再回答，带引用来源 ----
        const ragResult = await askWithRAGStream(
          trimmedInput,
          config.apiKey,
          config.apiUrl,
          config.model,
          (chunk) => {
            if (isFirstChunk) {
              isFirstChunk = false;
              setMessages((prev) => [
                ...prev,
                { id: assistantId, role: "assistant", content: chunk, timestamp: Date.now() },
              ]);
              setLoading(false);
            } else {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
              );
            }
          },
          () => {},
          (err) => {
            setError(err.message);
            setLoading(false);
          },
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: ragResult.answer,
                  sources: ragResult.sources?.length ? ragResult.sources : undefined,
                }
              : m,
          ),
        );
      } else {
        // ---- 通用对话模式：走 llmService，支持参数控制与中断 ----
        const history = buildHistory();
        const apiMessages: ChatMessage[] = [
          {
            role: "system",
            content:
              "你是 Hitari's Blog 的 AI 助手，一个友好、专业的技术向导。你可以：\n" +
              "1. 回答关于本项目、技术栈（React、TypeScript、Vite、Tailwind CSS）的问题\n" +
              "2. 讨论编程、前端开发、架构设计等技术话题\n" +
              "3. 进行日常闲聊，保持友好自然的对话风格\n" +
              "4. 如果用户问到你不知道的信息，诚实地说不知道\n\n" +
              "项目基本信息：\n" +
              "- 项目名称：Hitari's Blog\n" +
              "- 作者 GitHub：https://github.com/hidari123\n" +
              "- 技术栈：React 18 + TypeScript + Vite + Tailwind CSS\n" +
              "- AI 能力：多服务商适配、流式输出、向量检索问答（RAG）、模型参数可调",
          },
          ...history,
          { role: "user", content: trimmedInput },
        ];

        const result = await streamChat(
          apiMessages,
          { baseURL: config.apiUrl, apiKey: config.apiKey, model: config.model },
          params,
          {
            onChunk: (chunk) => {
              if (isFirstChunk) {
                isFirstChunk = false;
                setMessages((prev) => [
                  ...prev,
                  { id: assistantId, role: "assistant", content: chunk, timestamp: Date.now() },
                ]);
                setLoading(false);
              } else {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
                );
              }
            },
            onUsage: (u) => addUsage(u),
          },
          controller.signal,
        );

        if (result.usage) addUsage(result.usage);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: result.content,
                  usage: result.usage,
                  finishReason: result.finishReason,
                }
              : m,
          ),
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "回答生成失败，请重试";
      if (errorMessage !== "已停止生成") setError(errorMessage);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  /** 停止生成 */
  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearChat = () => {
    setMessages([
      { id: "welcome", role: "assistant", content: WELCOME_MESSAGE, timestamp: Date.now() },
    ]);
    setError(null);
    setUsage(null);
    setTotalUsage(null);
  };

  /** 导出对话为 Markdown */
  const handleExport = () => {
    const config = getCurrentConfig();
    const lines = [
      `# AI 对话记录`,
      ``,
      `- 模型：${config.model}`,
      `- 导出时间：${new Date().toLocaleString("zh-CN")}`,
      `- 消息数：${messages.filter((m) => m.id !== "welcome").length}`,
      ``,
      `---`,
      ``,
    ];

    for (const m of messages) {
      if (m.id === "welcome") continue;
      const who = m.role === "user" ? "我" : "AI";
      lines.push(`### ${who}`, ``, m.content, ``);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  const toggleSource = (messageId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const handleSelectTemplate = (template: PromptTemplate) => {
    setInput((prev) => prev + template.prompt);
    if (template.temperature !== undefined) {
      setParams((prev) => ({ ...prev, temperature: template.temperature as number }));
    }
    inputRef.current?.focus();
  };

  /** 预估这次输入会占多少 token */
  const inputTokens = useMemo(() => estimateTokens(input), [input]);

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
              多模型适配 · 流式输出 · 向量检索问答 · 参数可调
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
                      ? indexStatus || `正在生成向量... ${indexProgress.current}/${indexProgress.total}`
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
                  <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
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
                  onClick={handleExport}
                  className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-all"
                  title="导出对话"
                >
                  <Download className="w-5 h-5" />
                </button>
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

            {/* 模型参数 */}
            <ModelParams params={params} onChange={setParams} disabled={loading} />

            {/* 用量统计 */}
            <UsageMeter usage={usage} total={totalUsage} />

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
                                  <code className={`block p-3 bg-[var(--bg-card)] rounded-lg ${className}`}>
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

                    {/* 停止原因 / 用量 */}
                    {message.role === "assistant" && (message.finishReason || message.usage) && (
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                        {message.finishReason === "aborted" && (
                          <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-500 rounded">
                            已手动停止
                          </span>
                        )}
                        {message.finishReason === "length" && (
                          <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 rounded">
                            达到长度上限被截断
                          </span>
                        )}
                        {message.usage && (
                          <span className="font-mono">
                            ↑{message.usage.promptTokens} ↓{message.usage.completionTokens}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 引用来源 */}
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
                                      来源 {idx + 1}: {source.title || source.source}
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
                    <Sparkles className="w-5 h-5 text-[#6366f1] animate-pulse" />
                  </div>
                  <div className="bg-[var(--bg-secondary)] px-4 py-3 rounded-2xl rounded-tl-sm">
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">生成中...</span>
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
            <form onSubmit={handleSubmit} className="p-6 border-t border-[var(--border)] bg-[var(--bg-secondary)]/50">
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
                {loading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex-shrink-0 px-5 py-3 rounded-xl bg-orange-500 text-white hover:shadow-lg hover:shadow-orange-500/30 transition-all flex items-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span className="hidden sm:inline">停止</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="flex-shrink-0 px-6 py-3 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[#6366f1]/30 transition-all flex items-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    <span className="hidden sm:inline">发送</span>
                  </button>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <PromptTemplates onSelect={handleSelectTemplate} disabled={loading} />
                  {inputTokens > 0 && (
                    <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                      ~{inputTokens} tokens
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  按 Enter 发送，Shift + Enter 换行
                </p>
              </div>
            </form>
          </motion.div>

          {/* 能力说明 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {[
              {
                icon: Sparkles,
                gradient: "from-blue-500 to-cyan-500",
                title: "多模型适配",
                desc: "DeepSeek / OpenAI / 硅基流动，统一 OpenAI 协议",
              },
              {
                icon: Database,
                gradient: "from-green-500 to-emerald-500",
                title: "向量检索",
                desc: "浏览器内 ONNX 推理 + 余弦相似度召回",
              },
              {
                icon: Coins,
                gradient: "from-purple-500 to-pink-500",
                title: "用量可见",
                desc: "实时 token 统计与成本估算",
              },
              {
                icon: Square,
                gradient: "from-orange-500 to-amber-500",
                title: "随时中断",
                desc: "AbortController 精确取消，保留已生成内容",
              },
            ].map(({ icon: Icon, gradient, title, desc }) => (
              <div key={title} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
                <div
                  className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-3`}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
