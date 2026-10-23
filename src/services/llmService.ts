/*
 * @Author: hidari
 * @Date: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

/**
 * LLM 会话引擎
 *
 * 这层把「调 API」和「做产品」之间的工程件补齐：
 *   - 流式解析：SSE 按行缓冲（网络分片会切断 JSON，原实现会静默丢 token）
 *   - 可中断：AbortController，用户随时能停
 *   - token 计费：解析 usage，实时显示成本
 *   - 参数控制：temperature / max_tokens / top_p 可调
 *   - 会话持久化：多轮上下文按 token 预算裁剪
 *   - 结构化输出：JSON Schema 约束（部分厂商支持）
 *
 * 设计原则：纯函数为主，UI 无关，方便单测。
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LLMParams {
  /** 采样温度。0 = 确定性，1+ = 发散 */
  temperature: number;
  /** 单次回复的最大 token 数 */
  maxTokens: number;
  /** 核采样 */
  topP: number;
  /** 是否启用流式 */
  stream: boolean;
}

export const DEFAULT_PARAMS: LLMParams = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
  stream: true,
};

export interface ProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamCallbacks {
  /** 每收到一段增量文本 */
  onChunk?: (text: string) => void;
  /** 流式结束 */
  onComplete?: (full: string, usage?: Usage) => void;
  /** 出错 */
  onError?: (error: Error) => void;
  /** 拿到 usage（部分厂商在最后一个 chunk 里才给） */
  onUsage?: (usage: Usage) => void;
}

/**
 * SSE 行解析器
 *
 * 网络分片和 SSE 的事件边界不对齐是常态：一段 JSON 完全可能横跨两个 chunk。
 * 直接 chunk.split("\n") 会丢掉每段末尾那个不完整的行，JSON.parse 失败后
 * 被 catch 吞掉 —— 表现为「回答里莫名其妙少几个字」。
 *
 * 正确做法是把不完整的行留在缓冲区里，等下一个 chunk 补齐再处理。
 */
export class SSELineBuffer {
  private buffer = "";

  /** 喂入一段原始数据，返回本次可以完整解析的行 */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    // 最后一段可能不完整，留到下次
    this.buffer = lines.pop() ?? "";
    return lines;
  }

  /** 流结束时把缓冲区里剩下的内容吐出来 */
  flush(): string[] {
    if (!this.buffer) return [];
    const rest = [this.buffer];
    this.buffer = "";
    return rest;
  }
}

/** 从 SSE 的 data 行里取出 payload */
export function parseSSEData(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  return data;
}

/**
 * 从 OpenAI 兼容响应里抽取 usage。
 * 不同厂商位置不一样：有的在最后一个 chunk，有的在响应头，这里都试。
 */
export function extractUsage(json: any): Usage | undefined {
  const u = json?.usage;
  if (!u) return undefined;

  const promptTokens = u.prompt_tokens ?? u.input_tokens ?? 0;
  const completionTokens = u.completion_tokens ?? u.output_tokens ?? 0;
  const totalTokens = u.total_tokens ?? promptTokens + completionTokens;

  if (!promptTokens && !completionTokens && !totalTokens) return undefined;

  return { promptTokens, completionTokens, totalTokens };
}

/** 从 chunk 里抽取增量文本 */
export function extractDelta(json: any): string {
  const choice = json?.choices?.[0];
  // OpenAI 兼容协议
  if (typeof choice?.delta?.content === "string") return choice.delta.content;
  // 少数厂商用 text
  if (typeof choice?.text === "string") return choice.text;
  // Anthropic 风格
  if (typeof json?.delta?.text === "string") return json.delta.text;
  return "";
}

/** 从 chunk 里抽取停止原因 */
export function extractFinishReason(json: any): string | undefined {
  return json?.choices?.[0]?.finish_reason ?? json?.stop_reason ?? undefined;
}

/**
 * 粗略估算 token 数。
 *
 * 服务端没返回 usage 时的兜底：中文约 1.5 字/token，英文约 4 字符/token。
 * 只用于界面上的「大致用量」提示，不参与计费计算。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk / 1.5 + other / 4);
}

/**
 * 按预算裁剪历史消息。
 *
 * LLM 的上下文窗口是有限资源，聊天越久越贵、越慢。策略：
 *   - system 消息永远保留（它定义角色）
 *   - 从最老的历史开始丢，直到总长度落进预算
 *   - 至少保留最近一条，保证对话连贯
 */
