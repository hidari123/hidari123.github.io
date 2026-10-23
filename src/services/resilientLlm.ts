/**
 * 带降级的流式调用
 *
 * 拿 keyPool 的候选链包一层 streamChat：某个供应商不通就自动换下一个，
 * 直到有结果或者候选全部试完。
 *
 * 最关键的一条：**一旦某个候选已经吐过内容，就不再降级**。
 * 流式响应中途失败时把已输出的部分留着当结果返回，而不是切换供应商——
 * 两段不同模型的输出拼在一起，用户看到的是自相矛盾的回答，
 * 比直接报错更糟。这条比「降级成功率」重要。
 */

import {
  streamChat,
  type ChatMessage,
  type LLMParams,
  type ProviderConfig,
  type StreamCallbacks,
  type Usage,
} from "./llmService";
import {
  beginCall,
  isFailoverError,
  markCredentialFailed,
  markCredentialSuccess,
  nextCredential,
  peekNextCredential,
} from "./keyPool";

export interface ResilientStreamResult {
  content: string;
  usage?: Usage;
  finishReason?: string;
  /** 最终生效的凭据，用于在 UI 上显示「实际用的是 DeepSeek」 */
  usedProviderId?: string;
  /** 中途换过供应商时为 true */
  switched: boolean;
}

/**
 * 带降级的流式请求。
 *
 * @param preferredProviderId 首选供应商 id，会被排到候选链最前面
 * @param onSwitch 发生降级时的回调，用于提示用户「DeepSeek 不通，已切到 SiliconFlow」
 */
export async function streamChatWithFailover(
  messages: ChatMessage[],
  preferredProviderId: string | undefined,
  params: LLMParams,
  callbacks: StreamCallbacks = {},
  abort?: AbortSignal,
  onSwitch?: (from: string, to: string, reason: string) => void,
): Promise<ResilientStreamResult> {
  beginCall();

  let switched = false;
  let lastError: Error | null = null;
  let attempted = 0;

  // while(true) + 手动 break：候选数有限，用 for 反而要提前算长度
  for (;;) {
    if (abort?.aborted) {
      return { content: "", finishReason: "aborted", switched };
    }

    const cred = nextCredential(preferredProviderId);
    if (!cred) break;
    attempted += 1;

    // 本次尝试是否已经输出过内容。一旦为 true 就不再降级。
    let emitted = false;

    const config: ProviderConfig = {
      baseURL: cred.baseURL,
      apiKey: cred.apiKey,
      model: cred.model,
    };

    // 把 onChunk 包一层：既要转发给上层，又要知道自己吐过没有
    const guardedCallbacks: StreamCallbacks = {
      ...callbacks,
      onChunk: (delta: string) => {
        if (delta) emitted = true;
        callbacks.onChunk?.(delta);
      },
      // 上层看到的 error 只在「不再降级」时才有意义，
      // 中途失败的对上层静默，等降级结果出来再说
      onError: callbacks.onError,
    };

    try {
      const result = await streamChat(messages, config, params, guardedCallbacks, abort);

      markCredentialSuccess(cred);

      return {
        ...result,
        usedProviderId: cred.providerId,
        switched,
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));

      // 用户主动取消：直接返回已生成的部分，不降级
      if (abort?.aborted || (e.name === "AbortError" && attempted === 1)) {
        return {
          content: callbacks.onChunk ? "" : "",
          finishReason: "aborted",
          switched,
        };
      }

      // 已经吐过内容了：换供应商会把两段回答拼起来，不换。
      // finishReason 标成 interrupted，由上层决定怎么提示。
      if (emitted) {
        return {
          content: "",
          finishReason: "interrupted",
          usedProviderId: cred.providerId,
          switched,
        };
      }

      // 这个错误换 key 修不好（400/404/5xx 之类），直接抛
      if (!isFailoverError(e)) {
        markCredentialFailed(cred);
        throw e;
      }

      markCredentialFailed(cred);
      lastError = e;

      // 先看还有没有下一个，有才提示，避免告诉用户「切到 X」然后并没有
      const peek = peekNextCredential(preferredProviderId);
      if (peek) {
        switched = true;
        onSwitch?.(cred.providerId, peek.providerId, e.message);
      }
    }
  }

  throw lastError ?? new Error("没有可用的 API 凭据，请先在设置里配置");
}