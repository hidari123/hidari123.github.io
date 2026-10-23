/*
 * @Author: hidari
 * @Date: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { Coins, Activity } from "lucide-react";
import type { Usage } from "@/services/llmService";

interface UsageMeterProps {
  usage: Usage | null;
  /** 本次会话累计消耗 */
  total: Usage | null;
  /** 每百万 token 的价格（美元），用于估算成本 */
  pricePerMillion?: { prompt: number; completion: number };
}
/**
 * Token 用量与成本估算
 *
 * 这是「像在做产品」和「只是在调接口」的分界线：
 * 真实用户关心花了多少钱，真实团队关心上下文还能装多少。
 *
 * 价格表是公开报价，实际账单以服务商后台为准，这里只做量级估算。
 */
const PRICE_TABLE: Record<string, { prompt: number; completion: number }> = {
  "deepseek-chat": { prompt: 0.14, completion: 0.28 },
  "deepseek-reasoner": { prompt: 0.55, completion: 2.19 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4o": { prompt: 2.5, completion: 10 },
  "o3-mini": { prompt: 1.1, completion: 4.4 },
};

function estimateCost(
  usage: Usage | null,
  model: string,
  override?: { prompt: number; completion: number },
): number {
  if (!usage) return 0;
  const price = override ?? PRICE_TABLE[model];
  if (!price) return 0;
  return (
    (usage.promptTokens / 1_000_000) * price.prompt +
    (usage.completionTokens / 1_000_000) * price.completion
  );
}

export const UsageMeter = ({ usage, total }: UsageMeterProps) => {
  if (!usage && !total) return null;

  const prompt = usage?.promptTokens ?? 0;
  const completion = usage?.completionTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? 0;

  return (
    <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30">
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Activity className="w-3.5 h-3.5" />
          本次
          <span className="font-mono text-[var(--text-primary)]">
            ↑{prompt} ↓{completion}
          </span>
        </span>

        {total && (
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <Coins className="w-3.5 h-3.5" />
            累计
            <span className="font-mono text-[var(--text-primary)]">
              {total.totalTokens.toLocaleString()} tokens
            </span>
          </span>
        )}
      </div>

      {/* token 占比条：输入 vs 输出 */}
      {totalTokens > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--border)]">
            <div
              className="h-full bg-[#6366f1] transition-all duration-300"
              style={{ width: `${(prompt / totalTokens) * 100}%` }}
            />
            <div
              className="h-full bg-[#8b5cf6] transition-all duration-300"
              style={{ width: `${(completion / totalTokens) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono shrink-0">
            {totalTokens.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};

/** 导出成本估算，供会话统计使用 */
export { estimateCost };
