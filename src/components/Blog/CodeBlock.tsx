/*
 * @Author: hidari
 * @Date: 2026-05-14 09:54
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 09:54
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Loader2, X, Bot, AlertCircle } from "lucide-react";
import { useOpenAIKey } from "@/hooks/useOpenAIKey";
import { getOpenAIService } from "@/services/openaiService";
import { ApiKeyModal } from "../AI/ApiKeyModal";

interface CodeBlockProps {
  code: string;
  language: string;
}

export const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const { apiKey, saveApiKey, showApiKeyModal, setShowApiKeyModal } = useOpenAIKey();
  const [copied, setCopied] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  }, [code]);

  const handleExplain = async () => {
    if (!apiKey) {
      setShowApiKeyModal(true);
      return;
    }

    setExplaining(true);
    setError(null);
    setShowExplanation(true);

    try {
      const service = getOpenAIService(apiKey);
      const result = await service.explainCode(code);
      setExplanation(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "解释生成失败，请重试";
      setError(errorMessage);
    } finally {
      setExplaining(false);
    }
  };

  const handleSaveApiKey = (key: string) => {
    saveApiKey(key);
    setTimeout(() => {
      setExplaining(true);
      setError(null);
      const service = getOpenAIService(key);
      service
        .explainCode(code)
        .then((result) => {
          setExplanation(result);
          setShowExplanation(true);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "解释生成失败");
        })
        .finally(() => setExplaining(false));
    }, 100);
  };

  return (
    <>
      <div className="code-block-wrapper group relative">
        {language && <span className="code-lang">{language}</span>}
        <button onClick={handleCopy} className="copy-button" title="复制代码">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          onClick={handleExplain}
          disabled={explaining}
          className="ai-explain-button"
          title="AI 解释"
        >
          {explaining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          <span>🤖 解释</span>
        </button>
        <pre>
          <code className={`language-${language}`}>{code}</code>
        </pre>
      </div>

      <AnimatePresence>
        {showExplanation && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowExplanation(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-[#6366f1]" />
                    <h3 className="font-semibold text-[var(--text-primary)]">代码解释</h3>
                  </div>
                  <button
                    onClick={() => setShowExplanation(false)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="px-6 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-2">
                    <span>原始代码</span>
                    {language && (
                      <>
                        <span>|</span>
                        <span className="uppercase">{language}</span>
                      </>
                    )}
                  </div>
                  <pre className="text-sm text-[var(--text-primary)] overflow-x-auto">
                    <code>
                      {code.slice(0, 200)}
                      {code.length > 200 ? "..." : ""}
                    </code>
                  </pre>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {explaining ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#6366f1]" />
                      <span className="ml-2 text-[var(--text-secondary)]">正在解释代码...</span>
                    </div>
                  ) : error ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500">
                      <AlertCircle className="w-5 h-5" />
                      <span>{error}</span>
                    </div>
                  ) : explanation ? (
                    <div className="prose prose-sm max-w-none">
                      <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                        {explanation}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSave={handleSaveApiKey}
      />
    </>
  );
};
