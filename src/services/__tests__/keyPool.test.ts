/**
 * 降级策略测试
 *
 * 这套逻辑的价值全在「什么时候不该降级」上，所以负向用例比正向多：
 * 盲目降级会把一次真实的配置错误刷成三段错误提示，还白白烧三次额度。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { isFailoverError } from "../keyPool";
import { AI_PROVIDERS } from "@/config/aiProviders";
import {
  beginCall,
  buildCredentialChain,
  getProviderKeys,
  nextCredential,
  peekNextCredential,
  registerProviders,
  setProviderKeys,
} from "../keyPool";

describe("降级错误判定", () => {
  it("401/402/403/408/429 值得换 key", () => {
    for (const code of [401, 402, 403, 408, 429]) {
      expect(isFailoverError(new Error(`API 请求失败: ${code} Forbidden`))).toBe(true);
    }
  });

  it("400/404/422 不换 key——换多少次都是一样的错", () => {
    expect(isFailoverError(new Error("API 请求失败: 400 Bad Request"))).toBe(false);
    expect(isFailoverError(new Error("API 请求失败: 404 model not found"))).toBe(false);
    expect(isFailoverError(new Error("API 请求失败: 422 unprocessable"))).toBe(false);
  });

  it("5xx 不换——同一个服务的服务端问题，换 key 一样错", () => {
    expect(isFailoverError(new Error("API 请求失败: 500"))).toBe(false);
    expect(isFailoverError(new Error("API 请求失败: 503 Service Unavailable"))).toBe(false);
  });

  it("用户主动取消不降级", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(isFailoverError(abort)).toBe(false);
  });

  it("显式标记 noRetry 的错误不降级", () => {
    const e = new Error("401 unauthorized");
    (e as { noRetry?: boolean }).noRetry = true;
    expect(isFailoverError(e)).toBe(false);
  });

  it("网络层错误可以降级（可能绕开单家服务的网络问题）", () => {
    expect(isFailoverError(new Error("Failed to fetch"))).toBe(true);
    expect(isFailoverError(new Error("NetworkError when attempting to fetch"))).toBe(true);
  });
});

describe("Key 池", () => {
  beforeEach(() => {
    localStorage.clear();
    registerProviders(AI_PROVIDERS);
    beginCall();
  });

  it("一个供应商可以存多个 key，顺序即优先级", () => {
    setProviderKeys("deepseek", ["sk-first", "sk-second"]);
    expect(getProviderKeys("deepseek")).toEqual(["sk-first", "sk-second"]);
  });

  it("空白 key 被过滤掉", () => {
    setProviderKeys("openai", ["  sk-ok  ", "", "   "]);
    expect(getProviderKeys("openai")).toEqual(["sk-ok"]);
  });

  it("兼容旧版单 key 存储", () => {
    localStorage.setItem("ai_provider_key_deepseek", "sk-legacy");
    expect(getProviderKeys("deepseek")).toEqual(["sk-legacy"]);
  });

  it("新格式优先于旧格式", () => {
    localStorage.setItem("ai_provider_key_deepseek", "sk-legacy");
    setProviderKeys("deepseek", ["sk-new"]);
    expect(getProviderKeys("deepseek")).toEqual(["sk-new"]);
  });

  it("候选链：首选供应商排最前", () => {
    setProviderKeys("openai", ["sk-openai"]);
    setProviderKeys("deepseek", ["sk-deepseek"]);

    const chain = buildCredentialChain("deepseek");
    expect(chain[0].providerId).toBe("deepseek");
    expect(chain.some((c) => c.providerId === "openai")).toBe(true);
  });

  it("候选链：同供应商的多个 key 都在里面", () => {
    setProviderKeys("deepseek", ["sk-a", "sk-b", "sk-c"]);
    const chain = buildCredentialChain("deepseek");
    expect(chain).toHaveLength(3);
    expect(chain.map((c) => c.keyIndex)).toEqual([0, 1, 2]);
  });

  it("候选链不含没配 key 的供应商", () => {
    setProviderKeys("deepseek", ["sk-a"]);
    const chain = buildCredentialChain();
    expect(chain.every((c) => c.providerId === "deepseek")).toBe(true);
  });

  it("每个候选本次调用只会被取出一次，耗尽后返回 null", () => {
    setProviderKeys("deepseek", ["sk-a"]);
    setProviderKeys("openai", ["sk-o"]);

    const first = nextCredential();
    const second = nextCredential();

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();

    const ids = [first!, second!].map((c) => `${c.providerId}#${c.keyIndex}`);
    expect(new Set(ids).size).toBe(ids.length);

    // 两个候选取完就没了
    expect(nextCredential()).toBeNull();
  });

  it("peek 不消费候选", () => {
    setProviderKeys("deepseek", ["sk-a"]);
    setProviderKeys("openai", ["sk-o"]);

    const peeked = peekNextCredential();
    // peek 之后 next 拿到的仍然是同一个
    const actual = nextCredential();
    expect(actual?.providerId).toBe(peeked?.providerId);
  });

  it("没有配置任何 key 时候选链为空", () => {
    expect(buildCredentialChain()).toHaveLength(0);
    expect(nextCredential()).toBeNull();
  });

  it("失败过的 key 降到队尾但不删除", () => {
    setProviderKeys("deepseek", ["sk-bad", "sk-good"]);
    setProviderKeys("openai", ["sk-other"]);

    // 模拟第一个 key 已经失败过
    localStorage.setItem("ai_active_key_deepseek:0", "2");

    const chain = buildCredentialChain("deepseek");
    const deepseekIndexes = chain.filter((c) => c.providerId === "deepseek").map((c) => c.keyIndex);
    // 失败的 index 0 排在 index 1 后面
    expect(deepseekIndexes).toEqual([1, 0]);
  });
});