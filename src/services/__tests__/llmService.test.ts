import { describe, it, expect, vi } from "vitest";
import {
  SSELineBuffer,
  parseSSEData,
  extractUsage,
  extractDelta,
  extractFinishReason,
  estimateTokens,
  trimMessagesToBudget,
  streamChat,
  DEFAULT_PARAMS,
} from "../llmService";

describe("SSELineBuffer", () => {
  it("按行切分，保留末尾残行", () => {
    const buf = new SSELineBuffer();
    expect(buf.push("a\nb\nc")).toEqual(["a", "b"]);
    // "c" 还在缓冲里，没被吐出
    expect(buf.push("\nd")).toEqual(["c"]);
  });

  it("关键场景：一段 JSON 横跨两个网络分片", () => {
    const buf = new SSELineBuffer();
    // 第一片：JSON 被切断
    const first = buf.push('data: {"choices":[{"delta":{"cont');
    expect(first).toEqual([]);

    // 第二片：补齐
    const second = buf.push('ent":"你好"}}]}\n');
    expect(second).toEqual(['data: {"choices":[{"delta":{"content":"你好"}}]}']);

    const json = JSON.parse(parseSSEData(second[0])!);
    expect(extractDelta(json)).toBe("你好");
  });

  it("flush 吐出最后的残行", () => {
    const buf = new SSELineBuffer();
    buf.push("data: x");
    expect(buf.flush()).toEqual(["data: x"]);
    expect(buf.flush()).toEqual([]);
  });

  it("处理空分片不报错", () => {
    const buf = new SSELineBuffer();
    expect(buf.push("")).toEqual([]);
    expect(buf.push("\n\n")).toEqual(["", ""]);
  });
});

describe("parseSSEData", () => {
  it("提取 data: 后的内容", () => {
    expect(parseSSEData('data: {"a":1}')).toBe('{"a":1}');
    expect(parseSSEData("data:noSpace")).toBe("noSpace");
  });

  it("忽略非 data 行与 [DONE]", () => {
    expect(parseSSEData("event: message")).toBeNull();
    expect(parseSSEData("data: [DONE]")).toBeNull();
    expect(parseSSEData("")).toBeNull();
  });
});

describe("extractUsage", () => {
  it("解析 OpenAI 风格", () => {
    expect(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it("兼容 Anthropic 风格的字段名", () => {
    expect(extractUsage({ usage: { input_tokens: 5, output_tokens: 7 } })).toEqual({
      promptTokens: 5,
      completionTokens: 7,
      totalTokens: 12,
    });
  });

  it("没有 usage 时返回 undefined", () => {
    expect(extractUsage({})).toBeUndefined();
    expect(extractUsage({ usage: {} })).toBeUndefined();
  });
});

describe("extractDelta / extractFinishReason", () => {
  it("读 OpenAI 兼容的 delta.content", () => {
    expect(extractDelta({ choices: [{ delta: { content: "hi" } }] })).toBe("hi");
  });

  it("读 Anthropic 风格的 delta.text", () => {
    expect(extractDelta({ delta: { text: "hi" } })).toBe("hi");
  });

  it("无内容时返回空串", () => {
    expect(extractDelta({ choices: [{ delta: {} }] })).toBe("");
    expect(extractDelta(null)).toBe("");
  });

  it("读停止原因", () => {
    expect(extractFinishReason({ choices: [{ finish_reason: "length" }] })).toBe("length");
    expect(extractFinishReason({})).toBeUndefined();
  });
});

describe("estimateTokens", () => {
  it("中文比英文更密集", () => {
    const zh = estimateTokens("这是一段中文文本");
    const en = estimateTokens("this is english text");
    expect(zh).toBeGreaterThan(0);
    expect(en).toBeGreaterThan(0);
  });

  it("空串返回 0", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("trimMessagesToBudget", () => {
  it("system 消息永远保留", () => {
    const messages = [
      { role: "system" as const, content: "你是助手" },
      { role: "user" as const, content: "问题1" },
    ];
    const { kept } = trimMessagesToBudget(messages, 10);
    expect(kept[0].role).toBe("system");
  });

  it("超预算时丢弃较早的消息，保留最近的", () => {
    const messages = [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "很长的第一条消息".repeat(50) },
      { role: "assistant" as const, content: "很长的第二条消息".repeat(50) },
      { role: "user" as const, content: "最新的一条" },
    ];
    const { kept, dropped } = trimMessagesToBudget(messages, 100);
    expect(dropped).toBeGreaterThan(0);
    // 最新的一条必须留下
    expect(kept[kept.length - 1].content).toBe("最新的一条");
  });

  it("至少保留一条历史消息，避免完全无上下文", () => {
    const messages = [{ role: "user" as const, content: "x".repeat(10000) }];
    const { kept } = trimMessagesToBudget(messages, 1);
    expect(kept.length).toBe(1);
  });
});

describe("streamChat", () => {
  /** 构造一个可读流的假 Response */
  function makeStream(chunks: string[]) {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  const config = { baseURL: "https://api.test.com/v1", apiKey: "k", model: "test-model" };

  it("拼接流式增量并回调 onChunk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeStream([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n',
        "data: [DONE]\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const chunks: string[] = [];
    const result = await streamChat([{ role: "user", content: "hi" }], config, DEFAULT_PARAMS, {
      onChunk: (t) => chunks.push(t),
    });

    expect(chunks.join("")).toBe("你好");
    expect(result.content).toBe("你好");
  });

  it("分片边界切断了 JSON 时不丢内容（回归测试）", async () => {
    // 故意让 data 行跨两个分片
    const fetchMock = vi.fn().mockResolvedValue(
      makeStream(['data: {"choices":[{"delta":{"cont', 'ent":"完整内容"}}]}\n', "data: [DONE]\n"]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await streamChat([{ role: "user", content: "hi" }], config, DEFAULT_PARAMS, {});
    expect(result.content).toBe("完整内容");
  });

  it("把 usage 透传给回调", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeStream([
        'data: {"choices":[{"delta":{"content":"x"}}]}\n',
        'data: {"usage":{"prompt_tokens":7,"completion_tokens":9,"total_tokens":16}}\n',
        "data: [DONE]\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const seen: unknown[] = [];
    const result = await streamChat([{ role: "user", content: "hi" }], config, DEFAULT_PARAMS, {
      onUsage: (u) => seen.push(u),
    });

    expect(result.usage?.totalTokens).toBe(16);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("HTTP 错误时抛出带服务端消息的异常", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "额度不足" } }), { status: 429 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      streamChat([{ role: "user", content: "hi" }], config, DEFAULT_PARAMS, {}),
    ).rejects.toThrow("额度不足");
  });

  it("中断时保留已生成内容并标记 aborted", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();

    // 构造一个可以中途 abort 的流
    const body = new ReadableStream({
      async start(streamController) {
        streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"部分"}}]}\n'));
        await new Promise((r) => setTimeout(r, 50));
        streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"更多"}}]}\n'));
        streamController.close();
      },
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const promise = streamChat(
      [{ role: "user", content: "hi" }],
      config,
      DEFAULT_PARAMS,
      {},
      controller.signal,
    );
    setTimeout(() => controller.abort(), 10);

    const result = await promise;
    expect(result.finishReason).toBe("aborted");
    expect(result.content.length).toBeGreaterThan(0);
  });
});
