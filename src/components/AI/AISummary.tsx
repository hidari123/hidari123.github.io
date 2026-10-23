/*
 * @Author: hidari
 * @Date: 2026-05-14 09:54
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-27 14:59:07
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Loader2, AlertCircle } from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { generateSummary } from "@/services/aiService";

const SUMMARY_CACHE_KEY = "ai_summary_cache_v1";
const SUMMARY_CACHE_MAX = 40;

interface SummaryCache {
  [contentHash: string]: string;
}

/** 用内容的简单哈希做 key：文章改了缓存自然失效 */
function contentKey(content: string): string {
  // 取首尾 + 长度：正文中间的改动不会改变摘要，但整体长度会变。
  // 比起全文哈希，弱一点但快得多，而且对「改了正文」这个场景足够。
  const head = content.slice(0, 200);
  const tail = content.slice(-200);
  const raw = `${content.length}:${head}:${tail}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return (hash >>> 0).toString(36);
}

function readCache(): SummaryCache {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SUMMARY_CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: SummaryCache): void {
  if (typeof localStorage === "undefined") return;
  try {
    const keys = Object.keys(cache);
    // 超过上限就按插入顺序丢最早的（JSON 对象保序）
    if (keys.length > SUMMARY_CACHE_MAX) {
      const trimmed: SummaryCache = {};
      for (const k of keys.slice(-SUMMARY_CACHE_MAX)) trimmed[k] = cache[k];
      cache = trimmed;
    }
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 配额满就算了，下次重新生成
  }
}

interface AISummaryProps {
  content: string;
  onApiKeyRequired?: () => void;
}

export const AISummary = ({ content }: AISummaryProps) => {
  const { checkConfig, getCurrentConfig } = useAIProvider();
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(true);
  /** 来自缓存的摘要：标签上标一下，让读者知道不是刚生成的 */
  const [fromCache, setFromCache] = useState(false);

  // 换文章时先试缓存：同样一篇看第二遍不该再烧一次 API
  useEffect(() => {
    const cached = readCache()[contentKey(content)];
    if (cached) {
      setSummary(cached);
      setFromCache(true);
      setShowSummary(true);
    } else {
      setSummary(null);
      setFromCache(false);
    }
    setError(null);
  }, [content]);

  const handleGenerateSummary = useCallback(async () => {
    // 检查配置
    if (!checkConfig()) {
      return;
    }

    setLoading(true);
    setError(null);
    setFromCache(false);

    try {
      const config = getCurrentConfig();
      if (!config.apiKey) {
        throw new Error("请先配置 API Key");
      }
      // 先设置空摘要占位
      setSummary("");
      setShowSummary(true);

      const result = await generateSummary(
        content,
        {
          ...config,
          apiKey: config.apiKey,
        },
        {
          onChunk: (chunk) => {
            setSummary((prev) => (prev || "") + chunk);
          },
          onComplete: () => {
            // 流式完成
          },
          onError: (err) => {
            setError(err.message);
          },
        },
      );
      // 确保最终内容完整
      setSummary(result);

      // 写回缓存：同一篇再看一次直接命中，不用再调一次 API
      const cache = readCache();
      cache[contentKey(content)] = result;
      writeCache(cache);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "生成摘要失败，请重试";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [content, checkConfig, getCurrentConfig]);

  return (
    <>
      <div className="mb-8">
        {/* 按钮 */}
        <motion.button
          onClick={handleGenerateSummary}
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-medium shadow-lg shadow-[#6366f1]/20 hover:shadow-xl hover:shadow-[#6366f1]/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>生成中...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>AI 摘要</span>
            </>
          )}
        </motion.button>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 摘要显示 */}
        <AnimatePresence>
          {summary && showSummary && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-5 rounded-xl bg-gradient-to-r from-[#6366f1]/5 to-[#8b5cf6]/5 border border-[#6366f1]/20"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[#6366f1]">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm font-medium">AI 摘要</span>
                  {fromCache && (
                    <span className="text-xs text-[var(--text-secondary)] font-normal">
                      （缓存）
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowSummary(false)}
                  className="p-1 rounded hover:bg-[#6366f1]/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">{summary}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
