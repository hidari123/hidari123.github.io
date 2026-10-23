/**
 * 多供应商 Key 池
 *
 * 起因：原来一个供应商只能存一个 key（`ai_provider_key_<id>` 覆盖式写入），
 * 而且全站只有 DeepSeek 一个首选，用户没法表达「我有三个 key，
 * DeepSeek 不通了就退到 SiliconFlow」。
 *
 * 这里解决三件事：
 *
 * 1. 一个供应商可以存多个 key（余额不同、限流不同）。
 * 2. 有首选顺序：按用户排的顺序试。
 * 3. 失败自动降级：401/402/403/429 或者网络错误就换下一个，
 *    直到全部试完。
 *
 * 一个刻意的取舍：**只对「换个 key 可能有用」的错误降级**。
 * 400（请求体不合法）、404（模型名错了）这种，换 key 也修不好，
 * 重试三遍只是浪费时间还把错误刷成一屏。所以 4xx 只对
 * 401/402/403/408/429 降级，其余直接抛给上层。
 *
 * 还有一条更重要的：**已经开始输出内容之后不降级**。
 * 流式响应吐出第一个 token 再换供应商，等于把两段回答拼在一起，
 * 用户看到的是自相矛盾的内容。降级只发生在「还没拿到任何内容」的时候。
 */

import { AIProvider, getProvider } from "@/config/aiProviders";

const KEY_POOL_PREFIX = "ai_keys_";
const ACTIVE_KEY_INDEX = "ai_active_key_";
const CUSTOM_BASE_URL_KEY = "ai_custom_base_url";
const CUSTOM_MODEL_KEY = "ai_custom_model";
export const LEGACY_KEY_PREFIX = "ai_provider_key_";

/** 一条凭据：供应商 + 该供应商下的某个 key */
export interface Credential {
  providerId: string;
  /** key 本身，只在内存里流转，不写日志 */
  apiKey: string;
  baseURL: string;
  model: string;
  /** 该 key 下标的第几个。用于同一个供应商内换 key */
  keyIndex: number;
}

/** 本次调用已试过的组合，避免同一个 key 被重复试 */
const triedThisCall = new Set<string>();

