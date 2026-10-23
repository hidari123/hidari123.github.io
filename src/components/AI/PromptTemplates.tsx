/*
 * @Author: hidari
 * @Date: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState } from "react";
import { Wand2, X } from "lucide-react";

/**
 * 提示词模板
 *
 * 真实产品不会让用户每次从零写 prompt。这里预置几个高频场景，
 * 点击即插入到输入框，用户可以在此基础上继续改。
 */
export interface PromptTemplate {
  id: string;
  label: string;
  /** 插入到输入框的文本 */
  prompt: string;
  description: string;
  /** 建议的 temperature */
  temperature?: number;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "explain",
    label: "解释概念",
    description: "用一个类比讲清楚技术概念",
    prompt: "请用一个生活化的类比解释 ",
    temperature: 0.5,
  },
  {
    id: "review",
    label: "代码评审",
    description: "从可读性、性能、边界条件三个维度审代码",
    prompt:
      "请从可读性、性能、边界条件三个维度评审下面的代码，指出问题并给出改进建议：\n\n```\n",
    temperature: 0.3,
  },
  {
    id: "architecture",
    label: "架构设计",
    description: "针对某个技术问题给出方案与取舍",
    prompt: "针对以下问题，给出技术方案、关键取舍和实现要点：\n\n",
    temperature: 0.6,
  },
  {
    id: "summarize",
    label: "总结要点",
    description: "把长内容压缩成要点列表",
    prompt: "请把下面的内容总结成不超过 5 条要点，每条一行：\n\n",
    temperature: 0.3,
  },
  {
    id: "debug",
    label: "排查问题",
    description: "给出定位思路和验证步骤",
    prompt: "下面的代码/现象有问题，请给出排查思路和验证步骤：\n\n",
    temperature: 0.3,
  },
  {
    id: "compare",
    label: "方案对比",
    description: "横向对比多个技术选项",
    prompt: "请对比以下几种方案，给出推荐结论和理由：\n\n",
    temperature: 0.5,
  },
];

interface PromptTemplatesProps {
  onSelect: (template: PromptTemplate) => void;
  disabled?: boolean;
}

export const PromptTemplates = ({ onSelect, disabled }: PromptTemplatesProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors disabled:opacity-50"
        aria-expanded={open}
      >
        <Wand2 className="w-3.5 h-3.5" />
        提示词模板
      </button>

      {open && (
        <>
          {/* 点击空白处关闭 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute bottom-full left-0 mb-2 z-20 w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
              <span className="text-xs font-medium text-[var(--text-primary)]">选择模板</span>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                aria-label="关闭"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-1.5 max-h-72 overflow-y-auto">
              {PROMPT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelect(t);
                    setOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <div className="text-sm font-medium text-[var(--text-primary)]">{t.label}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
