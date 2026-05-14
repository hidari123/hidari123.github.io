/*
 * @Author: hidari
 * @Date: 2026-05-14 09:54
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:28:20
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Loader2, AlertCircle } from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { generateSummary } from "@/services/aiService";

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

  const handleGenerateSummary = useCallback(async () => {
    // 检查配置
    if (!checkConfig()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const config = getCurrentConfig();
      if (!config.apiKey) {
        throw new Error("请先配置 API Key");
      }
      const result = await generateSummary(content, {
        ...config,
        apiKey: config.apiKey,
      });
      setSummary(result);
      setShowSummary(true);
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
              <span>✨ AI 摘要</span>
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
