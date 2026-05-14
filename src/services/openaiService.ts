/*
 * @Author: hidari
 * @Date: 2026-05-14 09:54
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:00:01
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

const API_URL = "https://api.openai.com/v1/chat/completions";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface StreamCallback {
  (content: string): void;
}

// 系统提示词
const SYSTEM_PROMPTS = {
  summary: `你是一个专业的文章摘要助手。请为用户提供的中文文章生成简洁、准确的摘要。
要求：
1. 摘要长度控制在 100-200 字之间
2. 保留文章的核心内容和主要观点
3. 使用流畅的中文表达
4. 直接输出摘要，不要有前缀或说明`,

  qa: `你是一个智能问答助手，基于文章内容回答用户的问题。
要求：
1. 只基于提供的文章内容进行回答
2. 如果文章中没有相关信息，请明确说明
3. 回答要准确、简洁、有条理
4. 使用流畅的中文表达`,

  codeExplain: `你是一个专业的代码解释助手。请解释用户提供的代码片段。
要求：
1. 解释代码的功能和用途
2. 解释关键代码段的工作原理
3. 指出代码中值得注意的点
4. 使用流畅的中文表达`,

  codeExplainWithContext: `你是一个专业的代码解释助手。请解释用户提供的代码片段。
要求：
1. 结合文章上下文解释代码的功能和用途
2. 解释关键代码段的工作原理
3. 指出代码中值得注意的点
4. 使用流畅的中文表达`,
};

class OpenAIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 发送请求到 OpenAI API
   */
  private async sendRequest(
    messages: Message[],
    stream: boolean = false,
    onChunk?: StreamCallback,
  ): Promise<string> {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages,
        stream,
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `API 请求失败 (${response.status})`;
      throw new Error(errorMessage);
    }

    if (stream && response.body && onChunk) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      return fullContent;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }

  /**
   * 生成文章摘要
   */
  async generateSummary(content: string): Promise<string> {
    const truncatedContent = content.slice(0, 8000);

    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPTS.summary },
      {
        role: "user",
        content: `请为以下文章生成摘要：\n\n${truncatedContent}`,
      },
    ];

    return this.sendRequest(messages);
  }

  /**
   * 生成文章摘要（流式）
   */
  async generateSummaryStream(content: string, onChunk: StreamCallback): Promise<string> {
    const truncatedContent = content.slice(0, 8000);

    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPTS.summary },
      {
        role: "user",
        content: `请为以下文章生成摘要：\n\n${truncatedContent}`,
      },
    ];

    return this.sendRequest(messages, true, onChunk);
  }

  /**
   * 基于文章内容问答
   */
  async askQuestion(question: string, content: string): Promise<string> {
    const truncatedContent = content.slice(0, 8000);

    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPTS.qa },
      {
        role: "user",
        content: `以下是文章内容：\n\n${truncatedContent}\n\n问题是：${question}`,
      },
    ];

    return this.sendRequest(messages);
  }

  /**
   * 基于文章内容问答（流式）
   */
  async askQuestionStream(
    question: string,
    content: string,
    onChunk: StreamCallback,
  ): Promise<string> {
    const truncatedContent = content.slice(0, 8000);

    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPTS.qa },
      {
        role: "user",
        content: `以下是文章内容：\n\n${truncatedContent}\n\n问题是：${question}`,
      },
    ];

    return this.sendRequest(messages, true, onChunk);
  }

  /**
   * 解释代码
   */
  async explainCode(code: string): Promise<string> {
    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPTS.codeExplain },
      { role: "user", content: `请解释以下代码：\n\n\`\`\`\n${code}\n\`\`\`` },
    ];

    return this.sendRequest(messages);
  }

  /**
   * 解释代码（流式）
   */
  async explainCodeStream(code: string, onChunk: StreamCallback): Promise<string> {
    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPTS.codeExplain },
      { role: "user", content: `请解释以下代码：\n\n\`\`\`\n${code}\n\`\`\`` },
    ];

    return this.sendRequest(messages, true, onChunk);
  }
}

// 导出单例
let openAIServiceInstance: OpenAIService | null = null;

export function getOpenAIService(apiKey: string): OpenAIService {
  if (!openAIServiceInstance) {
    openAIServiceInstance = new OpenAIService(apiKey);
  }
  return openAIServiceInstance;
}

export { OpenAIService };
