/*
 * @Author: hidari
 * @Date: 2026-05-14 10:07
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:35:16
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIConfig {
  provider: {
    id: string;
    name: string;
    baseURL: string;
    defaultModel: string;
  };
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export interface StreamOptions {
  onChunk?: (text: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export async function callAI(
  messages: Message[],
  config: AIConfig,
  options?: StreamOptions,
): Promise<string> {
  const { provider, apiKey } = config;
  const baseURL = config.baseURL || provider.baseURL;
  const model = config.model || provider.defaultModel;

  const url = `${baseURL}/chat/completions`;

  const requestBody = {
    model,
    messages,
    stream: true,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `API 请求失败: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        options?.onComplete?.();
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            options?.onComplete?.();
            return fullContent;
          }

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              options?.onChunk?.(delta);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    return fullContent;
  } catch (error) {
    const err = error instanceof Error ? error : new Error("未知错误");
    options?.onError?.(err);
    throw err;
  }
}

// 生成摘要
export async function generateSummary(
  content: string,
  config: AIConfig,
  options?: StreamOptions,
): Promise<string> {
  const systemPrompt = `你是一个文章摘要助手。请根据用户提供的内容，生成一段简洁、准确的摘要，概括文章的主要内容、核心观点和重要信息。

要求：
1. 直接输出摘要内容，不要添加任何标题、标签或前缀
2. 简洁明了，一般不超过 200 字
3. 突出重点，避免无关细节
4. 使用通俗易懂的语言`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `请为以下文章生成摘要：\n\n${content}`,
    },
  ];

  return callAI(messages, config, options);
}

// 问答
export async function askQuestion(
  question: string,
  content: string,
  config: AIConfig,
  options?: StreamOptions,
): Promise<string> {
  const systemPrompt = `你是一个基于文章内容的问答助手。请根据提供的文章内容，准确回答用户的问题。如果文章中没有相关信息，请明确告知用户。回答应该：
1. 直接针对问题给出答案
2. 结合文章内容进行解释
3. 如需引用原文，请标注
4. 如果文章中没有相关信息，请如实说明`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `文章内容：\n${content}\n\n问题：${question}`,
    },
  ];

  return callAI(messages, config, options);
}

// 代码解释
export async function explainCode(
  code: string,
  config: AIConfig,
  options?: StreamOptions,
): Promise<string> {
  const systemPrompt = `你是一个代码解释助手。请详细解释用户提供的代码，包括：
1. 代码的功能和作用
2. 关键代码段的作用
3. 使用的技术或语法要点
4. 代码的执行流程
5. 如果有优化建议，也请提出`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `请解释以下代码：\n\n\`\`\`\n${code}\n\`\`\``,
    },
  ];

  return callAI(messages, config, options);
}
