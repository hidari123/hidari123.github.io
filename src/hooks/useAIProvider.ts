/*
 * @Author: hidari
 * @Date: 2026-05-14 10:07
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-20 15:17:20
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useCallback, useEffect } from "react";
import { AIProvider, getProvider, getDefaultProvider, AI_PROVIDERS } from "@/config/aiProviders";
import { getProviderKeys, hasAnyCredential, registerProviders } from "@/services/keyPool";

// keyPool 需要知道有哪些供应商，但 services 不应该反向依赖 config。
// 注入比在 keyPool 里 import 更干净：config 层保持无依赖。
registerProviders(AI_PROVIDERS);

const CURRENT_PROVIDER_KEY = "ai_current_provider";
const CUSTOM_BASE_URL_KEY = "ai_custom_base_url";
const CUSTOM_MODEL_KEY = "ai_custom_model";

export interface UseAIProviderReturn {
  currentProvider: AIProvider;
  apiKey: string | null;
  /** 该首选供应商下已保存的 key 数量 */
  keyCount: number;
  isConfigured: boolean;
  showSettingsModal: boolean;
  setShowSettingsModal: (show: boolean) => void;
  saveProvider: (provider: AIProvider) => void;
  saveKey: (key: string) => void;
  saveCustomConfig: (baseURL: string, model: string) => void;
  clearConfig: () => void;
  checkConfig: () => boolean;
  getCurrentConfig: () => {
    provider: AIProvider;
    apiKey: string | null;
    apiUrl: string;
    model: string;
  };
}

export function useAIProvider(): UseAIProviderReturn {
  const [currentProviderId, setCurrentProviderId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(CURRENT_PROVIDER_KEY) || getDefaultProvider().id;
    }
    return getDefaultProvider().id;
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const currentProvider = getProvider(currentProviderId) || getDefaultProvider();

  // 首选供应商的 key 列表（第一个即首选）
  const providerKeys = getProviderKeys(currentProviderId);
  const apiKey = providerKeys[0] ?? null;
  const keyCount = providerKeys.length;

  const customBaseURL =
    typeof window !== "undefined" ? localStorage.getItem(CUSTOM_BASE_URL_KEY) : null;

  const customModel = typeof window !== "undefined" ? localStorage.getItem(CUSTOM_MODEL_KEY) : null;

  // 监听 localStorage 变化
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CURRENT_PROVIDER_KEY) {
        setCurrentProviderId(e.newValue || getDefaultProvider().id);
      } else if (e.key?.startsWith("ai_keys_")) {
        // key 池变化：强制重新渲染，让 keyCount / apiKey 更新
        setCurrentProviderId((prev) => prev);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const saveProvider = useCallback((provider: AIProvider) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(CURRENT_PROVIDER_KEY, provider.id);
      setCurrentProviderId(provider.id);
    }
  }, []);

  const saveKey = useCallback(
    (key: string) => {
      if (typeof window !== "undefined") {
        const trimmed = key.trim();
        if (!trimmed) return;
        const existing = getProviderKeys(currentProviderId);
        // 追加而不是覆盖：设置弹窗已经管多 key，这里只做兼容路径
        if (!existing.includes(trimmed)) {
          localStorage.setItem(
            `ai_keys_${currentProviderId}`,
            JSON.stringify([...existing, trimmed]),
          );
        }
        setShowSettingsModal(false);
      }
    },
    [currentProviderId],
  );

  const saveCustomConfig = useCallback((baseURL: string, model: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(CUSTOM_BASE_URL_KEY, baseURL);
      localStorage.setItem(CUSTOM_MODEL_KEY, model);
      setShowSettingsModal(false);
    }
  }, []);

  const clearConfig = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(`ai_keys_${currentProviderId}`);
      // 旧格式也清掉，否则 getProviderKeys 会把它当兜底读回来
      localStorage.removeItem(`ai_provider_key_${currentProviderId}`);
      if (currentProviderId === "custom") {
        localStorage.removeItem(CUSTOM_BASE_URL_KEY);
        localStorage.removeItem(CUSTOM_MODEL_KEY);
      }
    }
  }, [currentProviderId]);

  const checkConfig = useCallback((): boolean => {
    // 关键：只要任何一家配了 key 就算可用。
    // 原先只看 currentProvider，导致「只有 OpenAI 配了但首选是 DeepSeek」
    // 这种情况直接弹设置框，明明有可用凭据却不让用。
    if (hasAnyCredential()) return true;

    window.dispatchEvent(new CustomEvent("open-ai-settings"));
    return false;
  }, []);

  const getCurrentConfig = useCallback(() => {
    // 确定 API URL：自定义用户输入的，或 provider 自带的
    const apiUrl =
      currentProviderId === "custom" ? customBaseURL || "" : currentProvider.baseURL || "";

    // 确定 model：自定义用户输入的，或 provider 的默认 model
    const model =
      currentProviderId === "custom" ? customModel || "" : currentProvider.defaultModel || "";

    return {
      provider: currentProvider,
      apiKey,
      apiUrl,
      model,
    };
  }, [currentProvider, currentProviderId, apiKey, customBaseURL, customModel]);

  return {
    currentProvider,
    apiKey,
    keyCount,
    isConfigured: hasAnyCredential(),
    showSettingsModal,
    setShowSettingsModal,
    saveProvider,
    saveKey,
    saveCustomConfig,
    clearConfig,
    checkConfig,
    getCurrentConfig,
  };
}