/** 读某供应商的所有 key（按用户保存顺序，首选在前） */
export function getProviderKeys(providerId: string): string[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(`${KEY_POOL_PREFIX}${providerId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const keys = parsed.filter((k): k is string => typeof k === "string" && k.length > 0);
        if (keys.length > 0) return keys;
      }
    }
  } catch {
    // 存储损坏时往下走旧格式兼容
  }

  // 旧版本只存了单 key，这里做一次兼容读取，避免升级后用户要重新配
  const legacy = localStorage.getItem(`${LEGACY_KEY_PREFIX}${providerId}`);
  return legacy ? [legacy] : [];
}

export function setProviderKeys(providerId: string, keys: string[]): void {
  if (typeof localStorage === "undefined") return;
  const clean = keys.map((k) => k.trim()).filter(Boolean);
  try {
    if (clean.length === 0) {
      localStorage.removeItem(`${KEY_POOL_PREFIX}${providerId}`);
      // 顺手清掉旧格式，免得以后又被读回来
      localStorage.removeItem(`${LEGACY_KEY_INDEX_SAFE(providerId)}`);
    } else {
      localStorage.setItem(`${KEY_POOL_PREFIX}${providerId}`, JSON.stringify(clean));
    }
  } catch {
    // 配额满：不影响主流程
  }
}

/** 旧格式的 key 是裸存的，这里拼出存储键名 */
function LEGACY_KEY_INDEX_SAFE(providerId: string): string {
  return `${LEGACY_KEY_PREFIX}${providerId}`;
}

/** 某个 key 之前是否失败过（连续失败会被降权，但不会删掉） */
export function getKeyHealth(providerId: string, keyIndex: number): "ok" | "deprioritized" {
  const failures = Number(
    localStorage.getItem(`${ACTIVE_KEY_INDEX}${providerId}:${keyIndex}`) ?? "0",
  );
  return failures > 0 ? "deprioritized" : "ok";
}

function bumpFailures(providerId: string, keyIndex: number): void {
  const k = `${ACTIVE_KEY_INDEX}${providerId}:${keyIndex}`;
  const next = Number(localStorage.getItem(k) ?? "0") + 1;
  try {
    localStorage.setItem(k, String(next));
  } catch {
    // 忽略
  }
}

function clearFailures(providerId: string, keyIndex: number): void {
  try {
    localStorage.removeItem(`${ACTIVE_KEY_INDEX}${providerId}:${keyIndex}`);
  } catch {
    // 忽略
  }
}

/**
 * 哪些错误值得换一个 key 重试。
 *
 * 401/403：key 无效或没权限——换另一个可能有权限
 * 402：欠费——这个 key 确实不能用
 * 429：限流——这是最常见的降级触发，同供应商的另一个 key 往往还通着
 * 408：网关超时——网络问题，换个 key（可能不同出口）也许好
 *
 * 400/404/422 不在列表里：请求体或模型名有问题，换 key 只会重复失败。
 */
export function isFailoverError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;

  const msg = err instanceof Error ? err.message : String(err);

  // 显式标了不重试的错误优先
  if (err instanceof Error && (err as { noRetry?: boolean }).noRetry) return false;

  // 带 HTTP 状态码的错误
  const statusMatch = msg.match(/\b(4\d\d|5\d\d)\b/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    // 5xx 是服务端问题，换 key 没用（同一个服务）
    if (status >= 500) return false;
    return [401, 402, 403, 408, 429].includes(status);
  }

  // 网络层错误：DNS、超时、连接重置、CORS。换个 key 不能修 CORS，
  // 但换供应商（不同域名）有时能绕过，所以放行。
  return /failed to fetch|network|timeout|ECONNRESET|ENOTFOUND|load failed/i.test(msg);
}

/**
 * 组装候选凭据列表，按优先级排序：
 *
 *  1. 所有已配置的供应商，按用户在设置里的顺序（首选项在前）
 *  2. 同一供应商内的多个 key
 *  3. 失败过的 key 排到最后——不删，额度可能第二天就恢复了
 *
 * 这样「DeepSeek 不通 → SiliconFlow」是自动的，用户只管填 key。
 */
export function buildCredentialChain(preferredProviderId?: string): Credential[] {
  if (typeof localStorage === "undefined") return [];

  const chain: Credential[] = [];

  // 首选供应商排最前，其余按 AI_PROVIDERS 的自然顺序
  const order = preferredProviderId
    ? [preferredProviderId, ...getAllConfiguredProviderIds().filter((id) => id !== preferredProviderId)]
    : getAllConfiguredProviderIds();

  for (const providerId of order) {
    const provider = getProvider(providerId);
    if (!provider) continue;

    const keys = getProviderKeys(providerId);
    const baseURL =
      providerId === "custom" ? localStorage.getItem(CUSTOM_BASE_URL_KEY) || "" : provider.baseURL;
    const model =
      providerId === "custom" ? localStorage.getItem(CUSTOM_MODEL_KEY) || "" : provider.defaultModel;

    if (providerId === "custom" && (!baseURL || !model)) continue;

    keys.forEach((apiKey, keyIndex) => {
      chain.push({ providerId, apiKey, baseURL, model, keyIndex });
    });
  }

  // 失败过的排到最后，但保持相对顺序
  return chain
    .map((c) => ({ c, bad: getKeyHealth(c.providerId, c.keyIndex) === "deprioritized" }))
    .sort((a, b) => Number(a.bad) - Number(b.bad))
    .map((x) => x.c);
}

/** 所有已经配了 key 的供应商 id */
export function getAllConfiguredProviderIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  const ids: string[] = [];
  for (const provider of ALL_PROVIDER_IDS) {
    if (getProviderKeys(provider.id).length > 0) ids.push(provider.id);
  }
  return ids;
}

// 避免循环 import，这里只存 id 列表
const ALL_PROVIDER_IDS: AIProvider[] = [];

/** 由 aiProviders 注入，避免 config -> services 的依赖倒挂 */
export function registerProviders(providers: AIProvider[]): void {
  ALL_PROVIDER_IDS.length = 0;
  ALL_PROVIDER_IDS.push(...providers);
}

/** 每次发起新请求前清空「本次已试过」记录 */
export function beginCall(): void {
  triedThisCall.clear();
}

/** 标记并返回「下一个还没试过的候选」，同时登记为已试 */
export function nextCredential(preferredProviderId?: string): Credential | null {
  const chain = buildCredentialChain(preferredProviderId);
  for (const cred of chain) {
    const id = `${cred.providerId}#${cred.keyIndex}`;
    if (triedThisCall.has(id)) continue;
    triedThisCall.add(id);
    return cred;
  }
  return null;
}

/**
 * 只看不取：返回下一个候选但不登记为已试。
 *
 * 用于在真正降级前告诉用户「要切到 SiliconFlow 了」。
 * 不能用 nextCredential + 回滚来代替——triedThisCall 是模块级状态，
 * 中间任何重入都会把它弄脏。
 */
export function peekNextCredential(preferredProviderId?: string): Credential | null {
  const chain = buildCredentialChain(preferredProviderId);
  for (const cred of chain) {
    if (!triedThisCall.has(`${cred.providerId}#${cred.keyIndex}`)) return cred;
  }
  return null;
}

export function markCredentialSuccess(cred: Credential): void {
  clearFailures(cred.providerId, cred.keyIndex);
}

export function markCredentialFailed(cred: Credential): void {
  bumpFailures(cred.providerId, cred.keyIndex);
}

/** 是否有任何可用的凭据 */
export function hasAnyCredential(): boolean {
  return buildCredentialChain().length > 0;
}

export { setProviderKeys as saveProviderKeys };