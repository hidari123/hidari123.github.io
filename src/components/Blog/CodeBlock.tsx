/*
 * @Author: hidari
 * @Date: 2026-05-14 09:54
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-27 14:59:44
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useCallback, useEffect } from "react";
import { Copy, Check, Loader2, X, Bot, AlertCircle } from "lucide-react";
import { useAIProvider } from "@/hooks/useAIProvider";
import { explainCode } from "@/services/aiService";
import { Modal } from "@/components/Common/Modal";
import { highlightCode } from "@/utils/prismHighlight";

interface CodeBlockProps {
  code: string;
  language: string;
}

export const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const { checkConfig, getCurrentConfig } = useAIProvider();
  const [copied, setCopied] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Prism 高亮。

    原来是直接渲染 {code} 纯文本，而 package.json 里的 prismjs、globals.css 里
    两套完整的 .token 主题色全都闲在那儿——主题写了，从没被触发过。

    先渲纯文本、再异步替换成高亮，而不是等高亮完成再显示：
    代码块一出现就是完整的（文章可读性不能挂在一个 chunk 上），
    prism 到位后无感替换。
  */
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    highlightCode(code, language).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

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
    if (!checkConfig()) {
      return;
    }

    const config = getCurrentConfig();
    if (!config.apiKey) {
      return;
    }

    setExplaining(true);
    setError(null);
    setShowExplanation(true);
    setExplanation("");

    try {
      const result = await explainCode(
        code,
        {
          ...config,
          apiKey: config.apiKey,
        },
        {
          onChunk: (chunk) => {
            setExplanation((prev) => (prev || "") + chunk);
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
      setExplanation(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "解释生成失败，请重试";
      setError(errorMessage);
    } finally {
      setExplaining(false);
    }
  };

  return (
    <>
      {/*
        顶部工具条：语言标签在左，复制/解释按钮在右（ml-auto）。

        为什么不再把三个控件各自 position:absolute 挂在右上角：
        那样写它们互不知情，实测三个芯片交叠 1142/544/326 px²，
        且 ai-explain-button 把另外两个盖掉了（z-index 都是 1，靠 DOM 顺序决胜），
        复制按钮和语言标签实际点不到。

        现在工具条自己占一行，按钮不再压在代码文字上 ——
        「解释按钮位置偏高、顶到 TS 标识」是同一个问题的表现，一并消失。
      */}
      <div className="code-block-wrapper">
        <div className="code-toolbar">
          {language && <span className="code-lang">{language}</span>}
          <div className="code-actions">
            <button onClick={handleCopy} className="copy-button" title="复制代码">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleExplain}
              disabled={explaining}
              className="ai-explain-button"
              title="AI 解释"
            >
              {explaining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
              <span>解释</span>
            </button>
          </div>
        </div>
        <pre>
          <code
            className={`language-${language}`}
            /*
              html 为 null 时先走纯文本分支；不为 null 才注入。
              code 来自 public/blogs 下的静态文章文件（进版本库，无用户输入），
              所以 HTML 注入面可控。
            */
            dangerouslySetInnerHTML={html ? { __html: html } : undefined}
          >
            {html ? undefined : code}
          </code>
        </pre>
      </div>

      <Modal
        isOpen={showExplanation}
        onClose={() => setShowExplanation(false)}
        maxHeightClassName="max-h-[80vh]"
      >
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
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
      </Modal>
    </>
  );
};
