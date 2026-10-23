/*
 * @Author: hidari
 * @Date: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState } from "react";
import { SlidersHorizontal, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { LLMParams } from "@/services/llmService";

interface ModelParamsProps {
  params: LLMParams;
  onChange: (params: LLMParams) => void;
  disabled?: boolean;
}

/**
 * 模型参数面板
 *
 * 面试时这是最容易被追问的点之一：
 *   - temperature 调高 = 更发散，适合创意；调低 = 更稳定，适合事实问答
 *   - max_tokens 直接决定成本上限和「说到一半被截断」的风险
 *   - top_p 和 temperature 是两种不同的采样策略，一般只调一个
 *
 * 暴露这些参数，等于把「我在调 API」升级成「我在用 LLM」。
 */
export const ModelParams = ({ params, onChange, disabled }: ModelParamsProps) => {
  const [open, setOpen] = useState(false);

  const update = (patch: Partial<LLMParams>) => onChange({ ...params, ...patch });

  return (
    <div className="border-b border-[var(--border)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)]/50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          <SlidersHorizontal className="w-4 h-4" />
          模型参数
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">
            T={params.temperature.toFixed(1)} · {params.maxTokens} tokens
          </span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-4">
          {/* 温度 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="param-temp" className="text-xs font-medium text-[var(--text-primary)]">
                温度 Temperature
              </label>
              <span className="text-xs text-[var(--text-secondary)] font-mono">
                {params.temperature.toFixed(1)}
              </span>
            </div>
            <input
              id="param-temp"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={params.temperature}
              disabled={disabled}
              onChange={(e) => update({ temperature: Number(e.target.value) })}
              className="w-full accent-[#6366f1]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-0.5">
              <span>0 · 确定性</span>
              <span>1 · 平衡</span>
              <span>2 · 发散</span>
            </div>
          </div>

          {/* Top P */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="param-topp" className="text-xs font-medium text-[var(--text-primary)]">
                核采样 Top P
              </label>
              <span className="text-xs text-[var(--text-secondary)] font-mono">
                {params.topP.toFixed(2)}
              </span>
            </div>
            <input
              id="param-topp"
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={params.topP}
              disabled={disabled}
              onChange={(e) => update({ topP: Number(e.target.value) })}
              className="w-full accent-[#6366f1]"
            />
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">
              与温度是两种采样策略，通常只调其一
            </p>
          </div>

          {/* Max Tokens */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="param-maxtokens"
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                最大回复长度 Max Tokens
              </label>
              <span className="text-xs text-[var(--text-secondary)] font-mono">
                {params.maxTokens}
              </span>
            </div>
            <input
              id="param-maxtokens"
              type="range"
              min={256}
              max={8192}
              step={256}
              value={params.maxTokens}
              disabled={disabled}
              onChange={(e) => update({ maxTokens: Number(e.target.value) })}
              className="w-full accent-[#6366f1]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-0.5">
              <span>256</span>
              <span>8192</span>
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed border-l-2 border-[var(--accent)]/40 pl-2">
            <Sparkles className="w-3 h-3 inline mr-1 align-middle" />
            温度调高适合头脑风暴与创作，调低适合事实问答与代码生成。max_tokens
            同时决定了单次成本上限，设得太小会导致回答被截断。
          </p>
        </div>
      )}
    </div>
  );
};