export function trimMessagesToBudget(
  messages: ChatMessage[],
  budgetTokens: number,
): { kept: ChatMessage[]; dropped: number } {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  let total = system.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const kept: ChatMessage[] = [];

  // 从新到旧保留，超预算就停
  for (let i = rest.length - 1; i >= 0; i--) {
    const cost = estimateTokens(rest[i].content);
    if (total + cost > budgetTokens && kept.length > 0) break;
    kept.unshift(rest[i]);
    total += cost;
  }

  return { kept: [...system, ...kept], dropped: rest.length - kept.length };
}

/**
 * 单次对话请求。
 *
 * @param abort 用于中断：调用方持有 AbortController，abort 后流会停。
 */
export async function streamChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  params: LLMParams = DEFAULT_PARAMS,
  callbacks: StreamCallbacks = {},
  abort?: AbortSignal,
): Promise<{ content: string; usage?: Usage; finishReason?: string }> {
  const { baseURL, apiKey, model } = config;
  const url = `${baseURL.replace(/\/$/, "")}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: params.stream,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    top_p: params.topP,
  };

  // 部分厂商支持 stream_options 拿 usage，不支持的话会忽略未知字段
  if (params.stream) {
    body.stream_options = { include_usage: true };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: abort,
    });
  } catch (err) {
    // 用户主动取消不算错误
    if (err instanceof DOMException && err.name === "AbortError") {
      const e = new Error("已停止生成");
      e.name = "AbortError";
      callbacks.onError?.(e);
      return { content: "" };
    }
    const e = err instanceof Error ? err : new Error("网络请求失败");
    callbacks.onError?.(e);
    throw e;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg =
      errorData.error?.message || `API 请求失败: ${response.status} ${response.statusText}`;
    const e = new Error(msg);
    callbacks.onError?.(e);
    throw e;
  }

  if (!response.body) {
    const e = new Error("响应体为空");
    callbacks.onError?.(e);
    throw e;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const lineBuffer = new SSELineBuffer();

  let full = "";
  let usage: Usage | undefined;
  let finishReason: string | undefined;

  const handleLine = (line: string) => {
    const data = parseSSEData(line);
    if (data === null) return;

    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      // 单行解析失败不影响后续，丢弃即可（完整的一行不该解析失败，
      // 出现这种通常是厂商发了非 JSON 的注释行）
      return;
    }

    const u = extractUsage(json);
    if (u) {
      usage = u;
      callbacks.onUsage?.(u);
    }

    const reason = extractFinishReason(json);
    if (reason) finishReason = reason;

    const delta = extractDelta(json);
    if (delta) {
      full += delta;
      callbacks.onChunk?.(delta);
    }
  };

  try {
    while (true) {
      // 主动检查中断信号。
      // 不能只依赖 fetch 抛 AbortError：部分实现（包括流式代理、
      // 某些 mock）不会把信号传播到底层 reader，导致「停止」按钮点了没反应。
      if (abort?.aborted) {
        callbacks.onComplete?.(full, usage);
        return { content: full, usage, finishReason: "aborted" };
      }

      const { done, value } = await reader.read();

      if (done) {
        // 把缓冲区里最后的残行处理掉
        for (const line of lineBuffer.flush()) handleLine(line);
        callbacks.onComplete?.(full, usage);
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      for (const line of lineBuffer.push(chunk)) handleLine(line);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // 中断：保留已经生成的内容，不当作错误
      callbacks.onComplete?.(full, usage);
      return { content: full, usage, finishReason: "aborted" };
    }
    const e = err instanceof Error ? err : new Error("流式响应中断");
    callbacks.onError?.(e);
    throw e;
  }

  return { content: full, usage, finishReason };
}

/**
 * 非流式请求：一次性拿到完整回复。
 * 用于摘要、标题生成这类不需要逐字显示的场景。
 */
export async function completeChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  params: Partial<LLMParams> = {},
): Promise<{ content: string; usage?: Usage }> {
  const merged: LLMParams = { ...DEFAULT_PARAMS, ...params, stream: false };
  const result = await streamChat(messages, config, merged, {});
  return { content: result.content, usage: result.usage };
}
